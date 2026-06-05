// Pipeline runner: PDF → parse → resolve → math → optionally post to QBO.
// Emits granular progress events for the renderer.

import {
  parseKreiselWithLlm,
  resolveImport,
  getRate,
  qboClient,
  qboPayloads,
} from './system-modules';
import type { InvoiceState } from './queue';

interface PipelineEvents {
  onProgress: (patch: Partial<InvoiceState>) => void;
  onUnknownSku: (ctx: { fileId: string; unmapped: unknown[] }) => Promise<{ skip: boolean; mappings?: Record<string, string> }>;
}

interface PipelineOptions {
  /** Override resolver: if set, pipeline uses this HMRC month directly and skips
   *  resolveImport(). Set by the renderer when the user picks a month for an
   *  ambiguous-month invoice via the wybór miesiąca modal. */
  manualHmrcMonth?: string;
}

type ParsedKreisel = {
  invoice_no: string;
  kreisel_ref?: string;
  issue_date: string;
  sale_date?: string;
  container: string | null;
  lines: Array<{
    ewi_sku: string;
    qty_kreisel: number;
    qty_ewi: number;
    unit_pln: number;
    total_pln: number;
    raw_desc: string;
    is_pallet?: boolean;
    is_sample?: boolean;
    is_pigment?: boolean;
  }>;
  total_pln: number;
  unmapped_lines: Array<{
    nr: number;
    raw_desc: string;
    qty: number;
    unit_pln: number;
    total_pln: number;
    suggestions: Array<{ code: string; name: string; score: number; times_ordered: number }>;
  }>;
};

type ResolverResult = {
  status: 'ok' | 'ambiguous_month' | 'no_data' | string;
  confidence?: 'confirmed' | 'predicted';
  source?: string;
  hmrc_month?: string;
  alternative_hmrc_month?: string;
  predicted_ata_uk?: string;
  ata_uk?: string;
  container?: string;
};

/**
 * Run the full pipeline for a single PDF.
 * @param pdfPath  absolute path to Kreisel PDF
 * @param post     true = actually POST to QBO, false = dry-run
 * @param ev       event emitter for renderer updates
 */
