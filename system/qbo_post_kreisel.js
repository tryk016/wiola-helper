// Main CLI — process a Kreisel PDF end-to-end.
//
// Usage:
//   node qbo_post_kreisel.js <kreisel.pdf>                 # dry-run preview (default)
//   node qbo_post_kreisel.js <kreisel.pdf> --post          # actually post to QBO sandbox
//
// Pipeline:
//   1. OCR + parse Polish Kreisel invoice
//   2. Resolve HMRC month (Magemar / MySQL / +13d predict)
//   3. Fetch HMRC rate
//   4. Build 3 payloads (Bill PLN Kreisel, Invoice GBP, Bill GBP EWI Pro)
//   5. Print preview
//   6. If --post: post Bill_Pro, Invoice_Pro, then Bill_Store (matching DocNumber)

const path = require('path');
const { parseKreiselPolishPdf } = require('./parse_kreisel_pl');
const { terminate: terminateOcr } = require('./ocr_pdf');
const { resolveImport } = require('./resolve_import');
const { getRate } = require('./hmrc_rate');
const { getClient } = require('./qbo_client');
const { buildKreiselBill, buildEwiproInvoice, buildEwistoreBillFromInvoice, attachPdfToTxn, attachPdfBufferToTxn } = require('./qbo_payloads');

function fmtMoney(n, cur) {
  return (typeof n === 'number' ? n.toFixed(2) : n) + (cur ? ' ' + cur : '');
}

function previewBill(label, payload, currency) {
  console.log(`\n┌─ ${label} ─ DocNumber=${payload.DocNumber || '(auto)'} ─ ${payload.TxnDate} due ${payload.DueDate}`);
  console.log(`│  Currency: ${payload.CurrencyRef.value}  ${payload.ExchangeRate ? '(rate ' + payload.ExchangeRate + ' GBP per 1 PLN)' : ''}`);
  let sum = 0;
  payload.Line.forEach((l, i) => {
    const d = l.ItemBasedExpenseLineDetail || l.AccountBasedExpenseLineDetail || l.SalesItemLineDetail;
    const tax = d && d.TaxCodeRef ? d.TaxCodeRef.value : '-';
    const qty = d && d.Qty != null ? d.Qty : '';
    const up = d && d.UnitPrice != null ? d.UnitPrice : '';
    console.log(`│  ${String(i + 1).padStart(2)}. ${(l.Description || '').padEnd(40)} ${String(qty).padStart(6)} × ${String(up).padStart(8)} = ${fmtMoney(l.Amount).padStart(10)} ${currency} [tax ${tax}]`);
    sum += l.Amount;
  });
  console.log(`│  Subtotal: ${fmtMoney(sum)} ${currency}   (VAT @20% will add ${fmtMoney(sum * 0.20)})`);
  console.log('└─');
}

