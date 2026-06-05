// Batch processor — scan C:/kreisel/inbox for PDFs, run full pipeline, move to gotowe/ or bledy/.
//
// Usage:
//   node process_inbox.js            ← dry-run preview only (default — safe)
//   node process_inbox.js --post     ← actually post to QBO + move files
//
// Folder convention:
//   C:/kreisel/
//     inbox/        ← drop new Kreisel PDFs here
//     gotowe/YYYY-MM-DD/  ← moved after successful --post
//     bledy/YYYY-MM-DD/   ← moved on error (with .txt explaining what failed)
//     log.txt              ← append-only audit log

const fs = require('fs');
const path = require('path');
const { parseKreiselPolishPdf } = require('./parse_kreisel_pl');
const { parseKreiselWithLlm } = require('./parse_kreisel_llm');
const { terminate: terminateOcr } = require('./ocr_pdf');
const { resolveImport } = require('./resolve_import');
const { getRate } = require('./hmrc_rate');
const { getClient } = require('./qbo_client');

// Parser selection: LLM (Claude) is default. Use --tesseract or PARSER=tesseract to fall back.
const USE_LLM = !process.argv.includes('--tesseract') && process.env.PARSER !== 'tesseract';
const {
  buildKreiselBill,
  buildEwiproInvoice,
  buildEwistoreBillFromInvoice,
  attachPdfToTxn,
  attachPdfBufferToTxn,
} = require('./qbo_payloads');

const ROOT = process.env.KREISEL_INBOX_ROOT || 'C:/kreisel';
const INBOX = path.join(ROOT, 'inbox');
const GOTOWE = path.join(ROOT, 'gotowe');
const BLEDY = path.join(ROOT, 'bledy');
const WSTRZYMANE = path.join(ROOT, 'wstrzymane');
const LOG = path.join(ROOT, 'log.txt');

const DO_POST = process.argv.includes('--post');

function pad2(n) { return String(n).padStart(2, '0'); }
function todayDir() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function log(line) {
  ensureDir(ROOT);
  fs.appendFileSync(LOG, `[${nowStamp()}] ${line}\n`, 'utf8');
}

function moveTo(srcPdf, destDir, suffix = '') {
  ensureDir(destDir);
  const base = path.basename(srcPdf, '.pdf');
  let target = path.join(destDir, `${base}${suffix}.pdf`);
  let i = 1;
  while (fs.existsSync(target)) {
    target = path.join(destDir, `${base}${suffix}_${i}.pdf`);
    i++;
  }
  fs.renameSync(srcPdf, target);
  return target;
}

function writeError(srcPdf, destDir, message) {
  ensureDir(destDir);
  const base = path.basename(srcPdf, '.pdf');
  const txtPath = path.join(destDir, `${base}_BLAD.txt`);
  fs.writeFileSync(txtPath, message, 'utf8');
  return txtPath;
}

