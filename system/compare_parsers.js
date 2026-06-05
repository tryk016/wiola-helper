// Side-by-side comparison: Tesseract+regex vs Claude vision LLM
const path = require('path');
const fs = require('fs');
const { parseKreiselPolishPdf } = require('./parse_kreisel_pl');
const { terminate: terminateOcr } = require('./ocr_pdf');
const { parseKreiselWithLlm } = require('./parse_kreisel_llm');

const PDFS = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'C:/kreisel/inbox/DOC250526-25052026082504-0001.pdf',
      'C:/kreisel/inbox/DOC290526-29052026130505-0001.pdf',
      'C:/kreisel/inbox/Page0003.pdf',
    ]);

// Claude Sonnet 4.5 pricing (per 1M tokens): $3 input, $15 output
const PRICE_IN = 3 / 1_000_000;
const PRICE_OUT = 15 / 1_000_000;

(async () => {
  const results = [];
  for (const pdf of PDFS) {
    if (!fs.existsSync(pdf)) { console.error('skip (not found):', pdf); continue; }
    const name = path.basename(pdf);
    console.log(`\n[${name}]`);

    // Tesseract
    process.stderr.write('  Tesseract… ');
    const t0 = Date.now();
    let tess = { error: null };
    try { tess = await parseKreiselPolishPdf(pdf); } catch (e) { tess.error = e.message; }
    const tessMs = Date.now() - t0;
    console.error(`${tessMs}ms`);

    // LLM
    process.stderr.write('  Claude…    ');
    const l0 = Date.now();
    let llm = { error: null };
    try { llm = await parseKreiselWithLlm(pdf); } catch (e) { llm.error = e.message; }
    const llmMs = Date.now() - l0;
    console.error(`${llmMs}ms`);

    results.push({ pdf: name, tess, llm });
  }
  await terminateOcr();

  // Report
  console.log('\n' + '═'.repeat(100));
  console.log('PARSER COMPARISON REPORT');
  console.log('═'.repeat(100));

  for (const r of results) {
    console.log(`\n┌─ ${r.pdf}`);
    console.log(`│  ${'Field'.padEnd(20)}  ${'Tesseract'.padEnd(28)}  ${'Claude LLM'.padEnd(28)}`);
    console.log(`│  ${'-'.repeat(20)}  ${'-'.repeat(28)}  ${'-'.repeat(28)}`);
    console.log(`│  ${'invoice_no'.padEnd(20)}  ${String(r.tess.invoice_no || '?').padEnd(28)}  ${String(r.llm.invoice_no || '?').padEnd(28)}`);
    console.log(`│  ${'kreisel_ref'.padEnd(20)}  ${String(r.tess.kreisel_ref || '?').padEnd(28)}  ${String(r.llm.kreisel_ref || '?').padEnd(28)}`);
    console.log(`│  ${'issue_date'.padEnd(20)}  ${String(r.tess.issue_date || '?').padEnd(28)}  ${String(r.llm.issue_date || '?').padEnd(28)}`);
    console.log(`│  ${'container'.padEnd(20)}  ${String(r.tess.container || '(none)').padEnd(28)}  ${String(r.llm.container || '(none)').padEnd(28)}`);
    console.log(`│  ${'total_pln'.padEnd(20)}  ${String(r.tess.total_pln || '?').padEnd(28)}  ${String(r.llm.total_pln || '?').padEnd(28)}`);
    console.log(`│  ${'lines mapped'.padEnd(20)}  ${String((r.tess.lines || []).length).padEnd(28)}  ${String((r.llm.lines || []).length).padEnd(28)}`);
    console.log(`│  ${'lines unmapped'.padEnd(20)}  ${String((r.tess.unmapped_lines || []).length).padEnd(28)}  ${String((r.llm.unmapped_lines || []).length).padEnd(28)}`);
    if (r.llm._meta) {
      const cost = (r.llm._meta.input_tokens * PRICE_IN + r.llm._meta.output_tokens * PRICE_OUT);
      console.log(`│  ${'LLM tokens'.padEnd(20)}  ${''.padEnd(28)}  ${(r.llm._meta.input_tokens + ' in / ' + r.llm._meta.output_tokens + ' out').padEnd(28)}`);
      console.log(`│  ${'LLM cost'.padEnd(20)}  ${''.padEnd(28)}  ${('$' + cost.toFixed(4) + ' / ≈ £' + (cost * 0.79).toFixed(4)).padEnd(28)}`);
    }
    // Compare lines that one has but other doesn't
    const tessSkus = new Set((r.tess.lines || []).map(l => l.ewi_sku));
    const llmSkus = new Set((r.llm.lines || []).map(l => l.ewi_sku));
    const onlyTess = [...tessSkus].filter(s => !llmSkus.has(s));
    const onlyLlm = [...llmSkus].filter(s => !tessSkus.has(s));
    if (onlyTess.length || onlyLlm.length) {
      console.log(`│  ${'only Tesseract'.padEnd(20)}  ${onlyTess.join(', ').slice(0, 60)}`);
      console.log(`│  ${'only LLM'.padEnd(20)}  ${onlyLlm.join(', ').slice(0, 60)}`);
    }
    if (r.tess.error) console.log(`│  Tesseract ERROR: ${r.tess.error}`);
    if (r.llm.error) console.log(`│  LLM ERROR: ${r.llm.error}`);
    console.log('└─');
  }

  // Totals
  const totalCost = results.reduce((s, r) => s + (r.llm._meta
    ? r.llm._meta.input_tokens * PRICE_IN + r.llm._meta.output_tokens * PRICE_OUT
    : 0), 0);
  const totalLatencyTess = results.reduce((s, r) => s + ((r.tess && !r.tess.error) ? 1 : 0), 0);
  const totalLatencyLlm = results.reduce((s, r) => s + ((r.llm._meta && r.llm._meta.latency_ms) || 0), 0);

  console.log('\n' + '═'.repeat(100));
  console.log(`Total invoices: ${results.length}`);
  console.log(`Total LLM cost: $${totalCost.toFixed(4)} ≈ £${(totalCost * 0.79).toFixed(4)}`);
  console.log(`Avg LLM cost/invoice: $${(totalCost / results.length).toFixed(4)} ≈ £${(totalCost / results.length * 0.79).toFixed(4)}`);
  console.log(`Avg LLM latency: ${Math.round(totalLatencyLlm / results.length)}ms`);
  console.log(`Annual estimate @ 250 invoices/yr: £${(totalCost / results.length * 0.79 * 250).toFixed(2)}`);
})().catch(e => { console.error(e); process.exit(1); });
