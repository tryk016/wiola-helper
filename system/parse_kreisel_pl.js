// Parser of Polish "Faktura eksportowa" (Kreisel) — OCR text.
// Auto-detects from header "Faktura eksportowa VAT nr".
//
// Output (matches input shape expected by math.js):
//   {
//     invoice_no, kreisel_ref, issue_date, sale_date, container,
//     lines: [{ ewi_sku, qty_kreisel, qty_ewi, unit_pln, total_pln, raw_desc, is_sample, pkwiu, pcn }],
//     total_pln, total_pln_words
//   }
//
// Polish-format invoice already has qty/unit aligned with EWI Pro destination,
// so qty_kreisel === qty_ewi (no pigment remap needed). Test fixtures verified.

const { ocrPdf, terminate } = require('./ocr_pdf');
const { mapSku: mapSkuExternal, suggest } = require('./sku_mapping');

function plnNum(s) {
  if (s == null) return null;
  return parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
}

function parseDateYmd(s) {
  // 2026/04/02 or 2026-04-02
  const m = /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Use external mapping module (sku_mapping.js).
// Returns canonical dist code, or __PALLET__ / __SAMPLE__ for specials, or null for unknown.
const mapSku = mapSkuExternal;

// Parses OCR text of a Polish Kreisel invoice.
function parsePolishText(text) {
  const out = {
    invoice_no: null,
    kreisel_ref: null,
    issue_date: null,
    sale_date: null,
    container: null,
    lines: [],
    total_pln: null,
    total_pln_words: null,
    unmapped_lines: [],
    warnings: [],
  };

  let m = /Faktura eksportowa[^a-z]*?VAT[^\d]*?(?:\(S\))?FSE-?(\d+\/\d{4}\/EXP)/i.exec(text);
  if (m) {
    out.invoice_no = m[1];
    out.kreisel_ref = `FSE-${m[1]}`;
  } else if ((m = /(FSE-?\d+\/\d{4}\/EXP)/i.exec(text))) {
    out.kreisel_ref = m[1].replace(/^FSE-?/i, 'FSE-');
    out.invoice_no = out.kreisel_ref.replace(/^FSE-/, '');
  }

  m = /Data wystawienia:\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i.exec(text);
  if (m) out.issue_date = parseDateYmd(m[1]);

  m = /Data sprzeda[zż]y:\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i.exec(text);
  if (m) out.sale_date = parseDateYmd(m[1]);

  m = /Kontener:\s*([A-Z]{4}\s*\d{7})/i.exec(text);
  if (m) out.container = m[1].replace(/\s+/g, '').toUpperCase();

  // Total: prefer "Pozostaje do zapłaty"
  m = /Pozostaje do zap[lł]aty:\s*([\d\s]+,\d{2})\s*PLN/i.exec(text);
  if (m) out.total_pln = plnNum(m[1]);
  if (out.total_pln == null) {
    m = /Razem(?:\s*do zap[lł]aty)?:\s*([\d\s]+,\d{2})\s*PLN/i.exec(text);
    if (m) out.total_pln = plnNum(m[1]);
  }

  // Total in words (sanity)
  m = /([\w\sąćęłńóśźż]+?)\s*PLN\s*(\d+\/\d+)/i.exec(text);
  if (m) out.total_pln_words = m[1].trim() + ' ' + m[2];

  // Lines — regex matches: "<n> <desc> <PKWiU> <PCN> <qty> SZT|KG <unit> <total> PLN"
  // qty + unit + total all use Polish comma decimal.
  // PKWiU pattern: \d+\.\d+\.\d+\.\d+   PCN: 7-10 digits
  const lineRe = /^\s*(\d+)\s+(.+?)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d{6,12})\s+([\d\s]+,\d{2})\s+(SZT|KG)\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})\s+PLN\b/i;

  // Patterns that indicate a TEXT-only continuation line (description tail like "NAT 01 2,5KG", "BAZA D" etc.)
  const isContinuation = (s) => {
    if (!s) return false;
    if (lineRe.test(s)) return false;          // it's a new product line
    if (/^\s*\d+\s/.test(s)) return false;     // starts with line number — new line
    if (/^(L\.p\.|Razem|Pozostaje|Nabywca|Odbiorca|Bank|swift|Płatność|Kurs:|Data|Numer SAD|Opis:|BDO|NIP|Podpis|KREISEL|Kontener)/i.test(s)) return false;
    if (/^\s*$/.test(s)) return false;
    // must be reasonably short (description tail)
    if (s.length > 60) return false;
    return /[A-Za-zĄĘŁŃÓŚŻŹąęłńóśżź]/.test(s); // has letters
  };

  const lines = text.split('\n').map(l => l.trim());
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];
    const lm = lineRe.exec(ln);
    if (!lm) continue;
    let [_, nr, rawDesc, pkwiu, pcn, qtyS, unitMeasure, priceS, totalS] = lm;
    // Glue continuation line(s) to description
    let look = li + 1;
    while (look < lines.length && isContinuation(lines[look])) {
      rawDesc = (rawDesc + ' ' + lines[look]).replace(/\s+/g, ' ').trim();
      look++;
    }
    const qty = plnNum(qtyS);
    const unit_pln = plnNum(priceS);
    const total_pln = plnNum(totalS);
    // sanity per line: qty * unit ≈ total (±0.05 dla zaokrąglenia)
    if (Math.abs(qty * unit_pln - total_pln) > 0.05) {
      out.warnings.push(`Line ${nr}: qty*unit=${(qty * unit_pln).toFixed(2)} ≠ total=${total_pln.toFixed(2)}`);
    }
    const sku = mapSku(rawDesc);
    if (!sku) {
      const suggestions = suggest(rawDesc, 5);
      out.unmapped_lines.push({
        nr, raw_desc: rawDesc, qty, unit_pln, total_pln, pkwiu, pcn,
        suggestions: suggestions.map(s => ({ code: s.code, name: s.name, score: s._score, times_ordered: s.times_ordered })),
      });
      continue;
    }
    out.lines.push({
      ewi_sku: sku,
      qty_kreisel: qty,
      qty_ewi: qty,
      unit_pln,
      total_pln,
      raw_desc: rawDesc,
      pkwiu,
      pcn,
      unit_measure: unitMeasure,
      is_sample: unit_pln === 1.0 || sku === '__SAMPLE__',
      is_pigment: /^ZEN-D-|^PIGMENT-D-/i.test(sku) || /^PIGMENT-D-/i.test(rawDesc),
      is_pallet: sku === '__PALLET__',
    });
  }

  // sanity vs total_pln
  if (out.total_pln && out.lines.length) {
    const sum = out.lines.reduce((s, l) => s + l.total_pln, 0);
    if (Math.abs(sum - out.total_pln) > 0.05) {
      out.warnings.push(`Sum of lines ${sum.toFixed(2)} ≠ document total ${out.total_pln.toFixed(2)}`);
    }
  }

  return out;
}

async function parseKreiselPolishPdf(pdfPath) {
  const text = await ocrPdf(pdfPath);
  const fields = parsePolishText(text);
  return { pdf: pdfPath, ...fields };
}

module.exports = { parseKreiselPolishPdf, parsePolishText, mapSku };

if (require.main === module) {
  (async () => {
    const inPath = process.argv[2];
    if (!inPath) { console.error('Usage: node parse_kreisel_pl.js <pdf>'); process.exit(1); }
    const r = await parseKreiselPolishPdf(inPath);
    console.log(JSON.stringify(r, null, 2));
    await terminate();
  })().catch(async e => { console.error(e); await terminate(); process.exit(1); });
}
