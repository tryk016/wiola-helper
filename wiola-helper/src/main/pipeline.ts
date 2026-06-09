// Pipeline runner, split into two phases:
//   • scanInvoice  — PDF → parse → resolve → math → build (validate) → status 'ready'
//   • uploadInvoice — rebuild from the (possibly edited) draft → POST to QBO →
//                     attach PDFs → archive EWI Pro Invoice PDF to disk → done
// Emits granular progress events for the renderer.

import {
  parseKreiselWithLlm,
  resolveImport,
  lookupPodTransport,
  getRate,
  qboClient,
  qboPayloads,
  buildSaleLines,
  roundHalfUp,
} from './system-modules';
import type { InvoiceState, ScanDraft } from './queue';

// Where uploaded EWI Pro Invoice PDFs are archived, split into per-day folders.
const EWIPRO_ARCHIVE_ROOT = 'C:\\kreisel\\ewi pro';

// Pull the human-useful detail out of a QBO axios error (400/401/422).
function extractError(e: unknown): string {
  let message = e instanceof Error ? e.message : String(e);
  const err = e as { response?: { status?: number; data?: unknown } };
  if (err.response?.data) {
    const data = err.response.data;
    const fault = (data as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string; element?: string }> } }).Fault;
    if (fault?.Error?.length) {
      const details = fault.Error.map(x =>
        `[${x.code || '?'}] ${x.Message || ''}${x.Detail ? `\n      ${x.Detail}` : ''}${x.element ? ` (in: ${x.element})` : ''}`
      ).join('\n');
      message = `QBO ${err.response.status}:\n${details}`;
    } else {
      message = `${message}\n${JSON.stringify(data, null, 2).slice(0, 500)}`;
    }
  }
  return message;
}

interface PipelineEvents {
  onProgress: (patch: Partial<InvoiceState>) => void;
  /** @deprecated Unknown-SKU lines are no longer a hard gate — they fold into
   *  the editable draft for manual review. Kept optional for compatibility. */
  onUnknownSku?: (ctx: { fileId: string; unmapped: unknown[] }) => Promise<{ skip: boolean; mappings?: Record<string, string> }>;
  /** Interactive pause when PDF has no container. The renderer shows
   *  ConfirmTransportModal with the suggested MySQL data; the pipeline
   *  awaits the user's choice and continues with the response inline.
   *  Returning halt=true treats the invoice as failed and the batch
   *  halts (existing halt invariant). */
  onConfirmTransport: (ctx: {
    fileId: string;
    kreiselRef: string;
    suggested: {
      found: boolean;
      pod_id?: number;
      branch_id?: number;
      truck_reg_number?: string | null;
      is_placeholder?: boolean;
      is_container?: boolean;
      delivered?: boolean;
      delivery_date?: string | null;
      invoice_date?: string | null;
    };
  }) => Promise<{ transport: string; hmrcMonth?: string; halt?: boolean }>;
}

interface PipelineOptions {
  /** Override resolver: if set, pipeline uses this HMRC month directly and skips
   *  resolveImport(). Set by the renderer when the user picks a month for an
   *  ambiguous-month invoice via the wybór miesiąca modal. */
  manualHmrcMonth?: string;
  /** Override transport: set when the user resolved a missing_transport block.
   *  Empty string "" = "no info, accept truck +3d prediction".
   *  Otherwise: container number (4 letters + 7 digits) or truck registration. */
  manualContainer?: string;
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
  hmrc_month_options?: string[];     // for truck-pending: empty array
  pending_message?: string;          // human description of what's awaited
  predicted_ata_uk?: string;
  ata_uk?: string;
  container?: string;
  reason?: string;
};

/**
 * SKAN phase — parse, resolve the HMRC month, cost the lines, and build (i.e.
 * validate) all three QBO payloads WITHOUT posting. On success the invoice
 * lands in status 'ready' with an editable `scan` draft. Interactive gates
 * (unknown SKU, confirm-transport, ambiguous month) still happen here.
 * @param pdfPath  absolute path to Kreisel PDF
 * @param ev       event emitter for renderer updates
 */
