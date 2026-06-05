interface DuplicateItem {
  file: string;
  previous: { kreisel_ref?: string; completed_at?: number; invoice_no?: string };
}

interface Props {
  duplicates: DuplicateItem[];
  onSkipAll: () => void;
  onForceAll: () => void;
  onClose: () => void;
}

const fmtDate = (ms?: number) => {
  if (!ms) return '?';
  const d = new Date(ms);
  return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL').slice(0, 5);
};

export function DuplicatesModal({ duplicates, onSkipAll, onForceAll, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-amber-700/40 w-full max-w-2xl mx-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="text-3xl">⚠️</div>
            <div>
              <h2 className="text-lg font-semibold">
                Zduplikowane faktury ({duplicates.length})
              </h2>
              <p className="text-xs text-slate-400">
                Te pliki były już raz przetwarzane. Co chcesz zrobić?
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-2">
          {duplicates.map((d, i) => {
            const fileName = d.file.split(/[\\/]/).pop();
            return (
              <div
                key={i}
                className="p-3 rounded-lg bg-amber-950/30 border border-amber-900/50"
              >
                <div className="font-mono text-sm text-amber-200">{fileName}</div>
                <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                  {d.previous.kreisel_ref && (
                    <div>
                      Kreisel: <span className="font-mono">{d.previous.kreisel_ref}</span>
                    </div>
                  )}
                  {d.previous.invoice_no && (
                    <div>
                      EWI Pro Invoice: <span className="font-mono text-emerald-300">#{d.previous.invoice_no}</span>
                    </div>
                  )}
                  {d.previous.completed_at && (
                    <div>Postowane: {fmtDate(d.previous.completed_at)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex items-center justify-between">
          <div className="text-xs text-slate-400 max-w-xs">
            ⚠️ „Wystaw ponownie" stworzy DRUGI komplet dokumentów w QBO — użyj świadomie
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkipAll}
              className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Pomiń (nie wystawiaj)
            </button>
            <button
              onClick={onForceAll}
              className="px-4 py-2 rounded-lg text-sm bg-amber-700 hover:bg-amber-600 text-white transition-colors"
            >
              Wystaw ponownie
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300"
            >
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
