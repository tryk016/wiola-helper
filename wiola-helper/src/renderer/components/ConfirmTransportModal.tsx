import { useState, useEffect } from 'react';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onSubmit: (opts: { transport: string; hmrcMonth?: string; halt?: boolean }) => Promise<void> | void;
}

const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;
const HMRC_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const BRANCHES: Record<number, string> = {
  9: 'Chessington',
  11: 'Aylesbury',
  13: 'Bradford',
  14: 'Birmingham',
};

/**
 * Modal shown when the PDF lacks a container number. Pre-fills the
 * "Numer" field from MySQL purchase_orders_deliveries.truck_reg_number
 * if the warehouse already registered the PO. User confirms or
 * overrides, optionally picks an HMRC month directly to skip the
 * resolver wait, or halts the entire batch.
 */
export function ConfirmTransportModal({ invoice, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [hmrcMonth, setHmrcMonth] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-sync ONLY when the modal opens for a different invoice (id change).
  // Depending on `initialTransport` would re-run on every queue:state event
  // and overwrite the user's edits — that's the bug Wiola hit.
  const invoiceId = invoice?.id;
  useEffect(() => {
    if (!invoiceId) return;
    const s = invoice?.suggested_transport;
    const initial = (s?.truck_reg_number && !s?.is_placeholder) ? s.truck_reg_number : '';
    setValue(initial);
    setHmrcMonth('');
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  if (!invoice) return null;
  const suggested = invoice.suggested_transport;

  const trimmed = value.trim().toUpperCase().replace(/\s+/g, '');
  const isContainer = CONTAINER_RE.test(trimmed);
  const hmrcTrimmed = hmrcMonth.trim();
  const hmrcValid = !hmrcTrimmed || HMRC_MONTH_RE.test(hmrcTrimmed);
  // Submit when we have either a number, or a valid HMRC month, or both.
  const canSubmit = (trimmed.length > 0 || (hmrcTrimmed.length > 0 && hmrcValid)) && hmrcValid && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        transport: trimmed,
        hmrcMonth: hmrcMonth.trim() || undefined,
      });
      onClose();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  const handleHalt = async () => {
    if (!confirm('Zatrzymać przetwarzanie tej i wszystkich kolejnych faktur w batchu?')) return;
    setSubmitting(true);
    try {
      await onSubmit({ transport: '', halt: true });
      onClose();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">🚛</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Potwierdź transport</h2>
            <p className="text-sm text-slate-400 mt-1">
              Faktura <span className="font-mono text-amber-300">{invoice.kreisel_ref}</span> nie zawiera
              numeru kontenera. Sprawdziłem MySQL — sprawdź propozycję poniżej i zatwierdź lub popraw.
            </p>
          </div>
        </div>

        {/* MySQL findings */}
        <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-sm space-y-1.5">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
            🗄 Z MySQL (purchase_orders_deliveries)
          </div>
          {!suggested?.found ? (
            <div className="text-slate-400 italic">
              Brak wpisu w MySQL dla tej faktury (sprawdzono z prefiksem FSE- i bez).
              Wpisz dane transportu ręcznie poniżej.
            </div>
          ) : (
            <>
              <Row label="POD ID" value={`#${suggested.pod_id}`} mono />
              {suggested.branch_id !== undefined && (
                <Row label="Branch" value={`${BRANCHES[suggested.branch_id] || '?'} (${suggested.branch_id})`} />
              )}
              <Row
                label="truck_reg_number"
                value={
                  suggested.truck_reg_number
                    ? suggested.is_placeholder
                      ? `${suggested.truck_reg_number} ⚠ placeholder`
                      : suggested.is_container
                        ? `${suggested.truck_reg_number} ✓ kontener`
                        : suggested.truck_reg_number
                    : '— (puste)'
                }
                mono
                muted={suggested.is_placeholder || !suggested.truck_reg_number}
              />
              <Row
                label="delivery_date"
                value={suggested.delivery_date || '— (jeszcze nie dostarczone)'}
                mono
                muted={!suggested.delivery_date}
              />
              <Row
                label="delivered"
                value={suggested.delivered ? '✓ TAK' : '✗ NIE'}
                muted={!suggested.delivered}
              />
            </>
          )}
        </div>

        {/* Transport input */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Numer kontenera lub auta <span className="text-slate-600 normal-case">— opcjonalne, jeśli podajesz miesiąc HMRC poniżej</span>
          </label>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="np. CMAU6487821  lub  PO-12345  (lub zostaw puste)"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono placeholder:text-slate-600 focus:border-blue-500 outline-none"
          />
          {trimmed && (
            <div className={`text-xs ${isContainer ? 'text-emerald-400' : 'text-slate-400'}`}>
              {isContainer
                ? '✓ Wygląda na numer kontenera — wyszukam w Magemar dla ATA UK.'
                : 'ℹ Wygląda na numer auta — system użyje MySQL delivery_date (lub poczeka jeśli brak).'}
            </div>
          )}
        </div>

        {/* Optional HMRC */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Miesiąc HMRC (opcjonalnie — pomija resolver)
          </label>
          <input
            type="text"
            value={hmrcMonth}
            onChange={(e) => setHmrcMonth(e.target.value)}
            placeholder="YYYY-MM (np. 2026-05) — zostaw puste żeby resolver sam zdecydował"
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono placeholder:text-slate-600 focus:border-blue-500 outline-none text-sm"
          />
          {hmrcMonth && !hmrcValid && (
            <div className="text-xs text-red-400">Format: YYYY-MM (np. 2026-05)</div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-3 border-t border-slate-800">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full px-4 py-2.5 rounded-lg font-medium transition-all ${
              canSubmit
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            ✓ Procesuj dalej
          </button>
          <button
            onClick={handleHalt}
            disabled={submitting}
            className="w-full px-4 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-900/50 transition-colors text-sm"
          >
            ✗ Nie procesuj — zatrzymaj batch
          </button>
          <button
            onClick={onClose}
            className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors mt-1"
          >
            Anuluj — wrócę do tego później
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, muted }: { label: string; value: string; mono?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-sm">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${muted ? 'text-slate-500' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}