export async function scanInvoice(
  fileId: string,
  pdfPath: string,
  ev: PipelineEvents,
  options: PipelineOptions = {}
): Promise<void> {
  try {
    // 1. PARSE
    ev.onProgress({ id: fileId, status: 'parsing', progress: 10 });
    const k = (await parseKreiselWithLlm(pdfPath)) as ParsedKreisel;

    // Unknown-SKU lines are NO LONGER a hard gate — the user reviews and fixes
    // every line in the editor. Fold any unmapped line into the draft as a
    // blank-SKU row (keeping the original Kreisel description) so it shows up
    // for manual correction instead of being silently dropped or blocking scan.
    if (k.unmapped_lines?.length) {
      for (const u of k.unmapped_lines) {
        k.lines.push({
          ewi_sku: '',
          qty_kreisel: u.qty,
          qty_ewi: u.qty,
          unit_pln: u.unit_pln,
          total_pln: u.total_pln,
          raw_desc: u.raw_desc,
        });
      }
      k.unmapped_lines = [];
    }

    ev.onProgress({
      id: fileId,
      status: 'processing',
      progress: 30,
      kreisel_ref: k.kreisel_ref || `FSE-${k.invoice_no}`,
      amount_pln: k.total_pln,
      lines: k.lines.length,
      container: k.container ?? undefined,
      issue_date: k.issue_date,
    });

    // 1.5. TRANSPORT CONFIRM GATE — if PDF lacks a container number AND the
    // user hasn't already confirmed/overridden transport, pre-fetch the
    // suggested value from MySQL and AWAIT the user's decision inline.
    // Unlike the previous halt-then-resume flow, this keeps the active
    // batch running: pipeline resumes with the user's answer instead of
    // returning, so processAll continues to the next invoice without
    // requiring another "Wyślij wszystkie" click.
    const kreiselRef = k.kreisel_ref || `FSE-${k.invoice_no}`;
    if (!k.container && options.manualContainer === undefined) {
      let suggested: Awaited<ReturnType<typeof lookupPodTransport>>;
      try {
        suggested = await lookupPodTransport(kreiselRef);
      } catch (e) {
        suggested = { found: false };
        console.warn('[pipeline] lookupPodTransport failed:', (e as Error).message);
      }
      // Surface the suggestion + transient status so the renderer can open
      // the confirm-transport modal. The user's response comes back via
      // the onConfirmTransport Promise; pipeline blocks here meanwhile.
      ev.onProgress({
        id: fileId,
        status: 'awaiting_transport_confirm',
        suggested_transport: suggested,
      });
      const decision = await ev.onConfirmTransport({ fileId, kreiselRef, suggested });
      if (decision.halt) {
        ev.onProgress({
          id: fileId,
          status: 'failed',
          error: 'Zatrzymane przez użytkownika podczas potwierdzania transportu',
        });
        return;
      }
      // Apply the user's decision to the in-flight pipeline state and resume.
      if (decision.transport) k.container = decision.transport;
      if (decision.hmrcMonth) options = { ...options, manualHmrcMonth: decision.hmrcMonth };
      // Move back to processing visually now that the gate cleared.
      ev.onProgress({
        id: fileId,
        status: 'processing',
        container: k.container ?? undefined,
      });
    } else if (options.manualContainer) {
      // Pre-supplied container override (e.g. retry of a previously halted item)
      k.container = options.manualContainer;
    }

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
        // Build options list: explicit (truck-pending → []) or container-based (1-2 months).
        const opts = resolved.hmrc_month_options !== undefined
          ? resolved.hmrc_month_options
          : [resolved.hmrc_month, resolved.alternative_hmrc_month].filter(Boolean) as string[];
        ev.onProgress({
          id: fileId,
          status: 'ambiguous',
          hmrc_month_options: opts,
          predicted_ata_uk: resolved.predicted_ata_uk,
          days_waiting: 0,
          pending_message: resolved.pending_message,
          resolver_source: resolved.source,
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

    // 4. Cost the lines with the SAME math the QBO Invoice build uses — but
    // locally, with no QBO round-trip and no item resolution. That happens at
    // upload. This keeps scan fast and tolerant of lines whose SKU isn't filled
    // in yet (the user fixes those in the editor).
    const sale = buildSaleLines({ lines: k.lines }, hmrc.rate);
    const subGbp = roundHalfUp(sale.reduce((s, l) => s + l.amount_gbp, 0), 2);
    const parsedLines = k.lines.map((l, idx) => ({
      ewi_sku: l.ewi_sku,
      qty: l.qty_kreisel,
      unit_pln: l.unit_pln,
      total_pln: l.total_pln,
      rate_gbp: sale[idx]?.rate_gbp,
      amount_gbp: sale[idx]?.amount_gbp,
      raw_desc: l.raw_desc,
      is_pallet: l.is_pallet,
      is_sample: l.is_sample,
      is_pigment: l.is_pigment,
    }));

    // SKAN done — store the editable draft and park in 'ready'. Upload will
    // re-derive the documents from this draft (after any edits).
    ev.onProgress({
      id: fileId,
      status: 'ready',
      progress: 100,
      hmrc_rate: hmrc.rate,
      hmrc_month: chosenHmrcMonth,
      amount_pln: k.total_pln,
      amount_gbp: subGbp,
      parsed_lines: parsedLines,
      container: k.container ?? undefined,
      scan: {
        k: k as unknown as ScanDraft['k'],
        hmrc_rate: hmrc.rate,
        hmrc_month: chosenHmrcMonth,
      },
    });
  } catch (e) {
    const message = extractError(e);
    console.error('Scan error for', fileId, ':', message);
    ev.onProgress({ id: fileId, status: 'failed', error: message });
  }
}

/**
 * UPLOAD phase — re-derive the 3 QBO documents from the (possibly edited)
 * scan draft and post them. Preserves the Bill1 → Invoice → Bill2 ordering
 * and the DocNumber correlation. Archives the EWI Pro Invoice PDF to disk.
 * @param post  default true; pass false for a dry-run rebuild (no POST, no archive)
 */
export async function uploadInvoice(
  fileId: string,
  pdfPath: string,
  draft: ScanDraft,
  ev: { onProgress: (patch: Partial<InvoiceState>) => void },
  opts: { post?: boolean } = {}
): Promise<void> {
  const post = opts.post !== false;
  try {
    const k = draft.k as unknown as ParsedKreisel;
    const rate = draft.hmrc_rate;

    // Friendly guard: a line with no SKU can't post (QBO needs a real product).
    // Tell the user plainly to fill it in the editor instead of letting the QBO
    // item lookup throw a cryptic "Item not found: ".
    const blank = k.lines.filter(l => !l.ewi_sku || !String(l.ewi_sku).trim());
    if (blank.length) {
      throw new Error(`Uzupełnij kod produktu (SKU) dla ${blank.length} ${blank.length === 1 ? 'linii' : 'linii'} w edytorze przed uploadem.`);
    }

    ev.onProgress({ id: fileId, status: 'processing', progress: 40 });

    const pro = await qboClient.getClient('pro');
    const store = await qboClient.getClient('store');
    const bill1 = await qboPayloads.buildKreiselBill(pro, k, rate);
    const inv = await qboPayloads.buildEwiproInvoice(pro, k, rate);
    const bill2 = await qboPayloads.buildEwistoreBillFromInvoice(store, k, inv.payload, rate);

    if (!post) {
      ev.onProgress({ id: fileId, status: 'done', progress: 100, dry_run: true });
      return;
    }

    // POST in order: Pro Bill → Pro Invoice → Store Bill (DocNumber = Invoice no)
    const billRes1 = await pro.post('bill', bill1.payload);
    const proBillId = billRes1.Bill.Id;
    const invRes = await pro.post('invoice', inv.payload);
    const invId = invRes.Invoice.Id;
    const invDoc = invRes.Invoice.DocNumber || inv.payload.DocNumber;
    bill2.payload.DocNumber = invDoc;
    const billRes2 = await store.post('bill', bill2.payload);
    const storeBillId = billRes2.Bill.Id;

    ev.onProgress({ id: fileId, progress: 90, invoice_no: invDoc, pro_bill_id: proBillId, store_bill_id: storeBillId });

    // EWI Pro Invoice PDF — fetch once, reuse for both the attachment and the
    // on-disk archive so a failure in one doesn't block the other.
    const invFileName = `EWI-Pro-Invoice-${invDoc}.pdf`;
    let invPdf: Buffer | undefined;
    try {
      invPdf = await pro.getPdf(`invoice/${invId}/pdf`);
    } catch (e) {
      console.error('EWI Pro Invoice PDF fetch failed:', e);
    }

    // Attachments
    try {
      const fs = await import('node:fs');
      const kreiselBytes = fs.readFileSync(pdfPath);
      const kreiselFileName = (k.kreisel_ref || `FSE-${k.invoice_no}`).replace(/\//g, '-') + '.pdf';
      await qboPayloads.attachPdfBufferToTxn(pro, kreiselBytes, kreiselFileName, 'Bill', proBillId);
      if (invPdf) {
        await qboPayloads.attachPdfBufferToTxn(store, invPdf, invFileName, 'Bill', storeBillId);
      }
    } catch (e) {
      console.error('Attachment failed:', e);
    }

    // Archive EWI Pro Invoice PDF → C:\kreisel\ewi pro\YYYY-MM-DD\
    if (invPdf) {
      try {
        const fs = await import('node:fs');
        const pathMod = await import('node:path');
        const day = new Date().toISOString().slice(0, 10); // upload date
        const dir = pathMod.join(EWIPRO_ARCHIVE_ROOT, day);
        fs.mkdirSync(dir, { recursive: true });
        // File name = invoice number only (no prefix), e.g. "4703.pdf".
        const archiveName = `${String(invDoc).replace(/[\/\\:*?"<>|]/g, '-')}.pdf`;
        const outPath = pathMod.join(dir, archiveName);
        fs.writeFileSync(outPath, invPdf);
        ev.onProgress({ id: fileId, ewipro_pdf_path: outPath });
        console.log('[archive] EWI Pro Invoice →', outPath);
      } catch (e) {
        console.error('EWI Pro archive failed:', e);
      }
    }

    ev.onProgress({ id: fileId, status: 'done', progress: 100 });
  } catch (e) {
    const message = extractError(e);
    console.error('Upload error for', fileId, ':', message);
    ev.onProgress({ id: fileId, status: 'failed', error: message });
  }
}
