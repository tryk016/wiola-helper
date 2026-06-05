import { useState } from 'react';
import type { UnmappedLine } from '../store';

interface Props {
  fileId: string;
  unmapped: UnmappedLine[];
  onResolve: (resp: { skip: boolean; mappings?: Record<string, string> }) => void;
  onClose: () => void;
}

export function UnknownSkuModal({ unmapped, onResolve, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState('');
  const [remember, setRemember] = useState(true);

  const line = unmapped[currentIdx];
  if (!line) return null;

  const handleAccept = (skuName: string) => {
    const newMappings = { ...mappings, [line.raw_desc]: skuName };
    setMappings(newMappings);
    setCustomName('');
    if (currentIdx < unmapped.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onResolve({ skip: false, mappings: remember ? newMappings : undefined });
      onClose();
    }
  };

  const handleSkipInvoice = () => {
    onResolve({ skip: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-amber-700/40 w-full max-w-2xl mx-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="text-3xl">⚠️</div>
            <div>
              <h2 className="text-lg font-semibold">Nowy produkt na fakturze</h2>
              <p className="text-xs text-slate-400">
                {unmapped.length > 1
                  ? `Linia ${currentIdx + 1} z ${unmapped.length} do zmapowania`
                  : 'Niezmapowana pozycja'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-xs text-slate-400 mb-2">Linia {line.nr}:</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">qty</div>
                <div className="font-mono">{line.qty}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">cena</div>
                <div className="font-mono">{line.unit_pln.toFixed(2)} PLN</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">razem</div>
                <div className="font-mono">{line.total_pln.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-2">Opis z faktury Kreisla:</div>
            <div className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 font-mono text-sm">
              „{line.raw_desc}"
            </div>
          </div>

          {line.suggestions.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">Możliwe dopasowania z systemu:</div>
              <div className="space-y-1.5">
                {line.suggestions.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => handleAccept(s.name)}
                    className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-emerald-900/40 hover:border-emerald-600/50 border border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-emerald-300">{s.code}</div>
                        <div className="text-xs text-slate-400">{s.name}</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        kupowane {s.times_ordered}×
                        <div className="text-right">score: {s.score}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-slate-400 mb-2">Albo wpisz nazwę EWI Pro Item własnoręcznie:</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="np. EWI-XYZ 25KG"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono focus:border-ewi-blue focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customName.trim()) handleAccept(customName.trim());
                }}
              />
              <button
                onClick={() => customName.trim() && handleAccept(customName.trim())}
                disabled={!customName.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  customName.trim()
                    ? 'bg-ewi-blue hover:bg-ewi-blue-700 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                Użyj
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded"
            />
            <span>Zapamiętaj to mapowanie — następnym razem nie zapyta</span>
          </label>
        </div>

        <div className="p-4 border-t border-slate-700 flex items-center justify-between bg-slate-900/50">
          <button
            onClick={handleSkipInvoice}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
          >
            Pomiń całą fakturę
          </button>
          {unmapped.length > 1 && (
            <div className="text-xs text-slate-500">
              Wybierz produkt lub wpisz nazwę aby przejść dalej
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
