import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InvoiceQueue, type InvoiceState } from './queue';
import { runPipeline } from './pipeline';
import { qboClient, magemarLookup } from './system-modules';
import { maskedEnv, writeEnv, readPrefs, writePrefs, type EnvVars, type AppPrefs } from './settings';
import { startOauthFlow } from './qbo-oauth';
import { checkForUpdate, applyUpdate, getLocalSha } from './updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;

// Random delay manager — between invoice posts, we sleep [min..max] minutes
// so QBO history doesn't show "20 bills posted in 1 minute" (audit red flag).
// User can click "Wyślij teraz" on the delayed invoice to skip the wait.
const delaySkippers = new Map<string, () => void>();
function sleepWithSkip(invoiceId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      delaySkippers.delete(invoiceId);
      resolve();
    }, ms);
    delaySkippers.set(invoiceId, () => {
      clearTimeout(timer);
      delaySkippers.delete(invoiceId);
      resolve();
    });
  });
}

// Global safety nets so a stray exception (e.g. "Object has been destroyed"
// from a stale setTimeout reaching a closed BrowserWindow) does NOT take down
// the whole app with the system "A JavaScript error occurred" dialog.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
const queue = new InvoiceQueue();

// In production: remove the default Electron menu entirely (no File/Edit/View/
// Window/Help bar, no "Toggle DevTools" shortcut). In dev: keep it.
if (!IS_DEV) Menu.setApplicationMenu(null);
const pendingUnknownSku = new Map<string, (resp: { skip: boolean; mappings?: Record<string, string> }) => void>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Wiola Helper',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: IS_DEV,   // PRODUCTION: DevTools cannot open — closes any error console pop-up
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Belt-and-braces: even if something tries to open DevTools (e.g. a runtime
  // exception, third-party code, or a stale dev build), close it immediately
  // in production. Combined with devTools:false this is double protection.
  if (!IS_DEV) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  if (IS_DEV) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// Wire queue events to renderer
queue.on('change', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('queue:state', queue.state());
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============== IPC handlers ==============

ipcMain.handle('pdf:pick', async () => {
  if (!mainWindow) return [];
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz faktury Kreisla',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  return r.filePaths;
});

ipcMain.handle('queue:enqueue', (_, paths: string[]) => {
  // Detect duplicates BEFORE adding — return list of suspects for renderer to confirm
  const duplicates: Array<{ file: string; previous: { kreisel_ref?: string; completed_at?: number; invoice_no?: string } }> = [];
  const safePaths: string[] = [];
  for (const p of paths) {
    const dup = queue.isDuplicate(p);
    if (dup) {
      duplicates.push({
        file: p,
        previous: {
          kreisel_ref: dup.kreisel_ref,
          completed_at: dup.completed_at,
          invoice_no: dup.invoice_no,
        },
      });
    } else {
      safePaths.push(p);
    }
  }
  if (safePaths.length) queue.enqueue(safePaths);
  if (duplicates.length && mainWindow) {
    mainWindow.webContents.send('modal:duplicates', duplicates);
  }
  return { state: queue.state(), duplicates };
});

// Resolve duplicate decision from renderer (force-process or skip)
ipcMain.handle('queue:enqueueForce', (_, paths: string[]) => {
  queue.enqueue(paths);
  return queue.state();
});

ipcMain.handle('queue:retry', (_, id: string) => {
  queue.retry(id);
  return queue.state();
});

ipcMain.handle('pending:resolveMonth', (_, id: string, hmrcMonth: string) => {
  queue.resolveAmbiguous(id, hmrcMonth);
  return queue.state();
});

ipcMain.handle('queue:resolveTransport', (_, id: string, transport: string) => {
  queue.resolveMissingTransport(id, transport);
  return queue.state();
});

ipcMain.handle('queue:confirmTransport', (_, id: string, opts: { transport: string; hmrcMonth?: string; halt?: boolean }) => {
  queue.confirmTransport(id, opts);
  return queue.state();
});

ipcMain.handle('update:check', () => checkForUpdate());
ipcMain.handle('update:apply', () => applyUpdate());
ipcMain.handle('update:localVersion', () => getLocalSha());

ipcMain.handle('queue:remove', (_, id: string) => {
  queue.remove(id);
});

ipcMain.handle('queue:clearDone', () => {
  queue.clearAllDone();
});

ipcMain.handle('queue:clearFailed', () => {
  queue.clearAllFailed();
});

ipcMain.handle('history:clear', () => {
  queue.clearHistory();
});

ipcMain.handle('queue:state', () => queue.state());

ipcMain.handle('queue:processAll', async (_, post: boolean) => {
  // Phase 1: discover (parse just enough to get kreisel_ref) — for those without it yet
  const waiting = queue.state().queue.filter(q => q.status === 'waiting');
  if (!waiting.length) return { processed: 0 };

  // Quick-parse missing kreisel_refs (just to know sort order)
  for (const inv of waiting) {
    if (inv.kreisel_ref) continue;
    queue.update({ id: inv.id, status: 'parsing', progress: 5 });
    try {
      const k = await (await import('./system-modules')).parseKreiselWithLlm(inv.file) as { kreisel_ref?: string; invoice_no: string };
      queue.update({ id: inv.id, kreisel_ref: k.kreisel_ref || `FSE-${k.invoice_no}`, status: 'waiting' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queue.update({ id: inv.id, status: 'failed', error: `Discovery: ${msg}` });
    }
  }

  // Phase 2: sort by Kreisel invoice number ASCENDING
  // Extracts "201" from "FSE-201/2026/EXP"
  const sortKey = (ref: string): number => {
    const m = /FSE-?(\d+)\//i.exec(ref || '');
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };

  const sorted = queue
    .state()
    .queue.filter(q => q.status === 'waiting' && q.kreisel_ref)
    .sort((a, b) => sortKey(a.kreisel_ref!) - sortKey(b.kreisel_ref!));

  // Phase 3: post serially, HALT on any failure to preserve Kreisel/EWI Pro numbering correlation
  // Between successful posts, insert a random delay (anti-automation pattern).
  const prefs = readPrefs();
  const delayMinMs = Math.max(0, prefs.delayMinMinutes * 60_000);
  const delayMaxMs = Math.max(delayMinMs, prefs.delayMaxMinutes * 60_000);
  // Dry-run mode skips delays entirely (nothing reaches QBO so audit risk = 0)
  const delaysEnabled = post && delayMaxMs > 0;

  let processed = 0;
  let halted = false;
  let haltedAt: string | undefined;
  let postsSinceStart = 0;
  for (let i = 0; i < sorted.length; i++) {
    const inv = sorted[i];
    if (halted) {
      queue.update({ id: inv.id, status: 'waiting', error: `Wstrzymane — czeka na ${haltedAt}` });
      continue;
    }

    // Random delay BEFORE each successful post except the very first.
    // We do it before so the next-up invoice visibly shows "Następna za X min".
    if (delaysEnabled && postsSinceStart > 0) {
      const range = delayMaxMs - delayMinMs;
      const delay = delayMinMs + Math.floor(Math.random() * (range + 1));
      const until = Date.now() + delay;
      queue.update({ id: inv.id, status: 'delay', delay_until: until });
      console.log(`[delay] ${inv.kreisel_ref} - czekam ${Math.round(delay/60_000)} min (do ${new Date(until).toLocaleTimeString()})`);
      await sleepWithSkip(inv.id, delay);
      queue.update({ id: inv.id, status: 'waiting', delay_until: undefined });
    }

    await runPipeline(inv.id, inv.file, post, {
      onProgress: (patch) => queue.update(patch as Partial<InvoiceState>),
      onUnknownSku: ({ fileId, unmapped }) => new Promise(resolve => {
        pendingUnknownSku.set(fileId, resolve);
        mainWindow?.webContents.send('modal:unknownSku', { fileId, unmapped });
      }),
    }, {
      manualHmrcMonth: inv.manual_hmrc_month,
      manualContainer: inv.manual_container,
    });
    const inAfter = queue.state().queue.find(q => q.id === inv.id) || queue.state().pending.find(p => p.id === inv.id);
    if (inAfter && ['failed', 'ambiguous', 'unknown_sku', 'missing_transport', 'awaiting_transport_confirm'].includes(inAfter.status)) {
      halted = true;
      haltedAt = inv.kreisel_ref;
      console.warn(`Halted at ${inv.kreisel_ref} (status=${inAfter.status}); remaining ${sorted.length - processed - 1} held.`);
    }
    processed++;
    postsSinceStart++;
  }

  return { processed, halted, haltedAt };
});

// Skip a delay — user clicked "Wyślij teraz" on a delayed invoice.
ipcMain.handle('queue:skipDelay', (_, id: string) => {
  const skip = delaySkippers.get(id);
  if (skip) skip();
  return true;
});

ipcMain.handle('modal:unknownSku:respond', (_, fileId: string, resp: { skip: boolean; mappings?: Record<string, string> }) => {
  const r = pendingUnknownSku.get(fileId);
  if (r) { r(resp); pendingUnknownSku.delete(fileId); }
});

ipcMain.handle('health:check', async () => {
  const magemarPath = 'C:/kreisel/magemar.xlsx';
  let magemar = { ok: false, age_hours: 999, path: magemarPath };
  try {
    if (fs.existsSync(magemarPath)) {
      const stat = fs.statSync(magemarPath);
      magemar = {
        ok: true,
        age_hours: (Date.now() - stat.mtime.getTime()) / 3600000,
        path: magemarPath,
      };
    }
  } catch {}

  let qbo = { pro: 'unknown', store: 'unknown', env: process.env.QBO_ENV || 'sandbox' };
  try {
    // Quick ping — just resolve client (refreshes tokens)
    await qboClient.getClient('pro');
    qbo.pro = 'ok';
  } catch { qbo.pro = 'error'; }
  try {
    await qboClient.getClient('store');
    qbo.store = 'ok';
  } catch { qbo.store = 'error'; }

  return { magemar, qbo };
});

ipcMain.handle('pending:recheck', async () => {
  // Reload Magemar
  try { await magemarLookup.loadIndex(); } catch {}

  // For each pending invoice with container, check if Magemar now has ATA
  // TODO: full implementation — for now just emits modal-trigger for first match
  const updates: InvoiceState[] = [];
  for (const p of queue.state().pending) {
    if (!p.container) continue;
    try {
      const r = await magemarLookup.lookupContainer(p.container);
      if (r.status === 'ok' && r.hmrc_month) {
        updates.push({ ...p, hmrc_month: r.hmrc_month, ata_uk: r.ata_uk });
      }
    } catch {}
  }
  if (updates.length && mainWindow) {
    mainWindow.webContents.send('modal:pendingResolved', updates);
  }
  return { found: updates.length };
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('settings:getEnv', () => maskedEnv());
ipcMain.handle('settings:setEnv', (_, updates: Partial<EnvVars>) => {
  writeEnv(updates);
  return maskedEnv();
});
ipcMain.handle('settings:getPrefs', () => readPrefs());
ipcMain.handle('settings:setPrefs', (_, updates: Partial<AppPrefs>) => writePrefs(updates));

ipcMain.handle('qbo:oauthLogin', async (_, role: 'pro' | 'store') => {
  if (!mainWindow) throw new Error('Main window unavailable');
  return await startOauthFlow(mainWindow, role);
});

ipcMain.handle('shell:openPath', (_, p: string) => {
  const { shell } = require('electron');
  return shell.openPath(p);
});

ipcMain.handle('support:openLogFolder', () => {
  const { shell } = require('electron');
  // Show the log file in Explorer (selected)
  const logPath = 'C:/kreisel/log.txt';
  if (fs.existsSync(logPath)) {
    shell.showItemInFolder(logPath);
    return { opened: logPath };
  }
  // Fall back to the kreisel root folder
  shell.openPath('C:/kreisel');
  return { opened: 'C:/kreisel' };
});

ipcMain.handle('log:read', (_, lines: number = 500) => {
  const logPath = 'C:/kreisel/log.txt';
  try {
    if (!fs.existsSync(logPath)) return { lines: [], path: logPath };
    const content = fs.readFileSync(logPath, 'utf8');
    const all = content.split('\n').filter(Boolean);
    return { lines: all.slice(-lines), path: logPath };
  } catch (e) {
    return { lines: [], path: logPath, error: (e as Error).message };
  }
});
