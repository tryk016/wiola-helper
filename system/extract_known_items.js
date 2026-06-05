// Parse a batch of historical EWI Pro -> EWI Store invoice PDFs.
// Extract distinct Item names, build comprehensive mapping reference.
//
// Usage:
//   node extract_known_items.js [folder]   ← default: C:/kreisel/historical_invoices

const fs = require('fs');
const path = require('path');
const { parseEwiPro } = require('./parse_ewipro');

const DEFAULT_FOLDER = 'C:/kreisel/historical_invoices';

(async () => {
  const folder = process.argv[2] || DEFAULT_FOLDER;
  if (!fs.existsSync(folder)) {
    console.error('Folder not found:', folder);
    process.exit(1);
  }
  const pdfs = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`Folder: ${folder}`);
  console.log(`PDFs found: ${pdfs.length}\n`);

  const items = new Map(); // description → { count, rates: Set, examples: [{invoice, qty, rate, amount}] }
  const invoices = [];
  const errors = [];

  for (const pdf of pdfs) {
    const fullPath = path.join(folder, pdf);
    try {
      const parsed = await parseEwiPro(fullPath);
      invoices.push({
        file: pdf,
        invoice_no: parsed.invoice_no,
        date: parsed.date,
        kreisel_ref: parsed.kreisel_ref,
        pound_rate: parsed.pound_rate,
        subtotal: parsed.subtotal,
        lines: parsed.lines.length,
      });
      for (const l of parsed.lines) {
        const key = l.description;
        if (!items.has(key)) {
          items.set(key, { count: 0, rates: new Set(), examples: [] });
        }
        const it = items.get(key);
        it.count++;
        it.rates.add(l.rate);
        if (it.examples.length < 3) {
          it.examples.push({ invoice: parsed.invoice_no, qty: l.qty, rate: l.rate, amount: l.amount });
        }
      }
    } catch (e) {
      errors.push({ file: pdf, error: e.message });
    }
  }

  // === REPORT ===
  console.log('═'.repeat(78));
  console.log('PARSED INVOICES');
  console.log('═'.repeat(78));
  invoices.sort((a, b) => (a.invoice_no || '').localeCompare(b.invoice_no || ''));
  invoices.forEach(i => {
    console.log(`  #${(i.invoice_no || '?').padEnd(6)}  ${(i.date || '').padEnd(11)}  ${(i.kreisel_ref || '').padEnd(20)}  rate=${i.pound_rate}  £${i.subtotal}  (${i.lines} lines)`);
  });
  console.log(`\n  Total: ${invoices.length} invoices, ${errors.length} errors`);
  if (errors.length) errors.forEach(e => console.log(`  ✗ ${e.file}: ${e.error.split('\n')[0]}`));

  console.log('\n' + '═'.repeat(78));
  console.log('DISTINCT ITEM NAMES (sorted by usage)');
  console.log('═'.repeat(78));
  const sorted = [...items.entries()].sort((a, b) => b[1].count - a[1].count);
  sorted.forEach(([name, info]) => {
    const ratesArr = [...info.rates].sort((a, b) => a - b);
    const rateStr = ratesArr.length === 1 ? `rate=${ratesArr[0]}` : `rates=[${ratesArr.slice(0, 5).join(', ')}${ratesArr.length > 5 ? '...' : ''}]`;
    console.log(`  ${String(info.count).padStart(3)}×  "${name}"`);
    console.log(`         ${rateStr}`);
    info.examples.slice(0, 1).forEach(ex => {
      console.log(`         e.g. #${ex.invoice}: ${ex.qty} × ${ex.rate} = ${ex.amount}`);
    });
  });

  console.log(`\n  Total: ${items.size} distinct Item names`);

  // === SAVE JSON ===
  const outFile = path.join(__dirname, 'ewi_pro_known_items.json');
  const out = {
    generated_at: new Date().toISOString().slice(0, 10),
    invoices_parsed: invoices.length,
    distinct_items: items.size,
    items: sorted.map(([name, info]) => ({
      name,
      times_used: info.count,
      rates_used: [...info.rates].sort((a, b) => a - b),
      examples: info.examples,
    })),
    parsed_invoices: invoices,
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\n✓ Saved: ${outFile}`);
})().catch(e => { console.error(e); process.exit(1); });
