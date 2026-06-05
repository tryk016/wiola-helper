import { useState, useMemo } from 'react';
import type { Invoice } from '../types';
import { Sidebar } from './Sidebar';

interface Props {
  history: Invoice[];
  onClose: () => void;
}

const fmtDate = (ms?: number) => {
  if (!ms) return '?';
  const d = new Date(ms);
  return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL').slice(0, 5);
};

const fseSortKey = (ref?: string): number => {
  if (!ref) return Number.MAX_SAFE_INTEGER;
  const m = /FSE-?(\d+)\//i.exec(ref);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

export function HistoryView({ history, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'fse' | 'amount'>('date');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let items = history;
    if (f) {
      items = items.filter(h =>
        (h.kreisel_ref || '').toLowerCase().includes(f) ||
        (h.invoice_no || '').toLowerCase().includes(f) ||
        (h.fileName || '').toLowerCase().includes(f) ||
        (h.container || '').toLowerCase().includes(f)
      );
    }
    const sorted = [...items];
    if (sortBy === 'date') {
      sorted.sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0));
    } else if (sortBy === 'fse') {
      sorted.sort((a, b) => fseSortKey(b.kreisel_ref) - fseSortKey(a.kreisel_ref));
    } else if (sortBy === 'amount') {
      sorted.sort((a, b) => (b.amount_gbp || 0) - (a.amount_gbp || 0));
    }
    return sorted;
  }, [history, filter, sortBy]);

  const totalGbp = filtered.reduce((s, h) => s + (h.amount_gbp || 0), 0);

  // Group by month for nice headers
  const groups = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const h of filtered) {
      const d = h.completed_at ? new Date(h.completed_at) : new Date(0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const arr = map.get(key) || [];
      arr.push(h);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📜</div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Historia faktur</h2>
            <p className="text-xs text-slate-400 leading-tight">
              {filtered.length} z {history.length}
              {filtered.length > 0 && (
                <> · suma: <span className="font-mono text-emerald-300">£{totalGbp.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={async () => {
                if (confirm(`Usunąć całą historię (${history.length} wpisów)? Nieodwracalne.`)) {
                  await window.wiola.clearHistory();
                }
              }}
              className="px-3 py-1.5 rounded-md text-xs bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-900/50 transition-colors"
            >
              🗑 Wyczyść historię
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Zamknij ✕
          </button>
        </div>
      </header>

      {/* Filter / sort bar */}
      <div className="px-6 py-3 border-b border-slate-700 bg-slate-900/50 flex items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Szukaj: FSE, kontener, Invoice number..."
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-ewi-blue focus:outline-none"
        />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400 mr-1">Sortuj:</span>
          {(['date', 'fse', 'amount'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                sortBy === s
                  ? 'bg-ewi-blue text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s === 'date' ? 'Data' : s === 'fse' ? 'Numer FSE' : 'Kwota'}
            </button>
          ))}
        </div>
      </div>

      {/* Two-pane layout: list left, details right */}
      <main className="flex-1 flex overflow-hidden">
        {/* List */}
        <section className="w-1/2 min-w-[500px] overflow-y-auto border-r border-slate-700">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <div className="text-5xl mb-3 opacity-30">📭</div>
              <p className="text-sm">
                {history.length === 0 ? 'Brak historii' : 'Brak wyników'}
              </p>
              <p className="text-xs mt-1 opacity-70">
                {history.length === 0 ? 'Wystaw pierwszą fakturę' : 'Zmień filtr'}
              </p>
            </div>
          ) : (
            <div>
              {groups.map(([monthKey, items]) => {
                const [y, m] = monthKey.split('-');
                const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('pl-PL', {
                  month: 'long',
                  year: 'numeric',
                });
                const monthTotal = items.reduce((s, h) => s + (h.amount_gbp || 0), 0);
                return (
                  <div key={monthKey}>
                    <div className="sticky top-0 z-10 px-6 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{monthName}</span>
                      <span className="text-xs text-slate-500">
                        {items.length} faktur · £{monthTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {items.map(h => {
                      const isSel = selected?.id === h.id;
                      return (
                        <button
                          key={h.id}
                          onClick={() => setSelected(h)}
                          className={`
                            w-full text-left px-6 py-3 border-b border-slate-800 transition-all
                            ${isSel ? 'bg-slate-800' : 'hover:bg-slate-800/50'}
                          `}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-400">✓</span>
                              <span className="font-medium text-sm">{h.kreisel_ref}</span>
                              {h.invoice_no && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 font-mono">
                                  #{h.invoice_no}
                                </span>
                              )}
                            </div>
                            {h.amount_gbp !== undefined && (
                              <span className="font-mono text-sm text-emerald-300">
                                £{h.amount_gbp.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{fmtDate(h.completed_at)}</span>
                            <span>
                              {h.container ? `📦 ${h.container}` : '🚚 truck'} · {h.lines || h.parsed_lines?.length || 0} linii
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Detail */}
        <section className="flex-1 overflow-y-auto bg-slate-950">
          <Sidebar invoice={selected} />
        </section>
      </main>
    </div>
  );
}
