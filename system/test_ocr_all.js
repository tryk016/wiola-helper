// Run OCR parser on all 5 Kreisel fixtures, summarize accuracy
const path = require('path');
const { parseKreiselOcr } = require('./parse_kreisel_ocr');
const { terminate } = require('./ocr_pdf');

const EXPECTED = {
  'kreisel_11_2026.pdf':  { invoice_no: '11/2026/EXP',  date: '2026-01-26', container: 'ECMU5405966' },
  'kreisel_38_2026.pdf':  { invoice_no: '38/2026/EXP',  date: '2026-02-16', container: 'CGMU8514020' },
  'kreisel_55_2026.pdf':  { invoice_no: '55/2026/EXP',  date: '2026-03-10', container: null }, // truck
  'kreisel_82_2026.pdf':  { invoice_no: '82/2026/EXP',  date: '2026-04-02', container: 'FFAU5409519' },
  'kreisel_201_2026.pdf': { invoice_no: '201/2026/EXP', date: '2026-05-29', container: 'CMAU6487821' },
};

(async () => {
  const results = [];
  for (const fn of Object.keys(EXPECTED)) {
    const p = path.join(__dirname, 'fixtures', fn);
    process.stderr.write(`\n[${fn}] OCR…`);
    const r = await parseKreiselOcr(p);
    results.push({ fn, expected: EXPECTED[fn], extracted: r.extracted });
  }
  await terminate();
  console.log('\n\n=== OCR metadata accuracy ===');
  console.log('file'.padEnd(28), 'invoice_no'.padEnd(16), 'date'.padEnd(12), 'container'.padEnd(14), 'verdict');
  let ok = 0, total = 0;
  for (const r of results) {
    const checks = [];
    if (r.extracted.invoice_no === r.expected.invoice_no) checks.push('inv✓'); else checks.push(`inv✗(${r.extracted.invoice_no})`);
    if (r.extracted.date === r.expected.date) checks.push('date✓'); else checks.push(`date✗(${r.extracted.date})`);
    if (r.expected.container === null) {
      checks.push('cont-(truck)');
    } else if (r.extracted.container === r.expected.container) {
      checks.push('cont✓');
    } else {
      checks.push(`cont✗(${r.extracted.container})`);
    }
    const allOk = checks.every(c => c.includes('✓') || c.includes('-'));
    if (allOk) ok++;
    total++;
    console.log(
      r.fn.padEnd(28),
      String(r.extracted.invoice_no).padEnd(16),
      String(r.extracted.date).padEnd(12),
      String(r.extracted.container || '-').padEnd(14),
      checks.join(' ')
    );
  }
  console.log(`\nSummary: ${ok}/${total} fully OK on metadata fields (invoice_no, date, container).`);
})().catch(async e => { console.error(e); await terminate(); process.exit(1); });
