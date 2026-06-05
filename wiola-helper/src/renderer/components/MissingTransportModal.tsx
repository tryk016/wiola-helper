import { useState } from 'react';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onSubmit: (transport: string) => Promise<void> | void;
}

const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;

/**
 * Modal for resolving invoices with no transport data (no container number
 * and no truck registration on the PDF). The user can either:
 *   1. Enter a container number (4 letters + 7 digits)  → triggers Magemar lookup
 *   2. Enter a truck registration plate                  → +3d truck prediction
 *   3. Accept "no info — use +3d default prediction"     → no override, default flow
 */
export function MissingTransportModal({ invoice, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!invoice) return null;

  const trimmed = value.trim().toUpperCase().replace(/\s+/g, '');
  const isContainer = CONTAINER_RE.test(trimmed);
  const isTruckReg = trimmed.length > 0 && !isContainer;
  const canSubmit = trimmed.length > 0 && !submitting;

  const detect = isContainer
    ? '✅ Wygląda na numer kontenera — wyszukam w Magemar dla ATA UK.'
    : isTruckReg
      ? 'ℹ Wygląda na numer auta — przewidywanie ATA: data faktury + 3 dni.'
      : '';

  const handleSubmit = async (val: string) => {
    setSubmitting(true);
    try {
      await onSubmit(val);
      onClose();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

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
          <div className="text-3xl">🚛</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Brak danych transportu</h2>
            <p className="text-sm text-slate-400 mt-1">
              Faktura <span className="font-mono text-amber-300">{invoice.kreisel_ref}</span> nie ma na sobie numeru kontenera
              ani numeru rejestracyjnego auta.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Wpisz dane transportu, żeby system mógł poprawnie obliczyć datę przybycia (ATA UK) i kurs HMRC.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Numer kontenera lub auta
          </label>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="np. CMAU6487821  lub  PO-12345"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono placeholder:text-slate-600 focus:border-blue-500 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit(trimmed);
            }}
          />
          {detect && (
            <div className={`text-xs ${isContainer ? 'text-emerald-400' : 'text-slate-400'}`}>
              {detect}
            </div>
          )}
        </div>

        <button
          onClick={() => handleSubmit(trimmed)}
          disabled={!canSubmit}
          className={`w-full px-4 py-2.5 rounded-lg font-medium transition-all ${
            canSubmit
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          Użyj tego numeru i kontynuuj
        </button>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-400">Nie wiesz?</strong> Jeśli nie masz danych transportu (np. faktura wystawiona przed wysyłką), kliknij niżej —
            system przyjmie prognozę +3 dni od daty faktury.
          </div>
          <button
            onClick={() => handleSubmit('')}
            disabled={submitting}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
          >
            Brak danych — użyj prognozy +3 dni (truck default)
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors mt-2"
        >
          Anuluj — faktura zostanie w kolejce do późniejszego uzupełnienia
        </button>
      </div>
    </div>
  );
}
