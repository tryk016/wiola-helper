// Reconciliation engine — Phase 0 (no QBO).
// For each fixture: take Kreisel input + HMRC rate, build EWI Pro invoice GBP,
// compare against parsed EWI Pro PDF.

const fs = require('fs');
const path = require('path');
const { parseEwiPro } = require('./parse_ewipro');
const { getRate } = require('./hmrc_rate');
const { buildEwiproInvoice, roundHalfUp } = require('./math');
const { resolveImport } = require('./resolve_import');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const INPUTS = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'kreisel_inputs.json'), 'utf8')
);

const TOL = {
  line_regular: 0.011,
  line_pigment: 0.50,
  line_sample: 0.30, // groszowe: 1.00 PLN — historic rounding varied (2 vs 3 dp)
  line_pallet: 0.10,
  subtotal: 0.60,
  cross_check: 0.60, // total_pln / hmrc ≈ subtotal_gbp
};

function tolFor(line) {
  if (line.is_pigment) return TOL.line_pigment;
  if (line.is_sample) return TOL.line_sample;
  if (/^Pallet$/i.test(line.ewi_sku)) return TOL.line_pallet;
  return TOL.line_regular;
}

function within(a, b, tol) {
  return Math.abs(a - b) <= tol + 1e-9;
}

function fmt(n) {
  return (typeof n === 'number' ? n.toFixed(2) : String(n)).padStart(10);
}

async function reconcile(fixtureKey) {
  const input = INPUTS[fixtureKey];
  if (!input) throw new Error(`No input fixture: ${fixtureKey}`);

  // 1a. Resolve HMRC month live: Magemar Excel (containers) → MySQL fallback (trucks)
  const resolved = await resolveImport(input.kreisel_invoice);
  if (resolved.status !== 'ok') {
    return {
      fixture: fixtureKey,
      pass: false,
      blocked: true,
      resolver_status: resolved.status,
      resolver_detail: resolved,
      issues: [`BLOCKED by resolver: ${resolved.status}`],
      lines: [],
    };
  }

  // 1b. Sanity vs fixture's expected month (regression guard)
  if (input.expected_hmrc_month && resolved.hmrc_month !== input.expected_hmrc_month) {
    return {
      fixture: fixtureKey,
      pass: false,
      blocked: false,
      issues: [`RESOLVER drift: got ${resolved.hmrc_month} via ${resolved.source}, fixture says ${input.expected_hmrc_month}`],
      resolver_detail: resolved,
      lines: [],
    };
  }

  // 1c. Fetch HMRC rate for resolved month
  const hmrc = await getRate(resolved.hmrc_month, 'PLN');
  if (input.expected_hmrc_rate && Math.abs(hmrc.rate - input.expected_hmrc_rate) > 1e-6) {
    throw new Error(`HMRC mismatch for ${fixtureKey}: ${hmrc.rate} vs ${input.expected_hmrc_rate}`);
  }

  // 2. Build computed invoice
  const computed = buildEwiproInvoice(input, hmrc.rate);

  // 3. Parse the corresponding EWI Pro PDF as ground truth
  const ewiproNo = ({
    kreisel_11_2026: 4703,
    kreisel_38_2026: 4745,
    kreisel_55_2026: 4785,
    kreisel_82_2026: 4817,
    kreisel_201_2026: 4993,
  })[fixtureKey];
  const pdfPath = path.join(FIXTURE_DIR, `ewipro_${ewiproNo}.pdf`);
  const parsed = await parseEwiPro(pdfPath);

  // 4. Compare line by line (order assumed to match)
  const issues = [];
  if (computed.lines.length !== parsed.lines.length) {
    issues.push(`LINE COUNT MISMATCH: computed=${computed.lines.length} parsed=${parsed.lines.length}`);
  }

  const lineRows = [];
  const nlines = Math.min(computed.lines.length, parsed.lines.length);
  let maxLineDelta = 0;
  for (let i = 0; i < nlines; i++) {
    const c = computed.lines[i];
    const p = parsed.lines[i];
    const tol = tolFor(c);
    const dAmt = c.amount_gbp - p.amount;
    if (Math.abs(dAmt) > maxLineDelta) maxLineDelta = Math.abs(dAmt);
    const pass = within(c.amount_gbp, p.amount, tol);
    if (!pass) {
      issues.push(
        `LINE ${i + 1} [${c.ewi_sku}] amount diff ${dAmt.toFixed(2)} > tol ${tol} (computed=${c.amount_gbp}, parsed=${p.amount})`
      );
    }
    lineRows.push({
      sku: c.ewi_sku,
      qty: c.qty,
      rate_c: c.rate_gbp,
      rate_p: p.rate,
      amt_c: c.amount_gbp,
      amt_p: p.amount,
      delta: roundHalfUp(dAmt, 4),
      tol,
      pass,
      tag: c.is_pigment ? 'pigment' : c.is_sample ? 'sample' : /^Pallet$/i.test(c.ewi_sku) ? 'pallet' : 'regular',
    });
  }

  // 5. Subtotal / totals
  const dSub = computed.subtotal - parsed.subtotal;
  if (!within(computed.subtotal, parsed.subtotal, TOL.subtotal)) {
    issues.push(`SUBTOTAL diff ${dSub.toFixed(2)} > tol ${TOL.subtotal} (computed=${computed.subtotal}, parsed=${parsed.subtotal})`);
  }
  // VAT and total are derived, so subtotal is the only independent check here

  // 6. Cross-check: total_pln / hmrc ≈ subtotal_gbp
  const crossExpected = roundHalfUp(computed.total_pln_kreisel / hmrc.rate, 2);
  const dCross = crossExpected - parsed.subtotal;
  if (!within(crossExpected, parsed.subtotal, TOL.cross_check)) {
    issues.push(
      `CROSS-CHECK diff ${dCross.toFixed(2)} > tol ${TOL.cross_check} (total_pln/hmrc=${crossExpected}, parsed_subtotal=${parsed.subtotal})`
    );
  }

  // 7. Parser sanity: pound rate matches HMRC
  if (parsed.pound_rate && Math.abs(parsed.pound_rate - hmrc.rate) > 1e-6) {
    issues.push(`PDF pound_rate ${parsed.pound_rate} ≠ HMRC ${hmrc.rate}`);
  }

  // 8. Kreisel ref matches
  const expectedRef = `FSE-${input.kreisel_invoice}`;
  if (parsed.kreisel_ref !== expectedRef) {
    issues.push(`Kreisel ref mismatch: parsed=${parsed.kreisel_ref} expected=${expectedRef}`);
  }

  return {
    fixture: fixtureKey,
    ewipro_no: ewiproNo,
    hmrc_rate: hmrc.rate,
    hmrc_month: `${hmrc.year}-${String(hmrc.month).padStart(2, '0')}`,
    resolver_source: resolved.source,
    resolver_detail: { ata_uk: resolved.ata_uk, container: resolved.truck_reg, confidence: resolved.confidence },
    computed_subtotal: computed.subtotal,
    parsed_subtotal: parsed.subtotal,
    subtotal_delta: roundHalfUp(dSub, 2),
    cross_check_pln_over_hmrc: crossExpected,
    cross_check_delta: roundHalfUp(dCross, 2),
    max_line_delta: roundHalfUp(maxLineDelta, 4),
    lines: lineRows,
    pass: issues.length === 0,
    issues,
  };
}