async function processOne(pdfPath) {
  const summary = {
    file: path.basename(pdfPath),
    status: 'pending',
    kreisel_ref: null,
    hmrc_month: null,
    hmrc_rate: null,
    pro_bill_id: null,
    pro_invoice_id: null,
    pro_invoice_no: null,
    store_bill_id: null,
    error: null,
  };
  try {
    // 1. Parse (LLM Claude vision is default; Tesseract+regex available via --tesseract flag)
    console.log(`\n┌── ${path.basename(pdfPath)} ──`);
    process.stdout.write(`│  [1/5] ${USE_LLM ? 'LLM' : 'OCR'} parse… `);
    const k = USE_LLM
      ? await parseKreiselWithLlm(pdfPath)
      : await parseKreiselPolishPdf(pdfPath);
    if (USE_LLM && k._meta) {
      summary.llm_cost = k._meta.input_tokens * 3/1e6 + k._meta.output_tokens * 15/1e6
        + (k._meta.cache_creation_input_tokens || 0) * 3.75/1e6
        + (k._meta.cache_read_input_tokens || 0) * 0.30/1e6;
    }
    if (k.unmapped_lines.length) {
      const parts = ['NIEZNANE PRODUKTY na fakturze:', '', 'Skrypt NIE może wystawić tej faktury automatycznie — musi dostać mapowanie.', '', 'Co zrobić:', '  1. Daj znać Patrykowi tę listę', '  2. Patryk dodaje 1 linię do sku_mapping.js per nieznany produkt', '  3. Wrzuć PDF ponownie do C:\\kreisel\\inbox\\', '', '─'.repeat(70)];
      for (const u of k.unmapped_lines) {
        parts.push('');
        parts.push(`Pozycja #${u.nr}: "${u.raw_desc}"`);
        parts.push(`  qty=${u.qty} ${u.unit_pln ? '× ' + u.unit_pln + ' PLN' : ''} = ${u.total_pln} PLN`);
        parts.push(`  PKWiU=${u.pkwiu} PCN=${u.pcn}`);
        if (u.suggestions && u.suggestions.length) {
          parts.push('  Możliwe dopasowania z systemu (im wyższy score, tym lepsze):');
          u.suggestions.forEach(s => {
            parts.push(`    ${s.code.padEnd(20)}  ${s.name.slice(0, 50).padEnd(50)}  (kupowane ${s.times_ordered}× score=${s.score})`);
          });
        } else {
          parts.push('  Brak dopasowań w systemie. Najprawdopodobniej PRÓBKA — wpisz __SAMPLE__');
        }
      }
      throw new Error(parts.join('\n'));
    }
    if (!k.invoice_no) throw new Error('OCR could not read invoice number from PDF.');
    summary.kreisel_ref = k.kreisel_ref;
    console.log(`${k.kreisel_ref}  ${k.lines.length} lines  ${k.total_pln} PLN`);

    // 2. Resolver — pass parsed Kreisel object so resolver can use container/issue_date from PDF
    // (works without MySQL access — colleague's PC mode)
    process.stdout.write('│  [2/5] Resolve HMRC month… ');
    const resolved = await resolveImport(k);
    if (resolved.status === 'ambiguous_month') {
      summary.status = 'ambiguous';
      summary.error = `MONTH BOUNDARY: predicted ATA close to month edge.\n` +
                      `Could be HMRC month: ${resolved.hmrc_month}  OR  ${resolved.alternative_hmrc_month}\n` +
                      `Predicted ATA: ${resolved.predicted_ata_uk}  Container: ${resolved.container}\n` +
                      `Akcja: poczekaj na aktualizację Magemara (kontener musi mieć ATA Tilbury). ` +
                      `Pdf wraca do wstrzymane/. Po refresh Magemar wrzuć ponownie do inbox/.`;
      console.log(`AMBIGUOUS — ${resolved.hmrc_month}/${resolved.alternative_hmrc_month}`);
      console.log('└── ⏸️  WSTRZYMANE (granica miesiąca)\n');
      return summary;
    }
    if (resolved.status !== 'ok') {
      throw new Error(`Resolver blocked: ${resolved.status}\n${JSON.stringify(resolved, null, 2)}`);
    }
    summary.hmrc_month = resolved.hmrc_month;
    console.log(`${resolved.hmrc_month} (${resolved.confidence} via ${resolved.source})`);

    // 3. HMRC rate
    process.stdout.write('│  [3/5] HMRC rate… ');
    const hmrc = await getRate(resolved.hmrc_month, 'PLN');
    summary.hmrc_rate = hmrc.rate;
    console.log(`${hmrc.rate} PLN/£1`);

    // 4. Build
    process.stdout.write('│  [4/5] Build payloads… ');
    const pro = await getClient('pro');
    const store = await getClient('store');
    const bill1 = await buildKreiselBill(pro, k, hmrc.rate);
    const inv = await buildEwiproInvoice(pro, k, hmrc.rate);
    const bill2 = await buildEwistoreBillFromInvoice(store, k, inv.payload, hmrc.rate);
    const subPro = bill1.payload.Line.reduce((s, l) => s + l.Amount, 0);
    const subGbp = inv.payload.Line.reduce((s, l) => s + l.Amount, 0);
    console.log(`PLN ${subPro.toFixed(2)} → GBP ${subGbp.toFixed(2)}`);

    if (!DO_POST) {
      console.log('│  [5/5] DRY-RUN — no posting');
      summary.status = 'dry_run_ok';
      console.log('└── ✓ would post successfully\n');
      return summary;
    }

    // 5. POST
    process.stdout.write('│  [5/5] POST to QBO… ');
    const bRes1 = await pro.post('bill', bill1.payload);
    summary.pro_bill_id = bRes1.Bill.Id;
    const invRes = await pro.post('invoice', inv.payload);
    summary.pro_invoice_id = invRes.Invoice.Id;
    summary.pro_invoice_no = invRes.Invoice.DocNumber || inv.payload.DocNumber;
    bill2.payload.DocNumber = summary.pro_invoice_no;
    const bRes2 = await store.post('bill', bill2.payload);
    summary.store_bill_id = bRes2.Bill.Id;
    console.log(`Pro Bill #${summary.pro_bill_id}, Invoice #${summary.pro_invoice_no} (id ${summary.pro_invoice_id}), Store Bill #${summary.store_bill_id}`);

    // attachments
    process.stdout.write('│  📎 attachments… ');
    await attachPdfToTxn(pro, pdfPath, 'Bill', summary.pro_bill_id);
    const invPdf = await pro.getPdf(`invoice/${summary.pro_invoice_id}/pdf`);
    const fileName = `EWI-Pro-Invoice-${summary.pro_invoice_no}.pdf`;
    await attachPdfBufferToTxn(store, invPdf, fileName, 'Bill', summary.store_bill_id);
    console.log('done');

    summary.status = 'posted';
    console.log('└── ✅ POSTED OK\n');
    return summary;
  } catch (e) {
    summary.status = 'error';
    // For QBO 400 errors include the response data
    if (e.response && e.response.data) {
      summary.error = `${e.message}\nQBO response:\n${JSON.stringify(e.response.data, null, 2)}`;
    } else {
      summary.error = e.message;
    }
    console.log('\n└── ❌ ERROR:', e.message.split('\n')[0]);
    return summary;
  }
}

