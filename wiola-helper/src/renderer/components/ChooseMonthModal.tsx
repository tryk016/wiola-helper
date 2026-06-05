import { useState } from 'react';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onPick: (hmrcMonth: string) => Promise<void> | void;
}

/**
 * Modal for resolving ambiguous-month invoices. Shown when the user clicks
 * a pending invoice in the "Oczekujące" section.
 *
 * Options:
 *   - 1-2 buttons, one per possible HMRC month from the resolver
 *   - "Zostaw oczekującą" — closes without resolving (default fallback)
 */
export function ChooseMonthModal({ invoice, onClose, onPick }: Props) {
  const [customMonth, setCustomMonth] = useState('');

  if (!invoice) return null;

  const options = (invoice.hmrc_month_options || []).filter(Boolean);
  const predicted = (invoice as { predicted_ata_uk?: string }).predicted_ata_uk;
  const pendingMessage = invoice.pending_message;
  const hasOptions = options.length > 0;

  const handlePick = async (m: string) => {
    await onPick(m);
    onClose();
  };

  const customValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(customMonth.trim());

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">{hasOptions ? '📅' : '🚛'}</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">
              {hasOptions ? 'Granica miesiąca — wybierz HMRC' : 'Czeka na dane — wybierz HMRC ręcznie'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Faktura <span className="font-mono text-amber-300">{invoice.kreisel_ref}</span>
            </p>
            {pendingMessage && (
              <p className="text-sm text-amber-300 mt-2 bg-amber-950/30 border border-amber-900/50 rounded-md px-3 py-2">
                {pendingMessage}
              </p>
            )}
            {predicted && (
              <p className="text-xs text-slate-500 mt-1">
                Przewidywana data ATA: <span className="font-mono text-slate-300">{predicted}</span>
              </p>
            )}
          </div>
        </div>

        {hasOptions && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Sugerowane miesiące HMRC:
            </div>
            {options.map((month) => (
              <button
                key={month}
                onClick={() => handlePick(month)}
                className="w-full px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-all flex items-center justify-between group"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl">🇬🇧</span>
                  <span>Użyj kursu z <span className="font-mono">{month}</span></span>
                </span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {hasOptions ? 'Albo wpisz inny miesiąc ręcznie:' : 'Wpisz miesiąc HMRC ręcznie:'}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus={!hasOptions}
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              placeholder="YYYY-MM (np. 2026-05)"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono placeholder:text-slate-600 focus:border-blue-500 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customValid) handlePick(customMonth.trim());
              }}
            />
            <button
              onClick={() => handlePick(customMonth.trim())}
              disabled={!customValid}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                customValid
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Użyj
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-400">💡 Wskazówka:</strong> gdy w MySQL pojawi się delivery_date (truck) lub Magemar pokaże ATA (container), kliknij „🔍 Sprawdź teraz" na górze sekcji Oczekujące — system sam zadecyduje.
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
          >
            Zostaw oczekującą
          </button>
        </div>
      </div>
    </div>
  );
}
