// Best-effort parser of OCR'd Kreisel invoice text.
// Splits fields into:
//   - "high confidence": invoice_no, date, container, kreisel TIN, totals (text-in-words)
//   - "needs review": product lines (table OCR is unreliable, operator should verify)

const { ocrPdf, terminate } = require('./ocr_pdf');

function parseDateDMY(s) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (!m) return null;
  const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function extractFields(text) {
  const out = {
    invoice_no: null,
    date: null,
    container: null,
    seller_vat: null,
    buyer_vat: null,
    total_pln_words: null,
    raw_lines: [],
    suspected_product_lines: [],
  };

  // Invoice no
  let m = /Invoice\s+([\w/\-]+\/EXP)/i.exec(text);
  if (m) out.invoice_no = m[1];
  else if ((m = /(\d+\/\d{4}\/EXP)/i.exec(text))) out.invoice_no = m[1];

  // Date of invoice — try standard then fallback (Poznań, D.MM.YYYY at bottom)
  m = /Date of invoice:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(text);
  if (!m) m = /Data wystawienia:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(text);
  if (!m) m = /Pozna[nń],?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(text);
  if (m) out.date = parseDateDMY(m[1]);

  // Container number — only near "Kontener:" / "Container:" anchor (avoid false positives from customs IDs)
  m = /Kontener:?\s*([A-Z]{4}\s*\d{7})/i.exec(text);
  if (!m) m = /Container:?\s*([A-Z]{4}\s*\d{7})/i.exec(text);
  if (m) out.container = m[1].replace(/\s+/g, '').toUpperCase();

  // VAT numbers
  m = /VAT:\s*PL\s*(\d{10})/i.exec(text);
  if (m) out.seller_vat = `PL${m[1]}`;
  m = /GB\s*(\d{9})/i.exec(text);
  if (m) out.buyer_vat = `GB${m[1]}`;

  // Total in words (most reliable total field on Polish invoices)
  m = /In words:\s*(.+?)\s*PLN/i.exec(text);
  if (m) out.total_pln_words = m[1].trim();

  // Try to find product lines — pattern: lines containing EWI-\d+ or pigment / pallet / gladz
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const ln of lines) {
    if (/EWI-\d+|EWIPRO|PIGMENT|GLADZ|GŁADŹ|GLAZA|PALLET|paleta|paletu|RENO/i.test(ln)) {
      out.suspected_product_lines.push(ln);
    }
  }

  out.raw_lines = lines;
  return out;
}

async function parseKreiselOcr(pdfPath) {
  const text = await ocrPdf(pdfPath);
  const fields = extractFields(text);
  return {
    pdf: pdfPath,
    ocr_text_length: text.length,
    confidence_notes: [
      'invoice_no, date, container, VATs — high confidence (linear text)',
      'totals — best from "in words" (English/Polish words easier than digits)',
      'product table rows — LOW confidence, MUST be verified by operator',
    ],
    extracted: fields,
  };
}

module.exports = { parseKreiselOcr, extractFields };

if (require.main === module) {
  (async () => {
    const inPath = process.argv[2];
    if (!inPath) { console.error('Usage: node parse_kreisel_ocr.js <pdf>'); process.exit(1); }
    const r = await parseKreiselOcr(inPath);
    // Don't dump raw_lines to console (too noisy)
    const { raw_lines, ...show } = r.extracted;
    console.log(JSON.stringify({ ...r, extracted: { ...show, raw_lines_count: raw_lines.length } }, null, 2));
    await terminate();
  })().catch(async e => { console.error(e); await terminate(); process.exit(1); });
}
