// Queue state — source of truth in main process. Renderer subscribes via IPC.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type InvoiceStatus =
  | 'waiting' | 'parsing' | 'processing' | 'done' | 'failed'
  | 'ambiguous' | 'unknown_sku';

export interface ParsedLine {
  ewi_sku: string;
  qty: number;
  unit_pln: number;
  total_pln: number;
  amount_gbp?: number;
  rate_gbp?: number;
  raw_desc?: string;
  is_pallet?: boolean;
  is_sample?: boolean;
  is_pigment?: boolean;
}

export interface InvoiceState {
  id: string;
  file: string;          // absolute path
  fileName: string;      // basename
  status: InvoiceStatus;
  progress?: number;
  kreisel_ref?: string;
  invoice_no?: string;
  amount_pln?: number;
  amount_gbp?: number;
  lines?: number;        // count (for backward compat)
  parsed_lines?: ParsedLine[];  // full line data for sidebar
  hmrc_month?: string;
  hmrc_rate?: number;
  hmrc_month_options?: string[];
  ata_uk?: string;
  predicted_ata_uk?: string;
  container?: string;
  resolver_source?: string;
  resolver_confidence?: string;
  error?: string;
  pro_bill_id?: string;
  store_bill_id?: string;
  dry_run?: boolean;
  days_waiting?: number;
  added_at?: number;     // unix ms
  completed_at?: number; // unix ms — when moved to history
  unmapped_lines?: unknown[];
}

const STATE_DIR = path.join(app.getPath('userData'), 'state');
const QUEUE_FILE = path.join(STATE_DIR, 'queue.json');
const PENDING_FILE = path.join(STATE_DIR, 'pending.json');
const HISTORY_FILE = path.join(STATE_DIR, 'history.json');
const AUTO_ARCHIVE_AFTER_MS = 30_000; // 30s after done → move to history

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

export class InvoiceQueue extends EventEmitter {
  queue: InvoiceState[] = [];
  pending: InvoiceState[] = [];   // wstrzymane — ambiguous_month or unknown_sku awaiting input
  history: InvoiceState[] = [];   // completed invoices

  private archiveTimer?: NodeJS.Timeout;

  constructor() {
    super();
    ensureDir();
    this.load();
    // Periodic auto-archive of done items
    this.archiveTimer = setInterval(() => this.archiveDone(), 10_000);
  }

  load() {
    try {
      if (fs.existsSync(QUEUE_FILE)) this.queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch {}
    try {
      if (fs.existsSync(PENDING_FILE)) this.pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    } catch {}
    try {
      if (fs.existsSync(HISTORY_FILE)) this.history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {}
    // Update days_waiting on pending
    const now = Date.now();
    for (const p of this.pending) {
      if (p.added_at) p.days_waiting = Math.floor((now - p.added_at) / 86400000);
    }
    // Migrate any done items in queue → history immediately (cleanup from older versions)
    this.archiveDone(true);
  }

  save() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2));
      fs.writeFileSync(PENDING_FILE, JSON.stringify(this.pending, null, 2));
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (e) {
      console.error('queue save failed', e);
    }
  }

  // Move done invoices to history. `immediate=true` archives all done regardless of timestamp.
  archiveDone(immediate = false) {
    const now = Date.now();
    const toArchive: InvoiceState[] = [];
    this.queue = this.queue.filter(q => {
      if (q.status === 'done') {
        // Archive if: immediate flag, OR no completed_at (legacy), OR past threshold
        if (immediate || !q.completed_at || now - q.completed_at >= AUTO_ARCHIVE_AFTER_MS) {
          // Backfill completed_at if missing (for legacy items)
          if (!q.completed_at) q.completed_at = now;
          toArchive.push(q);
          return false;
        }
      }
      return true;
    });
    if (toArchive.length) {
      this.history.push(...toArchive);
      if (this.history.length > 1000) {
        this.history = this.history.slice(-1000);
      }
      this.save();
      this.emit('change');
    }
  }

  // Manually clear all done items
  clearAllDone() {
    this.archiveDone(true);
  }

  // Wipe entire history (with confirmation in UI)
  clearHistory() {
    this.history = [];
    this.save();
    this.emit('change');
  }

  // Remove all failed items from queue (drop, don't archive)
  clearAllFailed() {
    const before = this.queue.length;
    this.queue = this.queue.filter(q => q.status !== 'failed');
    if (this.queue.length !== before) {
      this.save();
      this.emit('change');
    }
  }

  // Find previous successful posting of a given Kreisel ref
  findInHistory(kreisel_ref: string): InvoiceState | undefined {
    return this.history.find(h => h.kreisel_ref === kreisel_ref && h.status === 'done');
  }

  // Check if file would be a duplicate of something already processed
  isDuplicate(file: string): InvoiceState | undefined {
    const fileName = path.basename(file);
    // Check by exact filename + check history for FSE match (after parsing we'll know better)
    return this.history.find(
      (h) => h.fileName === fileName && h.status === 'done'
    );
  }

  enqueue(filePaths: string[]): InvoiceState[] {
    const added: InvoiceState[] = [];
    for (const f of filePaths) {
      const fileName = path.basename(f);
      // avoid duplicate by file path
      if (this.queue.some(q => q.file === f) || this.pending.some(p => p.file === f)) continue;
      const inv: InvoiceState = {
        id: randomUUID(),
        file: f,
        fileName,
        status: 'waiting',
        added_at: Date.now(),
      };
      this.queue.push(inv);
      added.push(inv);
    }
    if (added.length) {
      this.save();
      this.emit('change');
    }
    return added;
  }

  update(patch: Partial<InvoiceState>) {
    if (!patch.id) return;
    let inv = this.queue.find(q => q.id === patch.id);
    let inPending = false;
    if (!inv) {
      inv = this.pending.find(p => p.id === patch.id);
      inPending = !!inv;
    }
    if (!inv) return;

    Object.assign(inv, patch);

    // If status changed to ambiguous → move to pending
    if (patch.status === 'ambiguous' && !inPending) {
      this.queue = this.queue.filter(q => q.id !== inv!.id);
      this.pending.push(inv);
    }
    // If pending invoice now succeeded → move back to queue
    if (patch.status === 'done' && inPending) {
      this.pending = this.pending.filter(p => p.id !== inv!.id);
      this.queue.push(inv);
    }
    // Mark completion timestamp for auto-archive
    if (patch.status === 'done' && !inv.completed_at) {
      inv.completed_at = Date.now();
    }
    this.save();
    this.emit('change');
  }

  remove(id: string) {
    this.queue = this.queue.filter(q => q.id !== id);
    this.pending = this.pending.filter(p => p.id !== id);
    this.save();
    this.emit('change');
  }

  clearDone() {
    this.queue = this.queue.filter(q => q.status !== 'done');
    this.save();
    this.emit('change');
  }

  state() {
    return { queue: this.queue, pending: this.pending, history: this.history };
  }
}
