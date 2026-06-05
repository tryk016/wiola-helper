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
  if (!invoice) return null;

  const options = (invoice.hmrc_month_options || []).filter(Boolean);
  const predicted = (invoice as { predicted_ata_uk?: string }).predicted_ata_uk;

  const handlePick = async (m: string) => {
    await onPick(m);
    onClose();
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
          <div className="text-3xl">📅</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Granica miesiąca — wybierz HMRC</h2>
            <p className="text-sm text-slate-400 mt-1">
              Faktura <span className="font-mono text-amber-300">{invoice.kreisel_ref}</span> — kontener nie dotarł jeszcze do UK,
              a transit może wypaść albo na końcu jednego, albo na początku drugiego miesiąca.
            </p>
            {predicted && (
              <p className="text-xs text-slate-500 mt-1">
                Przewidywana data ATA: <span className="font-mono text-slate-300">{predicted}</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Wybierz kurs miesięczny HMRC:
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

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-400">💡 Wskazówka:</strong> jeśli nie jesteś pewna którego użyć, kliknij „Zostaw oczekującą" — gdy Magemar w następnych dniach pokaże ATA, system sam zadecyduje.
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