(async () => {
  ensureDir(INBOX); ensureDir(GOTOWE); ensureDir(BLEDY); ensureDir(WSTRZYMANE);
  console.log('═'.repeat(72));
  console.log(`KREISEL BATCH PROCESSOR  —  ${DO_POST ? '🟢 POST MODE' : '🟡 DRY-RUN'}`);
  console.log(`Inbox: ${INBOX}`);
  console.log('═'.repeat(72));

  const files = fs.readdirSync(INBOX)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(INBOX, f));

  if (files.length === 0) {
    console.log('\nBrak plików w inbox/. Nic do roboty.');
    console.log(`Wrzuć PDF-y do: ${INBOX}\n`);
    return;
  }

  log(`Run started — ${files.length} file(s) — mode=${DO_POST ? 'POST' : 'DRY-RUN'} parser=${USE_LLM ? 'LLM' : 'Tesseract'}`);
  console.log(`\nParser: ${USE_LLM ? '🧠 Claude LLM (vision)' : '👁  Tesseract OCR + regex'}`);
  console.log(`Znaleziono ${files.length} plik(ów) do przetworzenia.\n`);

  const results = [];
  for (const f of files) {
    const r = await processOne(f);
    results.push({ ...r, sourcePath: f });
    log(`${path.basename(f)} → ${r.status}${r.error ? ': ' + r.error.split('\n')[0] : ''}${r.pro_invoice_no ? ' (Invoice ' + r.pro_invoice_no + ')' : ''}`);
  }
  await terminateOcr();

  // Move files (only in POST mode — dry-run leaves them in inbox)
  if (DO_POST) {
    console.log('\n' + '─'.repeat(72));
    console.log('Przenoszenie plików…');
    for (const r of results) {
      const dayDir = todayDir();
      if (r.status === 'posted') {
        const dest = moveTo(r.sourcePath, path.join(GOTOWE, dayDir));
        console.log(`  ✓ ${r.file}  →  gotowe/${dayDir}/${path.basename(dest)}`);
      } else if (r.status === 'ambiguous') {
        const wDir = path.join(WSTRZYMANE, dayDir);
        const dest = moveTo(r.sourcePath, wDir);
        writeError(dest, wDir, `${nowStamp()}\n\n${r.error}`);
        console.log(`  ⏸ ${r.file}  →  wstrzymane/${dayDir}/${path.basename(dest)} (granica miesiąca)`);
      } else {
        const errDir = path.join(BLEDY, dayDir);
        const dest = moveTo(r.sourcePath, errDir);
        writeError(dest, errDir, `${nowStamp()}\n\nStatus: ${r.status}\n\nBłąd:\n${r.error || '(brak szczegółów)'}`);
        console.log(`  ✗ ${r.file}  →  bledy/${dayDir}/${path.basename(dest)} (+ _BLAD.txt)`);
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(72));
  const ok = results.filter(r => r.status === 'posted' || r.status === 'dry_run_ok').length;
  const bad = results.filter(r => r.status === 'error').length;
  console.log(`PODSUMOWANIE:  ${ok} OK · ${bad} BŁĄD · z ${results.length}`);
  if (USE_LLM) {
    const totalCost = results.reduce((s, r) => s + (r.llm_cost || 0), 0);
    console.log(`LLM koszt łączny: $${totalCost.toFixed(4)} ≈ £${(totalCost * 0.79).toFixed(4)}`);
  }
  results.forEach(r => {
    const sign = r.status === 'posted' || r.status === 'dry_run_ok' ? '✓' : '✗';
    const extra = r.pro_invoice_no ? `  →  Invoice ${r.pro_invoice_no}` : r.error ? `  →  ${r.error.split('\n')[0].slice(0, 60)}` : '';
    console.log(`  ${sign} ${r.file}${extra}`);
  });
  console.log('═'.repeat(72));
  log(`Run finished — ${ok} OK · ${bad} BŁĄD`);
})().catch(async e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  await terminateOcr();
  process.exit(1);
});
