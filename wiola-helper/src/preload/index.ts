import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  // File picking
  pickPdfs: (): Promise<string[]> => ipcRenderer.invoke('pdf:pick'),

  // Drag-and-drop helper — Electron 32+ requires this for file paths
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Queue management
  enqueue: (paths: string[]) => ipcRenderer.invoke('queue:enqueue', paths),
  enqueueForce: (paths: string[]) => ipcRenderer.invoke('queue:enqueueForce', paths),
  remove: (id: string) => ipcRenderer.invoke('queue:remove', id),
  retry: (id: string) => ipcRenderer.invoke('queue:retry', id),
  skipDelay: (id: string) => ipcRenderer.invoke('queue:skipDelay', id),
  resolveAmbiguousMonth: (id: string, hmrcMonth: string) =>
    ipcRenderer.invoke('pending:resolveMonth', id, hmrcMonth),
  resolveTransport: (id: string, transport: string) =>
    ipcRenderer.invoke('queue:resolveTransport', id, transport),
  confirmTransport: (id: string, opts: { transport: string; hmrcMonth?: string; halt?: boolean }) =>
    ipcRenderer.invoke('queue:confirmTransport', id, opts),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),
  getLocalVersion: () => ipcRenderer.invoke('update:localVersion'),
  clearDone: () => ipcRenderer.invoke('queue:clearDone'),
  clearFailed: () => ipcRenderer.invoke('queue:clearFailed'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Settings
  getEnv: () => ipcRenderer.invoke('settings:getEnv'),
  setEnv: (updates: Record<string, string>) => ipcRenderer.invoke('settings:setEnv', updates),
  getPrefs: () => ipcRenderer.invoke('settings:getPrefs'),
  setPrefs: (updates: Record<string, unknown>) => ipcRenderer.invoke('settings:setPrefs', updates),

  readLog: (lines?: number) => ipcRenderer.invoke('log:read', lines),

  qboLogin: (role: 'pro' | 'store') => ipcRenderer.invoke('qbo:oauthLogin', role),
  getQueue: () => ipcRenderer.invoke('queue:state'),
  scanAll: () => ipcRenderer.invoke('queue:scanAll'),
  uploadAll: (post: boolean) => ipcRenderer.invoke('queue:uploadAll', post),
  editDraft: (
    id: string,
    edits: { hmrc_rate?: number; lines?: Array<{ ewi_sku: string; qty: number; total_pln: number; raw_desc?: string; is_pallet?: boolean; is_sample?: boolean; is_pigment?: boolean }> },
  ) => ipcRenderer.invoke('queue:editDraft', id, edits),

  // Unknown SKU dialog response
  respondToUnknownSku: (fileId: string, resp: { skip: boolean; mappings?: Record<string, string> }) =>
    ipcRenderer.invoke('modal:unknownSku:respond', fileId, resp),

  // Pending wstrzymane re-check
  pendingRecheck: () => ipcRenderer.invoke('pending:recheck'),

  // Health
  healthCheck: () => ipcRenderer.invoke('health:check'),
  pickMagemar: () => ipcRenderer.invoke('magemar:pick'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  openLogFolder: () => ipcRenderer.invoke('support:openLogFolder'),

  // Event subscription
  on: (channel: string, cb: (...args: unknown[]) => void): (() => void) | undefined => {
    const allowed = ['queue:state', 'modal:unknownSku', 'modal:pendingResolved', 'modal:duplicates'];
    if (!allowed.includes(channel)) return undefined;
    const listener = (_: unknown, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('wiola', api);

declare global {
  interface Window {
    wiola: typeof api;
  }
}