async function main() {
  const keys = Object.keys(INPUTS);
  const results = [];
  for (const k of keys) {
    const r = await reconcile(k);
    results.push(r);
  }

  // print report
  for (const r of results) {
    console.log('\n' + '═'.repeat(78));
    console.log(`Fixture: ${r.fixture}`);
    if (r.blocked) {
      console.log(`  🚫 BLOCKED by resolver: ${r.resolver_status}`);
      console.log('  ' + JSON.stringify(r.resolver_detail));
      continue;
    }
    console.log(`Fixture: ${r.fixture}  →  EWI Pro #${r.ewipro_no}`);
    const conf = r.resolver_detail && r.resolver_detail.confidence ? ` [${r.resolver_detail.confidence}]` : '';
    const ata = r.resolver_detail && r.resolver_detail.ata_uk ? `, ATA=${r.resolver_detail.ata_uk}` : '';
    console.log(`HMRC ${r.hmrc_month}: ${r.hmrc_rate} PLN/£1  (resolver: ${r.resolver_source}${ata}${conf})`);
    console.log(`Subtotal computed=${r.computed_subtotal.toFixed(2)}  parsed=${r.parsed_subtotal.toFixed(2)}  Δ=${r.subtotal_delta.toFixed(2)}`);
    console.log(`Cross-check (PLN/HMRC)=${r.cross_check_pln_over_hmrc.toFixed(2)}  Δ=${r.cross_check_delta.toFixed(2)}`);
    console.log(`Max line Δ=${(r.max_line_delta || 0).toFixed(4)}`);
    console.log('');
    console.log(
      ['#', 'SKU'.padEnd(40), 'tag'.padEnd(8), 'qty'.padStart(7), 'r_c'.padStart(8), 'r_p'.padStart(8), 'amt_c'.padStart(10), 'amt_p'.padStart(10), 'Δ'.padStart(8), 'tol'.padStart(6), 'ok'].join(' ')
    );
    r.lines.forEach((l, i) => {
      console.log(
        [
          String(i + 1),
          l.sku.padEnd(40).slice(0, 40),
          l.tag.padEnd(8),
          String(l.qty).padStart(7),
          String(l.rate_c).padStart(8),
          String(l.rate_p).padStart(8),
          fmt(l.amt_c),
          fmt(l.amt_p),
          String(l.delta.toFixed(2)).padStart(8),
          String(l.tol).padStart(6),
          l.pass ? '✓' : '✗',
        ].join(' ')
      );
    });

    if (r.issues.length === 0) {
      console.log('\n  ✅ PASS');
    } else {
      console.log('\n  ❌ ISSUES:');
      r.issues.forEach(i => console.log('   - ' + i));
    }
  }

  // summary
  console.log('\n' + '═'.repeat(78));
  const npass = results.filter(r => r.pass).length;
  const nblock = results.filter(r => r.blocked).length;
  const nfail = results.length - npass - nblock;
  console.log(`SUMMARY: ${npass} PASS · ${nblock} BLOCKED · ${nfail} FAIL · of ${results.length}`);
  if (nfail === 0) {
    console.log('🎉 No failures. Blocked fixtures correctly held back by safety gates.');
  } else {
    console.log('Fixtures with failures:');
    results.filter(r => !r.pass && !r.blocked).forEach(r => console.log(`  - ${r.fixture}: ${r.issues.length} issue(s)`));
    process.exit(1);
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
