import { useEffect, useMemo, useState } from 'react';
import type { ProductRow, ProductExportResult } from '../types';

interface Props {
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  Service: 'Usługa',
  NonInventory: 'Towar',
  Inventory: 'Magazynowy',
};

export function ProductsView({ onClose }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, ProductExportResult>>({});
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setResults({});
    setSelected(new Set());
    const r = await window.wiola.productsList();
    if (r.ok && r.rows) setRows(r.rows);
    else setError(r.error || 'Nie udało się pobrać produktów');
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Live per-product result while the export runs.
    const unsub = window.wiola.on('products:progress', (...args) => {
      const r = args[0] as ProductExportResult;
      setResults(prev => ({ ...prev, [r.id]: r }));
      if (r.status !== 'error') {
        setRows(prev => prev.map(row => (row.id === r.id ? { ...row, inStore: true } : row)));
        setSelected(prev => {
          const next = new Set(prev);
          next.delete(r.id);
          return next;
        });
      }
    });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter(r =>
      // Rows touched by this export stay visible so their ✓ / ✗ can be read.
      (!onlyMissing || !r.inStore || results[r.id]) &&
      (!f ||
        r.fullName.toLowerCase().includes(f) ||
        r.sku.toLowerCase().includes(f) ||
        r.description.toLowerCase().includes(f))
    );
  }, [rows, filter, onlyMissing, results]);

  const missingCount = rows.filter(r => !r.inStore).length;

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllVisible = () =>
    setSelected(prev => new Set([...prev, ...visible.filter(r => !r.inStore).map(r => r.id)]));

  const exportSelected = async () => {
    const ids = rows.filter(r => selected.has(r.id)).map(r => r.id);
    if (!ids.length) return;
    if (!confirm(`Założyć ${ids.length} produkt(ów) w EWI Store?`)) return;
    setExporting(true);
    setSummary(null);
    const r = await window.wiola.productsExport(ids);
    setExporting(false);
    if (!r.ok || !r.results) {
      setSummary(`❌ ${r.error || 'Eksport nie powiódł się'}`);
      return;
    }
    const count = (s: ProductExportResult['status']) => r.results!.filter(x => x.status === s).length;
    setSummary(`Utworzono: ${count('created')} · już były: ${count('exists')} · błędy: ${count('error')}`);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📦</div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Produkty EWI Pro → EWI Store</h2>
            <p className="text-xs text-slate-400 leading-tight">
              {loading
                ? 'Pobieranie produktów z QuickBooks…'
                : `${rows.length} produktów w Pro · ${missingCount} brakuje w Store · zaznaczono ${selected.size}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading || exporting}
            className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
          >
            🔄 Odśwież
          </button>
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition-colors"
          >
            Zamknij ✕
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-slate-700 bg-slate-900/50 flex items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Szukaj: nazwa, SKU, opis..."
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-ewi-blue focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
          Tylko brakujące w Store
        </label>
        <button
          onClick={selectAllVisible}
          disabled={exporting}
          className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
        >
          ☑ Zaznacz wszystkie
        </button>
        <button
          onClick={() => setSelected(new Set())}
          disabled={exporting}
          className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
        >
          ☐ Odznacz wszystkie
        </button>
      </div>

      {/* List */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">Ładowanie…</div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="text-5xl mb-3 opacity-40">⚠️</div>
            <p className="text-sm text-red-300 max-w-xl">{error}</p>
            <button
              onClick={load}
              className="mt-4 px-4 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <div className="text-5xl mb-3 opacity-30">✅</div>
            <p className="text-sm">{onlyMissing && !filter ? 'Wszystkie produkty z Pro są już w Store' : 'Brak wyników'}</p>
            <p className="text-xs mt-1 opacity-70">
              {onlyMissing ? 'Odznacz „Tylko brakujące w Store”, żeby zobaczyć całą listę' : 'Zmień filtr'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
              <tr className="border-b border-slate-700 text-xs text-slate-400">
                <th className="w-12 py-2" />
                <th className="text-left py-2 pr-4">Nazwa</th>
                <th className="text-left py-2 pr-4">SKU</th>
                <th className="text-left py-2 pr-4">Typ</th>
                <th className="text-left py-2 pr-4">Opis</th>
                <th className="text-left py-2 pr-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visible.map(r => {
                const res = results[r.id];
                const disabled = r.inStore || exporting;
                return (
                  <tr
                    key={r.id}
                    onClick={() => !disabled && toggle(r.id)}
                    className={`${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-800/50'} ${
                      selected.has(r.id) ? 'bg-slate-800/70' : ''
                    }`}
                  >
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        disabled={disabled}
                        onChange={() => toggle(r.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.name}</div>
                      {r.parentName && <div className="text-xs text-slate-500">{r.parentName}</div>}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">{r.sku}</td>
                    <td className="py-2 pr-4 text-xs text-slate-400">{TYPE_LABEL[r.type] || r.type}</td>
                    <td className="py-2 pr-4 text-xs text-slate-400 max-w-md truncate" title={r.description}>
                      {r.description}
                    </td>
                    <td className="py-2 pr-6 text-xs whitespace-nowrap">
                      {res?.status === 'created' ? (
                        <span className="text-emerald-300">✓ Utworzono</span>
                      ) : res?.status === 'exists' ? (
                        <span className="text-slate-400">= Już był w Store</span>
                      ) : res?.status === 'error' ? (
                        <span className="text-red-300 whitespace-normal" title={res.message}>✗ {res.message}</span>
                      ) : r.inStore ? (
                        <span className="text-slate-500">Już jest w Store</span>
                      ) : (
                        <span className="text-sky-300">Nowy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>

      {/* Action bar */}
      <footer className="px-6 py-3 border-t border-slate-700 bg-slate-950 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {exporting ? 'Zakładanie produktów w EWI Store…' : summary || `Zaznaczono ${selected.size} z ${missingCount}`}
        </span>
        <button
          onClick={exportSelected}
          disabled={selected.size === 0 || exporting || loading}
          className="px-5 py-2 rounded-md text-sm font-medium bg-ewi-blue hover:opacity-90 text-white disabled:opacity-40 transition-opacity"
        >
          {exporting ? 'Wysyłanie…' : `Wyślij do EWI Store (${selected.size})`}
        </button>
      </footer>
    </div>
  );
}
