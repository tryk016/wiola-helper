import type { Invoice, ParsedLine } from '../types';

interface Props {
  invoice: Invoice | null;
}

const fmtPln = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtGbp = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Sidebar({ invoice }: Props) {
  if (!invoice) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <div className="text-6xl mb-3 opacity-30">📄</div>
        <p className="text-sm">Wybierz fakturę z listy</p>
        <p className="text-xs mt-1 opacity-70">aby zobaczyć szczegóły</p>
      </div>
    );
  }

  const totalGbpFromLines = invoice.parsed_lines?.reduce((s, l) => s + (l.amount_gbp || 0), 0);
  const totalPlnFromLines = invoice.parsed_lines?.reduce((s, l) => s + l.total_pln, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-lg font-semibold mb-1">{invoice.kreisel_ref || invoice.fileName || invoice.file}</h2>
        <p className="text-xs text-slate-400 font-mono truncate">{invoice.file}</p>
      </div>

      {/* Summary grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <DataItem label="Status" value={invoice.status} />
        {invoice.invoice_no && <DataItem label="EWI Pro Invoice" value={`#${invoice.invoice_no}`} mono className="text-emerald-300" />}
        {invoice.amount_pln !== undefined && <DataItem label="Razem PLN" value={`zł${fmtPln(invoice.amount_pln)}`} mono />}
        {invoice.amount_gbp !== undefined && <DataItem label="Razem GBP" value={`£${fmtGbp(invoice.amount_gbp)}`} mono className="text-emerald-300" />}
        {invoice.hmrc_month && <DataItem label="HMRC miesiąc" value={invoice.hmrc_month} mono />}
        {invoice.hmrc_rate && <DataItem label="Kurs HMRC" value={invoice.hmrc_rate.toString()} mono />}
        {invoice.container && <DataItem label="Kontener" value={invoice.container} mono />}
        {invoice.lines !== undefined && <DataItem label="Linie" value={invoice.lines.toString()} />}
      </dl>

      {/* Line items table */}
      {invoice.parsed_lines && invoice.parsed_lines.length > 0 && (
        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Pozycje na fakturze ({invoice.parsed_lines.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-2 pr-2">Produkt</th>
                  <th className="text-right px-2">Qty</th>
                  <th className="text-right px-2">PLN/szt</th>
                  <th className="text-right px-2">PLN razem</th>
                  <th className="text-right pl-2">GBP razem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoice.parsed_lines.map((l, idx) => (
                  <LineRow key={idx} line={l} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 font-semibold">
                  <td colSpan={3} className="py-2 pr-2 text-slate-400 text-right">SUMA:</td>
                  <td className="px-2 text-right font-mono">
                    {totalPlnFromLines !== undefined ? `zł${fmtPln(totalPlnFromLines)}` : '—'}
                  </td>
                  <td className="pl-2 text-right font-mono text-emerald-300">
                    {totalGbpFromLines !== undefined ? `£${fmtGbp(totalGbpFromLines)}` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Ambiguous month alert */}
      {invoice.hmrc_month_options && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-900/50">
          <div className="text-xs text-amber-300 font-medium mb-2">⚠️ Granica miesiąca</div>
          <p className="text-sm">
            Przewidywany ATA może być w jednym z miesięcy:{' '}
            <span className="font-mono text-amber-200">{invoice.hmrc_month_options.join(' lub ')}</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Po pobraniu świeżego Magemar Wiola Helper sprawdzi prawdziwą ATA i poprosi o akceptację.
          </p>
        </div>
      )}

      {/* Error */}
      {invoice.error && (
        <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50">
          <div className="text-xs text-red-300 font-medium mb-2">❌ Błąd</div>
          <pre className="text-xs font-mono text-red-200 whitespace-pre-wrap">{invoice.error}</pre>
        </div>
      )}
    </div>
  );
}

function LineRow({ line }: { line: ParsedLine }) {
  const tag = line.is_pallet ? '📦' : line.is_pigment ? '🎨' : line.is_sample ? '🧪' : '';
  return (
    <tr className="hover:bg-slate-800/50">
      <td className="py-1.5 pr-2 max-w-[200px]">
        <div className="font-mono text-slate-200 text-xs flex items-center gap-1">
          {tag && <span>{tag}</span>}
          <span className="truncate">{line.ewi_sku}</span>
        </div>
      </td>
      <td className="px-2 text-right font-mono">{line.qty}</td>
      <td className="px-2 text-right font-mono text-slate-400">{fmtPln(line.unit_pln)}</td>
      <td className="px-2 text-right font-mono text-slate-300">{fmtPln(line.total_pln)}</td>
      <td className="pl-2 text-right font-mono text-emerald-300">
        {line.amount_gbp !== undefined ? fmtGbp(line.amount_gbp) : '—'}
      </td>
    </tr>
  );
}

function DataItem({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-slate-100 ${mono ? 'font-mono' : ''} ${className || ''}`}>{value}</dd>
    </>
  );
}