async function main() {
  const args = process.argv.slice(2);
  const pdfArg = args.find(a => !a.startsWith('--'));
  const doPost = args.includes('--post');
  if (!pdfArg) {
    console.error('Usage: node qbo_post_kreisel.js <kreisel.pdf> [--post]');
    process.exit(1);
  }
  const pdfPath = path.isAbsolute(pdfArg) ? pdfArg : path.join(__dirname, pdfArg);

  console.log(`Pipeline starting for: ${pdfPath}`);
  console.log(`Mode: ${doPost ? '🟢 POSTING TO QBO SANDBOX' : '🟡 DRY-RUN (preview only)'}`);

  // 1. OCR + parse
  console.log('\n[1/5] OCR + parse…');
  const k = await parseKreiselPolishPdf(pdfPath);
  await terminateOcr();
  if (k.unmapped_lines.length) {
    console.error('\n❌ UNMAPPED LINES — STOPPING. Add to parse_kreisel_pl::mapSku:');
    k.unmapped_lines.forEach(u => console.error(`  - "${u.raw_desc}"`));
    process.exit(2);
  }
  console.log(`  ✓ ${k.kreisel_ref}, ${k.issue_date}, container ${k.container || '(truck)'}, ${k.lines.length} lines, total ${k.total_pln} PLN`);
  if (k.warnings.length) k.warnings.forEach(w => console.log(`  ⚠️  ${w}`));

  // 2. Resolve HMRC month
  console.log('\n[2/5] Resolve HMRC month…');
  const resolved = await resolveImport(k.invoice_no);
  if (resolved.status !== 'ok') {
    console.error(`\n❌ Resolver blocked: ${resolved.status}`);
    console.error(JSON.stringify(resolved, null, 2));
    process.exit(3);
  }
  console.log(`  ✓ HMRC month: ${resolved.hmrc_month} (${resolved.confidence} via ${resolved.source})`);
  if (resolved.ata_uk) console.log(`     ATA Tilbury: ${resolved.ata_uk}`);
  if (resolved.predicted_ata_uk) console.log(`     Predicted ATA: ${resolved.predicted_ata_uk}`);

  // 3. HMRC rate
  console.log('\n[3/5] Fetch HMRC rate…');
  const hmrc = await getRate(resolved.hmrc_month, 'PLN');
  console.log(`  ✓ ${hmrc.rate} PLN/£1   (ExchangeRate field for PLN Bill = ${(1 / hmrc.rate).toFixed(7)})`);

  // 4. Build payloads
  console.log('\n[4/5] Build QBO payloads…');
  const pro = await getClient('pro');
  const store = await getClient('store');
  const bill1 = await buildKreiselBill(pro, k, hmrc.rate);
  const inv = await buildEwiproInvoice(pro, k, hmrc.rate);
  const bill2 = await buildEwistoreBillFromInvoice(store, k, inv.payload, hmrc.rate);
  console.log('  ✓ payloads built');
  console.log(`     TaxCode resolved: "${bill1.tax_info.name}" (id=${bill1.tax_info.id}) ${bill1.tax_info.is_pva ? '(REAL PVA ✓)' : '(sandbox fallback — PVA proxy)'}`);

  // 5. Preview
  console.log('\n=== PREVIEW ===');
  previewBill('Bill in EWI Pro (PLN, Kreisel)', bill1.payload, 'PLN');
  previewBill('Invoice in EWI Pro (GBP, → EWI Store)', inv.payload, 'GBP');
  previewBill('Bill in EWI Store (GBP, EWI Pro)', bill2.payload, 'GBP');

  // Cross-check: Bill PLN total / hmrc ≈ Invoice GBP subtotal
  const billPlnSum = bill1.payload.Line.reduce((s, l) => s + l.Amount, 0);
  const invGbpSum = inv.payload.Line.reduce((s, l) => s + l.Amount, 0);
  const expected = billPlnSum / hmrc.rate;
  const delta = expected - invGbpSum;
  console.log(`\nCross-check: Bill PLN ${billPlnSum.toFixed(2)} / ${hmrc.rate} = £${expected.toFixed(2)} vs Invoice GBP £${invGbpSum.toFixed(2)}  Δ=£${delta.toFixed(2)}`);
  if (Math.abs(delta) > 1.0) console.warn('  ⚠️  Large discrepancy — review.');
  else console.log('  ✓ within ±1 GBP');

  if (!doPost) {
    console.log('\n🟡 DRY-RUN ended. Re-run with --post to submit to QBO sandbox.');
    return;
  }

  // 6. Post
  console.log('\n[5/5] Posting to QBO sandbox…');
  console.log('  POST Bill PLN Kreisel → EWI Pro…');
  const billRes1 = await pro.post('bill', bill1.payload);
  const billId1 = billRes1.Bill.Id;
  console.log(`    ✓ Bill created: #${billId1} (DocNumber ${billRes1.Bill.DocNumber})`);

  console.log('  POST Invoice GBP → EWI Pro…');
  const invRes = await pro.post('invoice', inv.payload);
  const invId = invRes.Invoice.Id;
  const invDoc = invRes.Invoice.DocNumber || `(qbo-internal-${invId})`;
  console.log(`    ✓ Invoice created: #${invId} (DocNumber ${invDoc})`);

  // Store Bill DocNumber = Pro Invoice's QBO-assigned DocNumber
  // (so Store sees the actual vendor invoice number from EWI Pro)
  bill2.payload.DocNumber = invDoc;
  console.log('  POST Bill GBP (EWI Pro) → EWI Store…');
  const billRes2 = await store.post('bill', bill2.payload);
  const billId2 = billRes2.Bill.Id;
  console.log(`    ✓ Bill created: #${billId2} (DocNumber ${billRes2.Bill.DocNumber})`);

  // Attach Kreisel PDF to EWI Pro Bill (the original source document)
  console.log(`  📎 Attaching Kreisel PDF to Pro Bill #${billId1}…`);
  try {
    const att = await attachPdfToTxn(pro, pdfPath, 'Bill', billId1);
    const a = att.AttachableResponse && att.AttachableResponse[0] && att.AttachableResponse[0].Attachable;
    console.log(`    ✓ Attached: ${a ? '#' + a.Id + ' ' + a.FileName : 'ok'}`);
  } catch (e) {
    console.warn(`    ⚠️  Attachment failed: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
  }

  // Store Bill receives ONLY the EWI Pro Invoice PDF (the actual vendor invoice from supplier-of-record).
  // Kreisel PDF stays on the Pro Bill only (Kreisel is not Store's vendor).
  console.log(`  📎 Downloading Pro Invoice #${invId} PDF and attaching to Store Bill #${billId2}…`);
  try {
    const invPdf = await pro.getPdf(`invoice/${invId}/pdf`);
    const fileName = `EWI-Pro-Invoice-${invDoc.replace(/[\/]/g, '-')}.pdf`;
    const att = await attachPdfBufferToTxn(store, invPdf, fileName, 'Bill', billId2);
    const a = att.AttachableResponse && att.AttachableResponse[0] && att.AttachableResponse[0].Attachable;
    console.log(`    ✓ Attached: ${a ? '#' + a.Id + ' ' + a.FileName : 'ok'}  (${invPdf.length} bytes)`);
  } catch (e) {
    console.warn(`    ⚠️  Attachment failed: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
  }

  console.log('\n🎉 ALL POSTED. Sandbox URLs (login first):');
  console.log(`  Pro Bill:     https://sandbox.qbo.intuit.com/app/bill?txnId=${billId1}`);
  console.log(`  Pro Invoice:  https://sandbox.qbo.intuit.com/app/invoice?txnId=${invId}`);
  console.log(`  Store Bill:   https://sandbox.qbo.intuit.com/app/bill?txnId=${billId2}`);
}

main().catch(e => {
  console.error('\n--- ERROR ---');
  if (e.response) {
    console.error('status:', e.response.status);
    console.error('data:', JSON.stringify(e.response.data, null, 2));
  } else {
    console.error(e.message);
    console.error(e.stack);
  }
  process.exit(1);
});
