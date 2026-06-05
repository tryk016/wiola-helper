interface WiolaApi {
  pickPdfs: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  healthCheck: () => Promise<unknown>;
  appVersion: () => Promise<string>;
  openPath: (p: string) => Promise<string>;

  enqueue: (paths: string[]) => Promise<unknown>;
  enqueueForce: (paths: string[]) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  clearFailed: () => Promise<void>;
  clearHistory: () => Promise<void>;

  getEnv: () => Promise<Record<string, string>>;
  setEnv: (updates: Record<string, string>) => Promise<Record<string, string>>;
  getPrefs: () => Promise<Record<string, unknown>>;
  setPrefs: (updates: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readLog: (lines?: number) => Promise<{ lines: string[]; path: string; error?: string }>;

  qboLogin: (role: 'pro' | 'store') => Promise<{
    ok: boolean;
    realmId?: string;
    refresh_token_preview?: string;
    warning?: string;
    error?: string;
  }>;
  getQueue: () => Promise<unknown>;
  processAll: (post: boolean) => Promise<{ processed: number }>;

  respondToUnknownSku: (fileId: string, resp: { skip: boolean; mappings?: Record<string, string> }) => Promise<void>;
  pendingRecheck: () => Promise<{ found: number }>;

  on: (channel: string, cb: (...args: unknown[]) => void) => (() => void) | undefined;
}

interface Window {
  wiola: WiolaApi;
}
