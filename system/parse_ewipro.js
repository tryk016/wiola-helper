// Parse EWI Pro → EWI Store invoice PDF
// Output: { invoice_no, date, due_date, kreisel_ref, kreisel_date, pound_rate, lines, subtotal, vat_total, total }
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

function parseNum(s) {
  if (s == null) return null;
  return parseFloat(String(s).replace(/,/g, ''));
}

function parseDateDMY(s) {
  // 26/01/2026 -> 2026-01-26
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function parseEwiPro(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const result = await new PDFParse({ data: buf }).getText();
  const raw = result.text;

  const out = {
    invoice_no: null,
    date: null,
    due_date: null,
    terms: null,
    kreisel_ref: null,
    kreisel_date: null,
    pound_rate: null,
    lines: [],
    subtotal: null,
    vat_total: null,
    total: null,
  };

  // simple line-by-line scan
  const lines = raw.split('\n').map(l => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m;
    if ((m = /^INVOICE NO\.\s+(\S+)/.exec(L))) out.invoice_no = m[1];
    else if ((m = /^DATE\s+(\d{2}\/\d{2}\/\d{4})$/.exec(L))) out.date = parseDateDMY(m[1]);
    else if ((m = /^DUE DATE\s+(\d{2}\/\d{2}\/\d{4})$/.exec(L))) out.due_date = parseDateDMY(m[1]);
    else if ((m = /^TERMS\s+(.+)$/.exec(L))) out.terms = m[1];
    else if ((m = /^([\d.]+)-\s*pound rate$/.exec(L))) out.pound_rate = parseNum(m[1]);
    else if ((m = /^(FSE-[^\s]+)\s+(\d{2}\/\d{2}\/\d{4})$/.exec(L))) {
      out.kreisel_ref = m[1];
      out.kreisel_date = parseDateDMY(m[2]);
    } else if ((m = /^SUBTOTAL\s+([\d,]+\.\d+)$/.exec(L))) out.subtotal = parseNum(m[1]);
    else if ((m = /^VAT TOTAL\s+([\d,]+\.\d+)$/.exec(L))) out.vat_total = parseNum(m[1]);
    else if ((m = /^TOTAL\s+([\d,]+\.\d+)$/.exec(L))) out.total = parseNum(m[1]);
  }

  // Lines: each line has shape (potentially multi-row):
  //   <description...> <VAT_RATE>%
  //   S
  //   <qty> <rate> <amount>
  // OR
  //   <description...>
  //   <description cont...>
  //   <VAT_RATE>%
  //   S
  //   <qty> <rate> <amount>
  //
  // Strategy: find "<NUMBER>%\nS\n<num> <num> <num>" anchors and walk back to collect description.
  const lns = lines; // alias
  const isQtyRateAmount = s =>
    /^\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+[\d,]+\.\d+\s*$/.test(s);

  // anchor: a line that ENDS with VAT% (e.g. "EWI-269 25KG 20.0%" or "20.0%"), followed by "S", followed by qty rate amount
  const vatEndRe = /^(.*?)(\d+\.\d+)%$/;
  for (let i = 0; i < lns.length; i++) {
    const vm = vatEndRe.exec(lns[i]);
    if (!vm) continue;
    if (lns[i + 1] !== 'S') continue;
    if (!isQtyRateAmount(lns[i + 2])) continue;
    const inlineDesc = vm[1].trim();
    const vatRateStr = vm[2];
    const [qtyS, rateS, amtS] = lns[i + 2].trim().split(/\s+/);
    // walk back to collect any additional description lines until prev record or header
    const desc = [];
    let j = i - 1;
    while (j >= 0) {
      const t = lns[j];
      if (
        t === '' ||
        isQtyRateAmount(t) ||
        vatEndRe.test(t) ||
        t === 'S' ||
        /^DATE ACTIVITY DESCRIPTION/.test(t) ||
        /SUBTOTAL/.test(t) ||
        /-\s*pound rate$/.test(t) ||
        /^FSE-/.test(t)
      )
        break;
      desc.unshift(t);
      j--;
    }
    if (inlineDesc) desc.push(inlineDesc);
    const description = desc.join(' ').trim();
    if (!description) continue;
    out.lines.push({
      description,
      vat_rate: parseFloat(vatRateStr),
      qty: parseNum(qtyS),
      rate: parseNum(rateS),
      amount: parseNum(amtS),
    });
    i += 2;
  }

  return out;
}

module.exports = { parseEwiPro };

if (require.main === module) {
  (async () => {
    const path = process.argv[2];
    if (!path) {
      console.error('Usage: node parse_ewipro.js <pdf>');
      process.exit(1);
    }
    console.log(JSON.stringify(await parseEwiPro(path), null, 2));
  })();
}
