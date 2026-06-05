import type { Invoice } from '../types';

interface Props {
  invoices: Invoice[];
  stats: { waiting: number; processing: number; done: number; failed: number };
  onProcessAll: () => void;
  onSelect: (i: Invoice) => void;
  onClearDone?: () => void;
  onClearFailed?: () => void;
  onRemove?: (id: string) => void;
  selectedId?: string;
}

const statusBadge = (status: Invoice['status']) => {
  const map: Record<string, { icon: string; color: string; label: string }> = {
    waiting: { icon: '⏳', color: 'text-slate-400', label: 'Oczekuje' },
    parsing: { icon: '🧠', color: 'text-blue-400', label: 'Parsuję' },
    processing: { icon: '⚙️', color: 'text-blue-400', label: 'Procesuję' },
    done: { icon: '✅', color: 'text-emerald-400', label: 'Gotowe' },
    failed: { icon: '❌', color: 'text-red-400', label: 'Błąd' },
    ambiguous: { icon: '⏸', color: 'text-amber-400', label: 'Granica miesiąca' },
    unknown_sku: { icon: '⚠️', color: 'text-amber-400', label: 'Nieznany produkt' },
  };
  return map[status] || map.waiting;
};

export function Queue({ invoices, stats, onProcessAll, onSelect, onClearDone, onClearFailed, onRemove, selectedId }: Props) {
  const hasItems = invoices.length > 0;
  const canProcess = stats.waiting > 0;

  return (
    <div className="px-6 pb-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-200">📋 W kolejce</h2>
          <span className="text-xs text-slate-400">({invoices.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.failed > 0 && onClearFailed && (
            <button
              onClick={onClearFailed}
              className="px-3 py-1.5 rounded-md text-xs bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-900/50 transition-colors"
              title="Usuń wszystkie z błędem"
            >
              ✗ Wyczyść błędy ({stats.failed})
            </button>
          )}
          {stats.done > 0 && onClearDone && (
            <button
              onClick={onClearDone}
              className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Przenieś zakończone do historii"
            >
              🗑 Wyczyść zakończone ({stats.done})
            </button>
          )}
          <button
            onClick={onProcessAll}
            disabled={!canProcess}
            className={`
              px-4 py-1.5 rounded-md text-sm font-medium transition-all
              ${canProcess
                ? 'bg-ewi-green hover:bg-ewi-green-700 text-white shadow-md'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }
            `}
          >
            ✓ Wyślij wszystkie ({stats.waiting})
          </button>
        </div>
      </div>

      {hasItems ? (
        <div className="space-y-1.5">
          {invoices.map(inv => {
            const badge = statusBadge(inv.status);
            const isSelected = inv.id === selectedId;
            const removable = ['failed', 'done', 'waiting', 'unknown_sku'].includes(inv.status);
            return (
              <div
                key={inv.id}
                className={`
                  group flex items-stretch w-full text-left rounded-lg border transition-all
                  ${isSelected
                    ? 'bg-slate-800 border-ewi-blue/50'
                    : 'bg-slate-800/40 border-transparent hover:bg-slate-800 hover:border-slate-700'
                  }
                `}
              >
                <button
                  onClick={() => onSelect(inv)}
                  className="flex-1 text-left p-3 min-w-0"
                >
                  <div className="flex items-center gap-3">
                    <div className={`text-xl ${badge.color}`}>{badge.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">
                          {inv.kreisel_ref || inv.file}
                        </span>
                        {inv.lines !== undefined && (
                          <span className="text-xs text-slate-500 shrink-0">{inv.lines} linii</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className={badge.color}>{badge.label}</span>
                        {inv.amount_gbp !== undefined && (
                          <span className="font-mono text-slate-300">£{inv.amount_gbp.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                        )}
                        {inv.invoice_no && (
                          <span className="text-emerald-400 font-mono">Invoice #{inv.invoice_no}</span>
                        )}
                      </div>
                      {inv.status === 'processing' && inv.progress !== undefined && (
                        <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${inv.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {removable && onRemove && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(inv.id); }}
                    className="px-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all text-lg"
                    title="Usuń z kolejki"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-slate-500 text-sm py-8">
          Brak faktur w kolejce. Przeciągnij PDFy na obszar powyżej.
        </div>
      )}
    </div>
  );
}
