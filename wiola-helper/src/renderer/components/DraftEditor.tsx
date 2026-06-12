import { useState, useEffect, useMemo } from 'react';
import type { Invoice } from '../types';
import { lineGbp } from '../lib/gbp';

interface Props {
  invoice: Invoice;
  onClose?: () => void;
}

interface EditLine {
  ewi_sku: string;
  qty: string;        // kept as strings while editing
  unit_pln: string;   // PLN price per unit (line total = qty × unit)
  raw_desc?: string;  // original Kreisel description (shown when SKU is blank)
  is_pallet?: boolean;
  is_sample?: boolean;
  is_pigment?: boolean;
}

const fmtGbp = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPln = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Unit price (GBP/szt) is computed to 3 dp (2 dp for pallets/samples) — show the
// real value up to 3 places instead of rounding to 2.
const fmtRate = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Editor for a scanned ('ready') invoice. The user can change the HMRC rate,
 * each line's quantity and PLN value, and add/remove lines. GBP recomputes
 * live; "Zapisz zmiany" persists to the draft (main re-derives authoritatively).
 */
export function DraftEditor({ invoice }: Props) {
  const [rate, setRate] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-seed ONLY when a different invoice is selected (id change), so saving /
  // queue:state events don't clobber in-progress edits.
  const invoiceId = invoice.id;
  useEffect(() => {
    const k = invoice.scan?.k;
    setRate(invoice.scan?.hmrc_rate != null ? String(invoice.scan.hmrc_rate) : (invoice.hmrc_rate?.toString() ?? ''));
    setLines(
      (k?.lines ?? []).map(l => ({
        ewi_sku: l.ewi_sku,
        qty: String(l.qty_ewi ?? l.qty_kreisel ?? 0),
        unit_pln: String(l.unit_pln ?? 0),
        raw_desc: l.raw_desc,
        is_pallet: l.is_pallet,
        is_sample: l.is_sample,
        is_pigment: l.is_pigment,
      }))
    );
    setSavedAt(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const rateNum = parseFloat(rate.replace(',', '.'));
  const rateValid = Number.isFinite(rateNum) && rateNum > 0;

  const computed = useMemo(() => {
    return lines.map(l => {
      const qty = parseFloat(l.qty.replace(',', '.')) || 0;
      const unit_pln = parseFloat(l.unit_pln.replace(',', '.')) || 0;
      const total_pln = Math.round(qty * unit_pln * 100) / 100;  // line total = qty × unit
      const { rate_gbp, amount_gbp } = rateValid
        ? lineGbp({ ewi_sku: l.ewi_sku, qty, total_pln, is_pallet: l.is_pallet, is_sample: l.is_sample }, rateNum)
        : { rate_gbp: 0, amount_gbp: 0 };
      return { qty, unit_pln, total_pln, rate_gbp, amount_gbp };
    });
  }, [lines, rateNum, rateValid]);

  const totalPln = computed.reduce((s, c) => s + c.total_pln, 0);
  const totalGbp = computed.reduce((s, c) => s + c.amount_gbp, 0);

  const setLine = (idx: number, patch: Partial<EditLine>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines(prev => [...prev, { ewi_sku: '', qty: '1', unit_pln: '0' }]);

  const canSave =
    rateValid &&
    lines.length > 0 &&
    lines.every(l => l.ewi_sku.trim().length > 0 && (parseFloat(l.qty.replace(',', '.')) || 0) > 0) &&
    !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.wiola.editDraft(invoice.id, {
        hmrc_rate: rateNum,
        lines: lines.map(l => {
          const qty = parseFloat(l.qty.replace(',', '.')) || 0;
          const unit = parseFloat(l.unit_pln.replace(',', '.')) || 0;
          return {
            ewi_sku: l.ewi_sku.trim(),
            qty,
            total_pln: Math.round(qty * unit * 100) / 100,  // backend stores total; unit = total/qty
            raw_desc: l.raw_desc,
            is_pallet: l.is_pallet,
            is_sample: l.is_sample,
            is_pigment: l.is_pigment,
          };
        }),
      });
      setSavedAt(Date.now());
    } catch (e) {
      console.error('editDraft failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="border-b border-slate-700 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 font-medium">
            ✏️ Edycja przed uploadem
          </span>
          {invoice.scan?.edited && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-900/30 text-amber-300">zmienione</span>
          )}
        </div>
        <h2 className="text-lg font-semibold mt-2">{invoice.kreisel_ref || invoice.fileName}</h2>
        <p className="text-xs text-slate-400 mt-1">
          Sprawdź i popraw co wystawimy. Po edycji kliknij <b>Zapisz zmiany</b>, potem <b>Upload</b> w kolejce.
        </p>
      </div>

      {/* Read-only context */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {invoice.issue_date && <Ctx label="Data wystawienia" value={invoice.issue_date} />}
        {invoice.scan?.hmrc_month && <Ctx label="HMRC miesiąc" value={invoice.scan.hmrc_month} />}
        {invoice.container && <Ctx label="Kontener / auto" value={invoice.container} />}
      </div>

      {/* HMRC rate */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700">
        <label className="text-sm text-slate-300 font-medium">Kurs HMRC (PLN za 1 GBP)</label>
        <input
          value={rate}
          onChange={e => setRate(e.target.value)}
          inputMode="decimal"
          className={`w-32 px-3 py-1.5 bg-slate-900 border rounded-lg font-mono text-right outline-none ${
            rateValid ? 'border-slate-600 focus:border-blue-500 text-slate-100' : 'border-red-700 text-red-300'
          }`}
          placeholder="np. 4.8397"
        />
        {!rateValid && <span className="text-xs text-red-400">Podaj dodatni kurs</span>}
      </div>

      {/* Lines */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pozycje ({lines.length})
          </h3>
          <button
            onClick={addLine}
            className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700"
          >
            ＋ Dodaj linię
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="text-right pr-1 w-6">#</th>
                <th className="text-left py-1.5 pr-2">Produkt (SKU)</th>
                <th className="text-right px-2 w-20">Ilość</th>
                <th className="text-right px-2 w-24">PLN/szt</th>
                <th className="text-right px-2 w-24">PLN razem</th>
                <th className="text-right px-2 w-20">GBP/szt</th>
                <th className="text-right pl-2 w-24">GBP razem</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lines.map((l, idx) => {
                const c = computed[idx];
                const tag = l.is_pallet ? '📦' : l.is_pigment ? '🎨' : l.is_sample ? '🧪' : '';
                return (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="pr-1 text-right align-top pt-2 text-slate-600 font-mono text-[10px] tabular-nums">{idx + 1}</td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1">
                        {tag && <span>{tag}</span>}
                        <input
                          value={l.ewi_sku}
                          onChange={e => setLine(idx, { ewi_sku: e.target.value })}
                          className={`w-full px-2 py-1 bg-slate-900 border rounded font-mono text-slate-100 outline-none ${
                            l.ewi_sku.trim() ? 'border-slate-700 focus:border-blue-500' : 'border-amber-600 focus:border-amber-400'
                          }`}
                          placeholder="wpisz SKU (np. EWI-225)"
                        />
                      </div>
                      {(l.ewi_sku === '__SAMPLE__' || l.ewi_sku === '__PALLET__') && (
                        <div className="text-[10px] text-cyan-400 mt-0.5 pl-1">
                          → {l.ewi_sku === '__SAMPLE__' ? 'ogólna próbka (EWI Sample)' : 'paleta (Pallet)'}
                        </div>
                      )}
                      {l.raw_desc && l.ewi_sku !== '__SAMPLE__' && l.ewi_sku !== '__PALLET__' &&
                        (!l.ewi_sku.trim() || l.raw_desc.trim().toUpperCase() !== l.ewi_sku.trim().toUpperCase()) && (
                        <div className="text-[10px] text-slate-500 mt-0.5 pl-1 truncate max-w-[220px]" title={l.raw_desc}>
                          {l.ewi_sku.trim() ? '' : '⚠ '}{l.raw_desc}
                        </div>
                      )}
                    </td>
                    <td className="px-2">
                      <input
                        value={l.qty}
                        onChange={e => setLine(idx, { qty: e.target.value })}
                        inputMode="decimal"
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-right text-slate-100 focus:border-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-2">
                      <input
                        value={l.unit_pln}
                        onChange={e => setLine(idx, { unit_pln: e.target.value })}
                        inputMode="decimal"
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-right text-slate-100 focus:border-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-2 text-right font-mono text-slate-400">{c ? fmtPln(c.total_pln) : '—'}</td>
                    <td className="px-2 text-right font-mono text-slate-400">{c ? fmtRate(c.rate_gbp) : '—'}</td>
                    <td className="pl-2 text-right font-mono text-emerald-300">{c ? fmtGbp(c.amount_gbp) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setLine(idx, { ewi_sku: '__SAMPLE__', is_sample: true })}
                        className="text-slate-600 hover:text-cyan-300 px-1"
                        title="Ustaw jako ogólną próbkę (item EWI Sample) — dla jednorazowych próbek bez własnego produktu w QBO"
                      >
                        🧪
                      </button>
                      <button
                        onClick={() => removeLine(idx)}
                        className="text-slate-600 hover:text-red-400 px-1"
                        title="Usuń linię"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700 font-semibold">
                <td className="py-2 pr-2 text-right text-slate-400" colSpan={4}>SUMA:</td>
                <td className="px-2 text-right font-mono">zł{fmtPln(totalPln)}</td>
                <td></td>
                <td className="pl-2 text-right font-mono text-emerald-300">£{fmtGbp(totalGbp)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            canSave ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          💾 Zapisz zmiany
        </button>
        {savedAt && <span className="text-xs text-emerald-400">✓ Zapisano — gotowe do uploadu</span>}
        {!canSave && lines.some(l => !l.ewi_sku.trim()) && (
          <span className="text-xs text-amber-400">Każda linia musi mieć SKU i ilość &gt; 0</span>
        )}
      </div>
    </div>
  );
}

function Ctx({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}