export async function runPipeline(
  fileId: string,
  pdfPath: string,
  post: boolean,
  ev: PipelineEvents,
  options: PipelineOptions = {}
): Promise<void> {
  try {
    // 1. PARSE
    ev.onProgress({ id: fileId, status: 'parsing', progress: 10 });
    const k = (await parseKreiselWithLlm(pdfPath)) as ParsedKreisel;

    if (k.unmapped_lines?.length) {
      ev.onProgress({
        id: fileId,
        status: 'unknown_sku',
        unmapped_lines: k.unmapped_lines,
        kreisel_ref: k.kreisel_ref,
        lines: k.lines.length + k.unmapped_lines.length,
      });
      const r = await ev.onUnknownSku({ fileId, unmapped: k.unmapped_lines });
      if (r.skip) {
        ev.onProgress({ id: fileId, status: 'failed', error: 'Pominięto — nieznane SKU' });
        return;
      }
      // TODO: apply r.mappings to k.lines, re-run mapping. For now just continue.
    }

    ev.onProgress({
      id: fileId,
      status: 'processing',
      progress: 30,
      kreisel_ref: k.kreisel_ref || `FSE-${k.invoice_no}`,
      amount_pln: k.total_pln,
      lines: k.lines.length,
      container: k.container ?? undefined,
    });

    // 2. RESOLVE HMRC month — skipped entirely if user supplied a manual override
    let chosenHmrcMonth: string;
    if (options.manualHmrcMonth) {
      chosenHmrcMonth = options.manualHmrcMonth;
      ev.onProgress({
        id: fileId,
        progress: 50,
        hmrc_month: chosenHmrcMonth,
        resolver_source: 'manual',
        resolver_confidence: 'predicted',
      });
    } else {
      const resolved = (await resolveImport(k)) as ResolverResult;

      if (resolved.status === 'ambiguous_month') {
        ev.onProgress({
          id: fileId,
          status: 'ambiguous',
          hmrc_month_options: [
            resolved.hmrc_month,
            resolved.alternative_hmrc_month,
          ].filter(Boolean) as string[],
          predicted_ata_uk: resolved.predicted_ata_uk,
          days_waiting: 0,
        });
        return;
      }

      if (resolved.status !== 'ok' || !resolved.hmrc_month) {
        ev.onProgress({ id: fileId, status: 'failed', error: `Resolver: ${resolved.status}` });
        return;
      }

      chosenHmrcMonth = resolved.hmrc_month;
      ev.onProgress({
        id: fileId,
        progress: 50,
        hmrc_month: resolved.hmrc_month,
        ata_uk: resolved.ata_uk,
        resolver_source: resolved.source,
        resolver_confidence: resolved.confidence,
      });
    }

    // 3. HMRC rate
    const hmrc = await getRate(chosenHmrcMonth, 'PLN');
    ev.onProgress({ id: fileId, progress: 60, hmrc_rate: hmrc.rate });

    // 4. Build payloads
    const pro = await qboClient.getClient('pro');
    const store = await qboClient.getClient('store');
    const bill1 = await qboPayloads.buildKreiselBill(pro, k, hmrc.rate);
    const inv = await qboPayloads.buildEwiproInvoice(pro, k, hmrc.rate);
    const bill2 = await qboPayloads.buildEwistoreBillFromInvoice(store, k, inv.payload, hmrc.rate);
    const subGbp = inv.payload.Line.reduce((s: number, l: { Amount: number }) => s + l.Amount, 0);

    // Build parsed_lines for sidebar display with computed GBP amounts
    const parsedLines = k.lines.map((l, idx) => {
      const invLine = inv.payload.Line[idx] as { Amount?: number; SalesItemLineDetail?: { Qty?: number; UnitPrice?: number } } | undefined;
      const det = invLine?.SalesItemLineDetail;
      return {
        ewi_sku: l.ewi_sku,
        qty: l.qty_kreisel,
        unit_pln: l.unit_pln,
        total_pln: l.total_pln,
        rate_gbp: det?.UnitPrice,
        amount_gbp: invLine?.Amount,
        raw_desc: l.raw_desc,
        is_pallet: l.is_pallet,
        is_sample: l.is_sample,
        is_pigment: l.is_pigment,
      };
    });

    ev.onProgress({ id: fileId, progress: 80, amount_gbp: subGbp, parsed_lines: parsedLines });

    if (!post) {
      ev.onProgress({ id: fileId, status: 'done', progress: 100, dry_run: true });
      return;
    }

    // 5. POST to QBO
    const billRes1 = await pro.post('bill', bill1.payload);
    const proBillId = billRes1.Bill.Id;
    const invRes = await pro.post('invoice', inv.payload);
    const invId = invRes.Invoice.Id;
    const invDoc = invRes.Invoice.DocNumber || inv.payload.DocNumber;
    bill2.payload.DocNumber = invDoc;
    const billRes2 = await store.post('bill', bill2.payload);
    const storeBillId = billRes2.Bill.Id;

    ev.onProgress({ id: fileId, progress: 95, invoice_no: invDoc, pro_bill_id: proBillId, store_bill_id: storeBillId });

    // 6. Attachments
    try {
      // Kreisel PDF → renamed to "FSE-<nr>-<yr>.pdf" to match colleague's manual naming style
      const fs = await import('node:fs');
      const kreiselBytes = fs.readFileSync(pdfPath);
      const kreiselFileName = (k.kreisel_ref || `FSE-${k.invoice_no}`).replace(/\//g, '-') + '.pdf';
      await qboPayloads.attachPdfBufferToTxn(pro, kreiselBytes, kreiselFileName, 'Bill', proBillId);

      // EWI Pro Invoice PDF (from QBO) → attached to Store Bill
      const invPdf = await pro.getPdf(`invoice/${invId}/pdf`);
      const invFileName = `EWI-Pro-Invoice-${invDoc}.pdf`;
      await qboPayloads.attachPdfBufferToTxn(store, invPdf, invFileName, 'Bill', storeBillId);
    } catch (e) {
      console.error('Attachment failed:', e);
    }

    ev.onProgress({ id: fileId, status: 'done', progress: 100 });
  } catch (e) {
    // Extract detailed error from axios responses (QBO 400/401/422)
    let message = e instanceof Error ? e.message : String(e);
    const err = e as { response?: { status?: number; data?: unknown } };
    if (err.response?.data) {
      const data = err.response.data;
      const fault = (data as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string; element?: string }> } }).Fault;
      if (fault?.Error?.length) {
        const details = fault.Error.map(e =>
          `[${e.code || '?'}] ${e.Message || ''}${e.Detail ? `\n      ${e.Detail}` : ''}${e.element ? ` (in: ${e.element})` : ''}`
        ).join('\n');
        message = `QBO ${err.response.status}:\n${details}`;
      } else {
        message = `${message}\n${JSON.stringify(data, null, 2).slice(0, 500)}`;
      }
    }
    console.error('Pipeline error for', fileId, ':', message);
    ev.onProgress({ id: fileId, status: 'failed', error: message });
  }
}
