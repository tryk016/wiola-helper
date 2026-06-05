import { create } from 'zustand';
import type { Invoice, Health } from './types';

export interface DuplicateItem {
  file: string;
  previous: { kreisel_ref?: string; completed_at?: number; invoice_no?: string };
}

interface QueueState {
  queue: Invoice[];
  pending: Invoice[];
  history: Invoice[];
  health: Health | null;
  selectedId?: string;
  unknownSkuModal: { fileId: string; unmapped: UnmappedLine[] } | null;
  pendingResolvedModal: ResolvedPending[] | null;
  duplicatesModal: DuplicateItem[] | null;
  historyViewOpen: boolean;
  settingsOpen: boolean;
  logOpen: boolean;

  setState: (s: { queue: Invoice[]; pending: Invoice[]; history?: Invoice[] }) => void;
  setHealth: (h: Health | null) => void;
  select: (id?: string) => void;
  openUnknownSku: (fileId: string, unmapped: UnmappedLine[]) => void;
  closeUnknownSku: () => void;
  openPendingResolved: (items: ResolvedPending[]) => void;
  closePendingResolved: () => void;
  openDuplicates: (items: DuplicateItem[]) => void;
  closeDuplicates: () => void;
  toggleHistoryView: (open?: boolean) => void;
  toggleSettings: (open?: boolean) => void;
  toggleLog: (open?: boolean) => void;
}

export interface UnmappedLine {
  nr: number;
  raw_desc: string;
  qty: number;
  unit_pln: number;
  total_pln: number;
  suggestions: Array<{ code: string; name: string; score: number; times_ordered: number }>;
}

export interface ResolvedPending {
  id: string;
  kreisel_ref?: string;
  container?: string;
  hmrc_month: string;
  ata_uk: string;
}

export const useStore = create<QueueState>((set) => ({
  queue: [],
  pending: [],
  history: [],
  health: null,
  selectedId: undefined,
  unknownSkuModal: null,
  pendingResolvedModal: null,
  duplicatesModal: null,
  historyViewOpen: false,
  settingsOpen: false,
  logOpen: false,

  setState: ({ queue, pending, history }) => set({ queue, pending, ...(history !== undefined && { history }) }),
  setHealth: (h) => set({ health: h }),
  select: (id) => set({ selectedId: id }),
  openUnknownSku: (fileId, unmapped) => set({ unknownSkuModal: { fileId, unmapped } }),
  closeUnknownSku: () => set({ unknownSkuModal: null }),
  openPendingResolved: (items) => set({ pendingResolvedModal: items }),
  closePendingResolved: () => set({ pendingResolvedModal: null }),
  openDuplicates: (items) => set({ duplicatesModal: items }),
  closeDuplicates: () => set({ duplicatesModal: null }),
  toggleHistoryView: (open) => set((s) => ({ historyViewOpen: open ?? !s.historyViewOpen })),
  toggleSettings: (open) => set((s) => ({ settingsOpen: open ?? !s.settingsOpen })),
  toggleLog: (open) => set((s) => ({ logOpen: open ?? !s.logOpen })),
}));
