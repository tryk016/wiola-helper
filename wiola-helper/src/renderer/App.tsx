import { useEffect, useState } from 'react';
import { DropZone } from './components/DropZone';
import { Queue } from './components/Queue';
import { Pending } from './components/Pending';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { DraftEditor } from './components/DraftEditor';
import { UnknownSkuModal } from './components/UnknownSkuModal';
import { PendingResolvedModal } from './components/PendingResolvedModal';
import { DuplicatesModal } from './components/DuplicatesModal';
import { ChooseMonthModal } from './components/ChooseMonthModal';
import { MissingTransportModal } from './components/MissingTransportModal';
import { ConfirmTransportModal } from './components/ConfirmTransportModal';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { LogView } from './components/LogView';
import { useStore, type ResolvedPending, type UnmappedLine, type DuplicateItem } from './store';
import type { Invoice, Health } from './types';

export function App() {
  const store = useStore();
  const [chooseMonthFor, setChooseMonthFor] = useState<Invoice | null>(null);
  const [missingTransportFor, setMissingTransportFor] = useState<Invoice | null>(null);
  const [confirmTransportFor, setConfirmTransportFor] = useState<Invoice | null>(null);

  // Auto-open the confirm-transport modal as soon as the pipeline halts on
  // a fresh awaiting_transport_confirm. We use the currently selected
  // invoice's status as a trigger so the modal shows for the first item
  // hitting that state in a batch — the user can still click later items
  // manually if multiple end up there.
  useEffect(() => {
    const pending = store.queue.find(q => q.status === 'awaiting_transport_confirm');
    if (pending && !confirmTransportFor) setConfirmTransportFor(pending);
  }, [store.queue, confirmTransportFor]);

  useEffect(() => {
    // Initial state
    window.wiola.getQueue().then((s) => store.setState(s as { queue: Invoice[]; pending: Invoice[] }));
    window.wiola.healthCheck().then((h) => store.setHealth(h as Health));

    // Refresh health every 60s
    const healthTimer = setInterval(() => {
      window.wiola.healthCheck().then((h) => store.setHealth(h as Health));
    }, 60_000);

    // Subscribe to queue changes
    const unsubQueue = window.wiola.on('queue:state', (...args) => {
      const s = args[0] as { queue: Invoice[]; pending: Invoice[] };
      store.setState(s);
    });

    // Unknown SKU modal trigger
    const unsubUnknown = window.wiola.on('modal:unknownSku', (...args) => {
      const data = args[0] as { fileId: string; unmapped: UnmappedLine[] };
      store.openUnknownSku(data.fileId, data.unmapped);
    });

    // Pending resolved trigger
    const unsubResolved = window.wiola.on('modal:pendingResolved', (...args) => {
      const items = args[0] as ResolvedPending[];
      store.openPendingResolved(items);
    });

    // Duplicate detection trigger
    const unsubDups = window.wiola.on('modal:duplicates', (...args) => {
      const items = args[0] as DuplicateItem[];
      store.openDuplicates(items);
    });

    // Auto re-check pending on startup (give Magemar lookup a moment to settle)
    setTimeout(() => {
      window.wiola.pendingRecheck();
    }, 2000);

    return () => {
      clearInterval(healthTimer);
      unsubQueue?.();
      unsubUnknown?.();
      unsubResolved?.();
      unsubDups?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = async (files: string[]) => {
    await window.wiola.enqueue(files);
  };

  const handlePickFiles = async () => {
    const files = await window.wiola.pickPdfs();
    if (files?.length) await window.wiola.enqueue(files);
  };

  const handleScanAll = async () => {
    // Phase 1: parse + resolve + cost everything, no posting.
    await window.wiola.scanAll();
  };

  const handleUploadAll = async () => {
    // Phase 2: post the scanned (and possibly edited) drafts to QBO.
    await window.wiola.uploadAll(true);
  };

  const handlePickMagemar = async () => {
    const res = await window.wiola.pickMagemar();
    if (res?.ok) {
      const h = await window.wiola.healthCheck();
      store.setHealth(h as Health);
    } else if (res && !res.canceled && res.error) {
      alert('Nie udało się wczytać Magemar: ' + res.error);
    }
  };

  const stats = {
    waiting: store.queue.filter(q => q.status === 'waiting').length,
    processing: store.queue.filter(q => ['parsing', 'processing'].includes(q.status)).length,
    done: store.queue.filter(q => q.status === 'done').length,
    failed: store.queue.filter(q => q.status === 'failed').length,
    ready: store.queue.filter(q => q.status === 'ready').length,
  };

  const selectedInvoice =
    store.queue.find(q => q.id === store.selectedId) ||
    store.pending.find(p => p.id === store.selectedId) ||
    null;

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100">
      <header className="drag-region flex items-center justify-between px-6 py-3 border-b border-slate-700 bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-ewi-green to-ewi-blue flex items-center justify-center font-bold text-white text-lg shadow-lg">W</div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Wiola Helper</h1>
            <p className="text-xs text-slate-400 leading-tight">Kreisel → EWI Pro → EWI Store</p>
          </div>
        </div>
        <StatusBar health={store.health} onPickMagemar={handlePickMagemar} />
      </header>

      <main className="flex-1 flex overflow-hidden">
        <section className="w-1/2 min-w-[600px] flex flex-col border-r border-slate-700 overflow-y-auto">
          <DropZone onDrop={handleDrop} onPickFiles={handlePickFiles} />
          <Queue
            invoices={store.queue}
            stats={stats}
            onScanAll={handleScanAll}
            onUploadAll={handleUploadAll}
            onSelect={(inv) => {
              store.select(inv.id);
              if (inv.status === 'missing_transport') setMissingTransportFor(inv);
              if (inv.status === 'awaiting_transport_confirm') setConfirmTransportFor(inv);
            }}
            onClearDone={async () => { await window.wiola.clearDone(); }}
            onClearFailed={async () => { await window.wiola.clearFailed(); }}
            onRemove={async (id) => { await window.wiola.remove(id); }}
            onRetry={async (id) => { await window.wiola.retry(id); }}
            selectedId={store.selectedId}
          />
          <Pending
            invoices={store.pending}
            onSelect={(inv) => { store.select(inv.id); setChooseMonthFor(inv); }}
          />
        </section>

        <section className="flex-1 overflow-y-auto bg-slate-950">
          {selectedInvoice?.status === 'ready' && selectedInvoice.scan
            ? <DraftEditor invoice={selectedInvoice} />
            : <Sidebar invoice={selectedInvoice} />}
        </section>
      </main>

      <footer className="px-6 py-2 border-t border-slate-700 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <button
            onClick={() => store.toggleHistoryView(true)}
            className="hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            📜 Historia
            {store.history.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                {store.history.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => store.toggleLog(true)}
            className="hover:text-slate-200 transition-colors flex items-center gap-1"
          >
            📜 Log
          </button>
          <button
            onClick={() => store.toggleSettings(true)}
            className="hover:text-slate-200 transition-colors flex items-center gap-1"
          >
            ⚙️ Ustawienia
          </button>
          <span className="font-mono">v0.1.0</span>
        </div>
      </footer>

      {/* Modals */}
      {store.unknownSkuModal && (
        <UnknownSkuModal
          fileId={store.unknownSkuModal.fileId}
          unmapped={store.unknownSkuModal.unmapped}
          onResolve={(resp) => window.wiola.respondToUnknownSku(store.unknownSkuModal!.fileId, resp)}
          onClose={() => store.closeUnknownSku()}
        />
      )}
      {store.pendingResolvedModal && (
        <PendingResolvedModal
          items={store.pendingResolvedModal}
          onClose={() => store.closePendingResolved()}
          onAcceptAll={async () => {
            await window.wiola.scanAll();
          }}
        />
      )}
      {store.duplicatesModal && (
        <DuplicatesModal
          duplicates={store.duplicatesModal}
          onSkipAll={() => store.closeDuplicates()}
          onForceAll={async () => {
            const paths = store.duplicatesModal!.map(d => d.file);
            await window.wiola.enqueueForce(paths);
            store.closeDuplicates();
          }}
          onClose={() => store.closeDuplicates()}
        />
      )}
      {chooseMonthFor && (
        <ChooseMonthModal
          invoice={chooseMonthFor}
          onClose={() => setChooseMonthFor(null)}
          onPick={async (m) => { await window.wiola.resolveAmbiguousMonth(chooseMonthFor.id, m); }}
        />
      )}
      {missingTransportFor && (
        <MissingTransportModal
          invoice={missingTransportFor}
          onClose={() => setMissingTransportFor(null)}
          onSubmit={async (transport) => { await window.wiola.resolveTransport(missingTransportFor.id, transport); }}
        />
      )}
      {confirmTransportFor && (
        <ConfirmTransportModal
          invoice={confirmTransportFor}
          onClose={() => setConfirmTransportFor(null)}
          onSubmit={async (opts) => { await window.wiola.confirmTransport(confirmTransportFor.id, opts); }}
        />
      )}
      {store.historyViewOpen && (
        <HistoryView
          history={store.history}
          onClose={() => store.toggleHistoryView(false)}
        />
      )}
      {store.settingsOpen && (
        <SettingsView onClose={() => store.toggleSettings(false)} />
      )}
      {store.logOpen && (
        <LogView onClose={() => store.toggleLog(false)} />
      )}
    </div>
  );
}
