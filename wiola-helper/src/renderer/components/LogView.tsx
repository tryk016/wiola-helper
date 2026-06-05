import { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

export function LogView({ onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [path, setPath] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const refresh = () => {
      window.wiola.readLog(500).then(r => {
        setLines(r.lines);
        setPath(r.path);
      });
    };
    refresh();
    if (autoRefresh) {
      const timer = setInterval(refresh, 3000);
      return () => clearInterval(timer);
    }
  }, [autoRefresh]);

  const filtered = filter
    ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  const colorize = (line: string) => {
    if (/error|failed|BŁĄD|błąd|❌/i.test(line)) return 'text-red-300';
    if (/posted|OK|✅|✓/i.test(line)) return 'text-emerald-300';
    if (/wstrzymane|ambiguous|⏸/i.test(line)) return 'text-amber-300';
    if (/dry-run|🟡/i.test(line)) return 'text-blue-300';
    return 'text-slate-400';
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📜</div>
          <div>
            <h2 className="text-base font-semibold">Log aplikacji</h2>
            <p className="text-xs text-slate-400 font-mono">{path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-400 mr-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Zamknij ✕
          </button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-slate-700 bg-slate-900/50">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtruj: FSE, error, ok..."
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-ewi-blue focus:outline-none font-mono"
        />
      </div>

      <main className="flex-1 overflow-y-auto bg-slate-950 p-4 font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            {lines.length === 0 ? 'Log pusty' : 'Brak wyników dla filtru'}
          </div>
        ) : (
          filtered.map((line, i) => (
            <div key={i} className={`py-0.5 ${colorize(line)} whitespace-pre-wrap break-all`}>
              {line}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
