import type { Invoice } from '../types';

interface Props {
  invoices: Invoice[];
  onSelect: (i: Invoice) => void;
}

export function Pending({ invoices, onSelect }: Props) {
  if (invoices.length === 0) return null;

  return (
    <div className="px-6 pb-6 mt-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-200">⏸ Oczekujące</h2>
          <span className="text-xs text-slate-400">({invoices.length}) — granica miesiąca</span>
        </div>
        <button className="px-3 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
          🔍 Sprawdź teraz
        </button>
      </div>

      <div className="space-y-1.5">
        {invoices.map(inv => (
          <button
            key={inv.id}
            onClick={() => onSelect(inv)}
            className="w-full text-left p-3 rounded-lg bg-amber-950/30 border border-amber-900/50 hover:bg-amber-950/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="text-xl text-amber-400">📅</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{inv.kreisel_ref}</span>
                  {inv.days_waiting !== undefined && (
                    <span className="text-xs text-amber-300/80">
                      czeka {inv.days_waiting} {inv.days_waiting === 1 ? 'dzień' : 'dni'}
                    </span>
                  )}
                </div>
                {inv.hmrc_month_options && inv.hmrc_month_options.length > 0 ? (
                  <div className="text-xs text-slate-400 mt-0.5">
                    Możliwe HMRC: <span className="font-mono text-amber-300">{inv.hmrc_month_options.join(' lub ')}</span>
                  </div>
                ) : inv.pending_message ? (
                  <div className="text-xs text-amber-200 mt-1 leading-snug">
                    {inv.pending_message}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-3 px-1">
        💡 Po pobraniu świeżego Magemar Wiola Helper sprawdzi czy te kontenery już mają ATA.
      </p>
    </div>
  );
}
