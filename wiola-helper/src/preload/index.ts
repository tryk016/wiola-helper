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
  processAll: (post: boolean) => ipcRenderer.invoke('queue:processAll', post),

  // Unknown SKU dialog response
  respondToUnknownSku: (fileId: string, resp: { skip: boolean; mappings?: Record<string, string> }) =>
    ipcRenderer.invoke('modal:unknownSku:respond', fileId, resp),

  // Pending wstrzymane re-check
  pendingRecheck: () => ipcRenderer.invoke('pending:recheck'),

  // Health
  healthCheck: () => ipcRenderer.invoke('health:check'),
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
