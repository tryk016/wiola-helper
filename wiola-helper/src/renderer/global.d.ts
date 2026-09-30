interface WiolaApi {
  pickPdfs: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  healthCheck: () => Promise<unknown>;
  pickMagemar: () => Promise<{ ok: boolean; canceled?: boolean; source?: string; dest?: string; error?: string }>;
  appVersion: () => Promise<string>;
  openPath: (p: string) => Promise<string>;

  enqueue: (paths: string[]) => Promise<unknown>;
  enqueueForce: (paths: string[]) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  skipDelay: (id: string) => Promise<boolean>;
  resolveAmbiguousMonth: (id: string, hmrcMonth: string) => Promise<unknown>;
  resolveTransport: (id: string, transport: string) => Promise<unknown>;
  confirmTransport: (id: string, opts: { transport: string; hmrcMonth?: string; halt?: boolean }) => Promise<unknown>;
  clearDone: () => Promise<void>;
  clearFailed: () => Promise<void>;
  clearHistory: () => Promise<void>;
  openLogFolder: () => Promise<{ opened: string }>;

  checkForUpdate: () => Promise<{
    hasUpdate: boolean;
    localSha?: string;
    remoteSha?: string;
    remoteMessage?: string;
    remoteDate?: string;
    error?: string;
  }>;
  applyUpdate: () => Promise<{ launched: boolean; error?: string }>;
  getLocalVersion: () => Promise<string | undefined>;

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
  productsList: () => Promise<{ ok: boolean; rows?: import('./types').ProductRow[]; error?: string }>;
  productsExport: (ids: string[]) => Promise<{ ok: boolean; results?: import('./types').ProductExportResult[]; error?: string }>;
  getQueue: () => Promise<unknown>;
  scanAll: () => Promise<{ scanned: number }>;
  uploadAll: (post: boolean) => Promise<{ processed: number; halted?: boolean; haltedAt?: string }>;
  editDraft: (
    id: string,
    edits: { hmrc_rate?: number; lines?: Array<{ ewi_sku: string; qty: number; total_pln: number; raw_desc?: string; is_pallet?: boolean; is_sample?: boolean; is_pigment?: boolean }> },
  ) => Promise<unknown>;

  respondToUnknownSku: (fileId: string, resp: { skip: boolean; mappings?: Record<string, string> }) => Promise<void>;
  pendingRecheck: () => Promise<{ found: number }>;

  on: (channel: string, cb: (...args: unknown[]) => void) => (() => void) | undefined;
}

interface Window {
  wiola: WiolaApi;
}
