// Full pipeline test: Polish Kreisel PDF → OCR → parse → resolve HMRC → math → compare with EWI Pro PDF
const path = require('path');
const { parseKreiselPolishPdf } = require('./parse_kreisel_pl');
const { terminate } = require('./ocr_pdf');
const { parseEwiPro } = require('./parse_ewipro');
const { resolveImport } = require('./resolve_import');
const { getRate } = require('./hmrc_rate');
const { buildEwiproInvoice, roundHalfUp } = require('./math');

const PAIRS = [
  { kreisel: 'kreisel_11_2026_v2.pdf',  ewipro: 'ewipro_4703.pdf' },
  { kreisel: 'kreisel_38_2026_v2.pdf',  ewipro: 'ewipro_4745.pdf' },
  { kreisel: 'kreisel_55_2026_v2.pdf',  ewipro: 'ewipro_4785.pdf' },
  { kreisel: 'kreisel_82_2026_v2.pdf',  ewipro: 'ewipro_4817.pdf' },
];

const TOL = { line_reg: 0.011, line_pal: 0.10, line_sample: 0.30, line_pigment: 0.50, subtotal: 0.60 };

function tolFor(l) {
  if (l.is_pigment) return TOL.line_pigment;
  if (l.is_sample) return TOL.line_sample;
  if (/^Pallet$/i.test(l.ewi_sku)) return TOL.line_pal;
  return TOL.line_reg;
}

(async () => {
  const results = [];
  for (const { kreisel, ewipro } of PAIRS) {
    process.stderr.write(`\n[${kreisel}] parsing…\n`);
    const k = await parseKreiselPolishPdf(path.join(__dirname, 'fixtures', kreisel));
    if (k.unmapped_lines.length) {
      results.push({ kreisel, status: 'unmapped', detail: k.unmapped_lines });
      continue;
    }
    // Resolve HMRC month
    const resolved = await resolveImport(k.invoice_no);
    if (resolved.status !== 'ok') {
      results.push({ kreisel, status: 'resolver_blocked', detail: resolved });
      continue;
    }
    const hmrc = await getRate(resolved.hmrc_month, 'PLN');
    // Math
    const computed = buildEwiproInvoice(
      { kreisel_invoice: k.invoice_no, lines: k.lines },
      hmrc.rate
    );
    // Ground truth
    const parsed = await parseEwiPro(path.join(__dirname, 'fixtures', ewipro));
    // Compare
    const lineRows = [];
    let maxLineDelta = 0;
    let issues = [];
    if (computed.lines.length !== parsed.lines.length) {
      issues.push(`line count mismatch: computed=${computed.lines.length} parsed=${parsed.lines.length}`);
    }
    const n = Math.min(computed.lines.length, parsed.lines.length);
    for (let i = 0; i < n; i++) {
      const c = computed.lines[i], p = parsed.lines[i];
      const tol = tolFor(c);
      const d = c.amount_gbp - p.amount;
      maxLineDelta = Math.max(maxLineDelta, Math.abs(d));
      const ok = Math.abs(d) <= tol + 1e-9;
      lineRows.push({ i: i+1, sku: c.ewi_sku, qty: c.qty, rate_c: c.rate_gbp, rate_p: p.rate, amt_c: c.amount_gbp, amt_p: p.amount, delta: roundHalfUp(d, 4), tol, ok });
      if (!ok) issues.push(`line ${i+1} ${c.ewi_sku}: Δ=${d.toFixed(2)} > ${tol}`);
    }
    const subΔ = computed.subtotal - parsed.subtotal;
    if (Math.abs(subΔ) > TOL.subtotal) issues.push(`subtotal Δ=${subΔ.toFixed(2)} > ${TOL.subtotal}`);
    results.push({
      kreisel, ewipro,
      status: issues.length ? 'fail' : 'pass',
      kreisel_ref: k.kreisel_ref,
      hmrc_month: resolved.hmrc_month,
      hmrc_rate: hmrc.rate,
      resolver_source: resolved.source,
      total_pln_doc: k.total_pln,
      subtotal_computed: computed.subtotal,
      subtotal_parsed: parsed.subtotal,
      subtotal_delta: roundHalfUp(subΔ, 2),
      max_line_delta: roundHalfUp(maxLineDelta, 4),
      issues,
      lines: lineRows,
      warnings: k.warnings,
    });
  }
  await terminate();

  console.log('\n');
  for (const r of results) {
    console.log('═'.repeat(80));
    console.log(`Pair: ${r.kreisel} ↔ ${r.ewipro}`);
    if (r.status === 'unmapped') {
      console.log(`  ❌ UNMAPPED LINES (need mapping):`);
      r.detail.forEach(u => console.log(`    - ${u.raw_desc}`));
      continue;
    }
    if (r.status === 'resolver_blocked') {
      console.log(`  🚫 RESOLVER BLOCKED: ${r.detail.status}`);
      continue;
    }
    console.log(`  ${r.kreisel_ref} | HMRC ${r.hmrc_month} ${r.hmrc_rate} via ${r.resolver_source}`);
    console.log(`  Total PLN (doc): ${r.total_pln_doc}`);
    console.log(`  Subtotal GBP computed=${r.subtotal_computed.toFixed(2)} parsed=${r.subtotal_parsed.toFixed(2)} Δ=${r.subtotal_delta.toFixed(2)}`);
    console.log(`  Max line Δ=${r.max_line_delta.toFixed(4)}`);
    if (r.warnings.length) r.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    console.log('');
    console.log(['#', 'SKU'.padEnd(40), 'qty'.padStart(7), 'r_c'.padStart(8), 'r_p'.padStart(8), 'amt_c'.padStart(10), 'amt_p'.padStart(10), 'Δ'.padStart(8), 'ok'].join(' '));
    r.lines.forEach(l => {
      console.log([
        String(l.i),
        l.sku.padEnd(40).slice(0, 40),
        String(l.qty).padStart(7),
        String(l.rate_c).padStart(8),
        String(l.rate_p).padStart(8),
        l.amt_c.toFixed(2).padStart(10),
        l.amt_p.toFixed(2).padStart(10),
        l.delta.toFixed(2).padStart(8),
        l.ok ? '✓' : '✗',
      ].join(' '));
    });
    console.log(r.status === 'pass' ? '  ✅ PASS' : `  ❌ FAIL: ${r.issues.length} issues`);
  }
  const npass = results.filter(r => r.status === 'pass').length;
  console.log('\n' + '═'.repeat(80));
  console.log(`SUMMARY: ${npass}/${results.length} polish PDF pipeline runs PASS`);
})().catch(async e => { console.error(e); await terminate(); process.exit(1); });
