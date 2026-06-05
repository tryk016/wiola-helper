import { useState } from 'react';
import type { ResolvedPending } from '../store';

interface Props {
  items: ResolvedPending[];
  onClose: () => void;
  onAcceptAll: () => Promise<void>;
}

export function PendingResolvedModal({ items, onClose, onAcceptAll }: Props) {
  const [processing, setProcessing] = useState(false);

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await onAcceptAll();
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-emerald-700/40 w-full max-w-xl mx-6 shadow-2xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="text-3xl">✨</div>
            <div>
              <h2 className="text-lg font-semibold">Oczekujące faktury — kontenery dotarły!</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Magemar ma teraz prawdziwe ATA dla {items.length}{' '}
                {items.length === 1 ? 'kontenera' : 'kontenerów'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-2 max-h-[50vh] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm font-semibold text-emerald-200">
                    {item.kreisel_ref}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Kontener: <span className="font-mono">{item.container}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">ATA Tilbury</div>
                  <div className="text-sm font-mono text-emerald-300">{item.ata_uk}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    HMRC: <span className="font-mono text-emerald-200">{item.hmrc_month}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 flex items-center justify-between bg-slate-900/50">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            Później
          </button>
          <button
            onClick={handleAccept}
            disabled={processing}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-ewi-green hover:bg-ewi-green-700 text-white shadow-md disabled:opacity-50 transition-colors"
          >
            {processing ? 'Procesuję...' : `✓ Wystaw wszystkie (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
