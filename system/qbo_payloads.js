// Build the three QBO payloads from parsed Kreisel + resolver + HMRC.
//
//   1) Bill_PLN_Kreisel          → POST to EWI Pro realm
//   2) Invoice_GBP_EwiproToStore → POST to EWI Pro realm
//   3) Bill_GBP_EwiPro           → POST to EWI Store realm
//
// All Bills use:
//   • ItemBasedExpenseLineDetail (so Item / Qty / Rate columns appear in UI)
//   • Category line "Import" via AccountBasedExpenseLineDetail (matches production layout)
//   • Tax code: PVA Import 20.0% if exists, else fallback to 20.0% S (sandbox)
//   • SalesTermRef = Net 90
//   • Empty memos
//   • Items resolved per SKU (created via qbo_setup_skus.js)

const { roundHalfUp, rateDecimalPlaces } = require('./math');

const _idCache = {};

// Lines mapped to a generic catch-all item (Pallet, EWI Sample) carry the
// original Kreisel description in the QBO line Description, so a one-off sample
// like "klej antracytowy" stays readable on the document instead of just
// showing "EWI Sample". Coded products leave Description empty (existing layout).
function genericDescription(line) {
  const sku = line && line.ewi_sku;
  const desc = line && line.raw_desc ? String(line.raw_desc).trim() : '';
  // Skip if missing or if it's just a marker placeholder (e.g. "__SAMPLE__").
  if ((sku === '__SAMPLE__' || sku === '__PALLET__') && desc && !/^__/.test(desc)) {
    return desc.slice(0, 4000); // QBO Description max 4000 chars
  }
  return null;
}

async function getEntityId(client, kind, displayName) {
  const k = `${client.realmId}:${kind}:${displayName}`;
  if (_idCache[k]) return _idCache[k];
  // exact match
  const exact = await client.query(`SELECT Id FROM ${kind} WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`);
  const row = exact.QueryResponse[kind] && exact.QueryResponse[kind][0];
  if (row) {
    _idCache[k] = row.Id;
    return row.Id;
  }
  throw new Error(`${kind} not found in realm ${client.realmId}: ${displayName}`);
}

// Fuzzy + currency-filtered lookup — for production where vendor names may differ slightly.
// Returns { Id, DisplayName, CurrencyRef } of the best-matching row, or throws.
async function findEntityByPattern(client, kind, namePatterns, expectedCurrency) {
  const k = `${client.realmId}:${kind}:pattern:${namePatterns.join('|')}:${expectedCurrency || ''}`;
  if (_idCache[k]) return _idCache[k];
  const results = [];
  for (const pat of namePatterns) {
    const q = await client.query(
      `SELECT * FROM ${kind} WHERE DisplayName LIKE '${pat.replace(/'/g, "\\'")}' MAXRESULTS 20`
    );
    (q.QueryResponse[kind] || []).forEach(r => results.push(r));
  }
  // De-duplicate by Id
  const byId = {};
  results.forEach(r => { byId[r.Id] = r; });
  const uniq = Object.values(byId);
  if (uniq.length === 0) {
    throw new Error(`No ${kind} matching ${JSON.stringify(namePatterns)} in realm ${client.realmId}`);
  }
  // Prefer currency match
  const cMatch = expectedCurrency
    ? uniq.find(r => r.CurrencyRef && r.CurrencyRef.value === expectedCurrency)
    : null;
  const picked = cMatch || uniq[0];
  _idCache[k] = { Id: picked.Id, DisplayName: picked.DisplayName, CurrencyRef: picked.CurrencyRef };
  return _idCache[k];
}

// Smart Item lookup — handles canonical SKU codes (EWI-225, ZEN-D-11) AND legacy names
// (EWI-225 25KG, Pigment-D-11 1L). Plus specials __PALLET__ and __SAMPLE__.
async function getItemId(client, name) {
  const k = `${client.realmId}:Item:${name}`;
  if (_idCache[k]) return _idCache[k];

  // Map specials to generic items
  let searchName = name;
  if (name === '__PALLET__') searchName = 'Pallet';
  else if (name === '__SAMPLE__') searchName = 'EWI Sample';

  // 1. exact name match
  const exact = await client.query(`SELECT Id FROM Item WHERE Name = '${searchName.replace(/'/g, "\\'")}'`);
  let row = exact.QueryResponse.Item && exact.QueryResponse.Item[0];
  if (row) { _idCache[k] = row.Id; return row.Id; }

  // 2. LIKE 'name%' match (catches legacy names like "EWI-225 25KG" when SKU is "EWI-225")
  const like = await client.query(`SELECT Id, Name FROM Item WHERE Name LIKE '${searchName.replace(/'/g, "\\'")}%' MAXRESULTS 5`);
  row = like.QueryResponse.Item && like.QueryResponse.Item[0];
  if (row) { _idCache[k] = row.Id; return row.Id; }

  // 2b. Strip trailing pack-size suffix (" 15L", " 25KG", " 20KG", " 5L" etc.) and retry exact
  const stripped = searchName.replace(/\s+(\d+(?:[.,]\d+)?\s*(?:KG|L|ML)|25KG|15L|20KG|10L|5L|7KG)\s*$/i, '').trim();
  if (stripped && stripped !== searchName) {
    const r2 = await client.query(`SELECT Id FROM Item WHERE Name = '${stripped.replace(/'/g, "\\'")}'`);
    row = r2.QueryResponse.Item && r2.QueryResponse.Item[0];
    if (row) { _idCache[k] = row.Id; return row.Id; }
    // also try LIKE with stripped
    const r3 = await client.query(`SELECT Id FROM Item WHERE Name LIKE '${stripped.replace(/'/g, "\\'")}%' MAXRESULTS 5`);
    row = r3.QueryResponse.Item && r3.QueryResponse.Item[0];
    if (row) { _idCache[k] = row.Id; return row.Id; }
  }

  // 3. for pigments: ZEN-D-XX in canonical → also try "Pigment-D-XX" legacy
  const pigMatch = /^ZEN-D-(\d+)/.exec(searchName);
  if (pigMatch) {
    const legacy = await client.query(`SELECT Id FROM Item WHERE Name LIKE '%Pigment-D-${pigMatch[1]}%' OR Name LIKE '%PIGMENT-D-${pigMatch[1]}%' MAXRESULTS 5`);
    row = legacy.QueryResponse.Item && legacy.QueryResponse.Item[0];
    if (row) { _idCache[k] = row.Id; return row.Id; }
  }

  // 4. Separator-insensitive match. QBO names sometimes use a SPACE where our
  //    SKU uses a DASH (e.g. SKU "EWI-077-1.5A" vs QBO Name "EWI-077 1.5A").
  //    Fetch candidates by the base code (letters + first number group) and
  //    compare ignoring spaces / dashes / underscores.
  const norm = (s) => (s || '').toUpperCase().replace(/[\s\-_]/g, '');
  const baseM = /^([A-Za-z]+-?\d+)/.exec(searchName);
  if (baseM) {
    const base = baseM[1];
    const want = norm(searchName);
    const cand = await client.query(`SELECT Id, Name, Sku FROM Item WHERE Name LIKE '${base.replace(/'/g, "\\'")}%' MAXRESULTS 50`);
    const hit = (cand.QueryResponse.Item || []).find(it => norm(it.Name) === want || norm(it.Sku) === want);
    if (hit) { _idCache[k] = hit.Id; return hit.Id; }
  }

  // 5. Some setups store the product code in the Sku field, not Name.
  try {
    const bySku = await client.query(`SELECT Id FROM Item WHERE Sku = '${searchName.replace(/'/g, "\\'")}'`);
    const r = bySku.QueryResponse.Item && bySku.QueryResponse.Item[0];
    if (r) { _idCache[k] = r.Id; return r.Id; }
  } catch (e) { /* Sku not queryable in some editions — ignore */ }

  // 6. AUTO-CREATE — a missing product is created on the fly. Whatever the user
  //    typed becomes a real product. Accounts/VAT are cloned from a same-family
  //    sibling when one exists (most accurate), otherwise from the catalog's
  //    dominant account template (standard product accounts) so ANY new product
  //    can be created. Only empty / marker names are refused.
  const created = await createMissingItem(client, searchName);
  if (created) { _idCache[k] = created; return created; }

  throw new Error(`Nie udało się utworzyć produktu "${name}" w realm ${client.realmId} — sprawdź log (Ustawienia → Pomoc → Otwórz folder z logami) lub załóż go ręcznie w QuickBooks.`);
}

// Strip a trailing pack-size token (" 1L", " 25KG", " 5L", …) so a name copied
// from the Kreisel description ("PIGMENT-D-105 1L") matches the QBO convention
// ("PIGMENT-D-105"). Note: "MM" (grain size) is intentionally kept — QBO names
// include it (e.g. "EWI-050-MOZ.CCCC 1,8 MM 25KG").
function cleanItemName(name) {
  return String(name).replace(/\s+(\d+(?:[.,]\d+)?\s*(?:KG|L|ML)|25KG|15L|20KG|10L|5L|7KG)\s*$/i, '').trim();
}

// The catalog's dominant (Income, Expense) account pair — used as the template
// for brand-new products that have no same-family sibling. Cached per realm.
async function defaultTemplateRefs(client) {
  const ck = `${client.realmId}:__defaultItemTemplate`;
  if (_idCache[ck] !== undefined) return _idCache[ck];
  let chosen = null;
  try {
    const all = await client.query(
      "SELECT Id, Name, Type, IncomeAccountRef, ExpenseAccountRef, SalesTaxCodeRef, PurchaseTaxCodeRef, Taxable FROM Item WHERE Type='Service' MAXRESULTS 300"
    );
    const items = (all.QueryResponse.Item || []).filter(it => it.IncomeAccountRef && it.ExpenseAccountRef);
    const tally = {};
    for (const it of items) {
      const key = `${it.IncomeAccountRef.value}|${it.ExpenseAccountRef.value}`;
      (tally[key] = tally[key] || { n: 0, it }).n++;
    }
    const best = Object.values(tally).sort((a, b) => b.n - a.n)[0];
    if (best) chosen = best.it;
  } catch (e) {
    console.warn(`[auto-create] defaultTemplateRefs failed in realm ${client.realmId}: ${e.message}`);
  }
  _idCache[ck] = chosen;
  return chosen;
}

// Create a missing Item. Clones Type + account + VAT refs from a same-family
// sibling (e.g. PIGMENT-D-105 ← PIGMENT-D-104) when one exists, else from the
// catalog's dominant account template. Returns the new Id (or null on failure).
async function createMissingItem(client, rawName) {
  const newName = cleanItemName(rawName);
  if (!newName || newName.startsWith('__')) return null;       // never create markers / empty

  // Prefer a same-family sibling (most accurate accounts).
  let tmpl = null;
  const family = newName.replace(/[-\s][^-\s]*$/, '').trim();
  if (family && family !== newName) {
    const q = await client.query(`SELECT * FROM Item WHERE Name LIKE '${family.replace(/'/g, "\\'")}%' MAXRESULTS 10`);
    const sibs = (q.QueryResponse.Item || []).filter(
      it => (it.Name || '').toUpperCase() !== newName.toUpperCase() && it.IncomeAccountRef
    );
    if (sibs.length) tmpl = sibs[0];
  }
  // Fall back to the catalog's standard account template so any product creates.
  if (!tmpl) tmpl = await defaultTemplateRefs(client);
  if (!tmpl) return null;

  const body = { Name: newName, Type: tmpl.Type || 'Service' };
  for (const f of ['IncomeAccountRef', 'ExpenseAccountRef', 'AssetAccountRef', 'SalesTaxCodeRef', 'PurchaseTaxCodeRef']) {
    if (tmpl[f] && tmpl[f].value) body[f] = { value: tmpl[f].value };
  }
  if (tmpl.Taxable !== undefined) body.Taxable = tmpl.Taxable;
  // Inventory items need extra required fields we can't safely infer — fall back
  // to a non-inventory Service clone so creation always succeeds.
  if (body.Type === 'Inventory') body.Type = 'NonInventory';

  try {
    const res = await client.post('item', body);
    const id = res.Item && res.Item.Id;
    if (id) {
      console.log(`[auto-create] realm ${client.realmId}: created Item "${newName}" (Id ${id}) cloned from "${tmpl.Name || 'default template'}"`);
      return id;
    }
  } catch (e) {
    const detail = e && e.response && e.response.data ? JSON.stringify(e.response.data).slice(0, 300) : (e.message || e);
    console.warn(`[auto-create] FAILED "${newName}" in realm ${client.realmId}: ${detail}`);
  }
  return null;
}

async function getAccountId(client, name) {
  const k = `${client.realmId}:Account:${name}`;
  if (_idCache[k]) return _idCache[k];
  const q = await client.query(`SELECT Id FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const row = q.QueryResponse.Account && q.QueryResponse.Account[0];
  if (!row) throw new Error(`Account not found in realm ${client.realmId}: ${name}`);
  _idCache[k] = row.Id;
  return row.Id;
}

// Find next sequential numeric DocNumber for an entity.
// Production-safe: queries newest 50 by CreateTime DESC, finds max pure-numeric DocNumber.
// Works on EWI Pro production (where Invoice DocNumbers are e.g. 4703, 4745, 4993, …).
async function nextNumericDocNumber(client, entityType, startFrom = 1001) {
  const q = await client.query(
    `SELECT DocNumber, MetaData FROM ${entityType} ORDERBY MetaData.CreateTime DESC MAXRESULTS 50`
  );
  const list = q.QueryResponse[entityType] || [];
  let maxNum = startFrom - 1;
  for (const it of list) {
    const m = /^(\d+)$/.exec(it.DocNumber || '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return String(maxNum + 1);
}

async function getTermId(client, name) {
  const k = `${client.realmId}:Term:${name}`;
  if (_idCache[k]) return _idCache[k];
  const q = await client.query(`SELECT Id FROM Term WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const row = q.QueryResponse.Term && q.QueryResponse.Term[0];
  if (!row) throw new Error(`Term not found in realm ${client.realmId}: ${name}`);
  _idCache[k] = row.Id;
  return row.Id;
}

async function _listTaxCodes(client) {
  const k = `${client.realmId}:TaxCode:list`;
  if (_idCache[k]) return _idCache[k];
  const all = await client.query(`SELECT Id, Name FROM TaxCode MAXRESULTS 100`);
  _idCache[k] = all.QueryResponse.TaxCode || [];
  return _idCache[k];
}

// PURCHASE tax: PVA Import 20.0% if exists, else fallback 20.0% S (sandbox).
// Used for Bills (Kreisel costs side and intercompany Store Bill).
async function resolveTaxCode(client) {
  const k = `${client.realmId}:TaxCode:purchase`;
  if (_idCache[k]) return _idCache[k];
  const list = await _listTaxCodes(client);
  const pva = list.find(t => /PVA/i.test(t.Name));
  const standard = list.find(t => /^20\.0% S$/.test(t.Name));
  const picked = pva || standard;
  if (!picked) throw new Error(`No PVA nor 20.0% S TaxCode found in realm ${client.realmId}`);
  _idCache[k] = { id: picked.Id, name: picked.Name, is_pva: !!pva };
  return _idCache[k];
}

// SALES tax: standard 20.0% S (sales VAT on Invoice from Pro to Store).
async function resolveSalesTaxCode(client) {
  const k = `${client.realmId}:TaxCode:sales`;
  if (_idCache[k]) return _idCache[k];
  const list = await _listTaxCodes(client);
  const std = list.find(t => /^20\.0% S$/.test(t.Name));
  if (!std) throw new Error(`No 20.0% S TaxCode found in realm ${client.realmId}`);
  _idCache[k] = { id: std.Id, name: std.Name, is_pva: false };
  return _idCache[k];
}

// Exact display names (for sandbox setup script).
const VENDOR_KREISEL = 'KREISEL TECHNIKA BUDOWLANA SP. Z O.O.';
const CUSTOMER_EWISTORE = 'EWI STORE LTD';
const VENDOR_EWIPRO = 'EWI PRO INSULATION SYSTEMS LTD';

// Fuzzy patterns + expected currency (for production resolution).
const KREISEL_PATTERNS = ['%KREISEL%', '%Kreisel%'];
const EWISTORE_PATTERNS = ['%EWI STORE%', '%EWI Store%', '%ewi store%'];
const EWIPRO_PATTERNS = ['%EWI PRO%', '%EWI Pro%', '%ewi pro%'];

// Resolve vendor/customer with sandbox-exact + production-fuzzy fallback.
async function resolveKreiselVendor(proClient) {
  try { return await getEntityId(proClient, 'Vendor', VENDOR_KREISEL); } catch (e) {}
  const r = await findEntityByPattern(proClient, 'Vendor', KREISEL_PATTERNS, 'PLN');
  return r.Id;
}
async function resolveEwistoreCustomer(proClient) {
  try { return await getEntityId(proClient, 'Customer', CUSTOMER_EWISTORE); } catch (e) {}
  const r = await findEntityByPattern(proClient, 'Customer', EWISTORE_PATTERNS, 'GBP');
  return r.Id;
}
async function resolveEwiproVendor(storeClient) {
  try { return await getEntityId(storeClient, 'Vendor', VENDOR_EWIPRO); } catch (e) {}
  const r = await findEntityByPattern(storeClient, 'Vendor', EWIPRO_PATTERNS, 'GBP');
  return r.Id;
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Build Bill in PLN for Kreisel, posted to EWI Pro realm.
 * Layout (matches production):
 *   • Category details: 1 line { Category=Import, Amount=0, VAT=PVA Import 20% }
 *   • Item details: 1 ItemBasedExpense line per product (PRODUCT/SERVICE col, Qty, Rate, Amount, VAT)
 *   • Description column left empty
 *   • GlobalTaxCalculation = TaxExcluded → UI "Amounts are: Exclusive of Tax"
 */
async function buildKreiselBill(proClient, parsedKreisel, hmrcRate, dueDays = 90) {
  const [kreiselId, importAccId, termId, tax] = await Promise.all([
    resolveKreiselVendor(proClient),
    getAccountId(proClient, 'Import'),
    getTermId(proClient, 'Net 90'),
    resolveTaxCode(proClient),
  ]);
  const txnDate = parsedKreisel.issue_date;
  const dueDate = addDays(txnDate, dueDays);
  const exchangeRate = roundHalfUp(1 / hmrcRate, 7);

  const lines = [];
  // Category details — classification only. QBO API requires Line.Amount on every
  // line (Error 2020 if null/missing), so we send 0.00. UI shows "0.00" rather
  // than blank; the production layout will still work because Item lines below
  // carry the actual money.
  lines.push({
    DetailType: 'AccountBasedExpenseLineDetail',
    Amount: 0,
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: importAccId },
      TaxCodeRef: { value: tax.id },
    },
  });
  // Item details — QBO validates Amount == Qty * UnitPrice (±0.01), so we compute Amount
  // from qty*unitPrice rather than blindly trusting Kreisel's printed total.
  for (const l of parsedKreisel.lines) {
    const itemId = await getItemId(proClient, l.ewi_sku);
    const unitPrice = roundHalfUp(l.total_pln / l.qty_kreisel, 4);
    const amount = roundHalfUp(l.qty_kreisel * unitPrice, 2);
    const line = {
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: amount,
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: itemId },
        Qty: l.qty_kreisel,
        UnitPrice: unitPrice,
        TaxCodeRef: { value: tax.id },
      },
    };
    const desc = genericDescription(l);
    if (desc) line.Description = desc;
    lines.push(line);
  }

  return {
    realm: 'pro',
    tax_info: tax,
    payload: {
      VendorRef: { value: kreiselId },
      // Pro Bill no = Kreisel invoice reference (FSE-XXX/YYYY/EXP).
      // Matches production layout and provides traceability.
      DocNumber: parsedKreisel.kreisel_ref || `FSE-${parsedKreisel.invoice_no}`,
      TxnDate: txnDate,
      DueDate: dueDate,
      CurrencyRef: { value: 'PLN' },
      ExchangeRate: exchangeRate,
      SalesTermRef: { value: termId },
      GlobalTaxCalculation: 'TaxExcluded',
      Line: lines,
    },
  };
}

/**
 * Invoice GBP — EWI Pro → EWI Store. Standard sales VAT 20% (Standard, not PVA).
 * GlobalTaxCalculation TaxExcluded → VAT line @20% visible in UI.
 */
async function buildEwiproInvoice(proClient, parsedKreisel, hmrcRate, dueDays = 90) {
  const [ewistoreId, termId, salesTax, nextNo] = await Promise.all([
    resolveEwistoreCustomer(proClient),
    getTermId(proClient, 'Net 90'),
    resolveSalesTaxCode(proClient),
    nextNumericDocNumber(proClient, 'Invoice', 1001),
  ]);
  const txnDate = parsedKreisel.issue_date;
  const dueDate = addDays(txnDate, dueDays);
  // Memo on Invoice (renders on printed PDF) — matches historical EWI Pro format:
  //   "4.8397- pound rate"
  //   "FSE-38/2026/EXP   16/02/2026"
  const [Y, M, D] = txnDate.split('-');
  const customerMemo = `${hmrcRate}- pound rate\n${parsedKreisel.kreisel_ref}   ${D}/${M}/${Y}`;

  const lines = [];
  for (const l of parsedKreisel.lines) {
    const itemId = await getItemId(proClient, l.ewi_sku);
    const pln_per_ewi = l.total_pln / l.qty_ewi;
    const dp = rateDecimalPlaces(l); // 2 for Pallet/sample, 3 for rest (historical-imitation)
    const unitPrice = roundHalfUp(pln_per_ewi / hmrcRate, dp);
    const amount = roundHalfUp(l.qty_ewi * unitPrice, 2);
    const line = {
      DetailType: 'SalesItemLineDetail',
      Amount: amount,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: l.qty_ewi,
        UnitPrice: unitPrice,
        TaxCodeRef: { value: salesTax.id },
      },
    };
    const desc = genericDescription(l);
    if (desc) line.Description = desc;
    lines.push(line);
  }

  return {
    realm: 'pro',
    tax_info: salesTax,
    payload: {
      CustomerRef: { value: ewistoreId },
      DocNumber: nextNo,
      TxnDate: txnDate,
      DueDate: dueDate,
      CurrencyRef: { value: 'GBP' },
      SalesTermRef: { value: termId },
      GlobalTaxCalculation: 'TaxExcluded',
      CustomerMemo: { value: customerMemo },
      Line: lines,
    },
  };
}

/**
 * Bill GBP in EWI Store — mirrors Invoice lines as ItemBasedExpense.
 * Standard purchase VAT 20% S (UK intercompany — Materials category, not Import).
 */
async function buildEwistoreBillFromInvoice(storeClient, parsedKreisel, invoicePayload, hmrcRate, dueDays = 90) {
  const [ewiproId, materialsAccId, termId, purchTax] = await Promise.all([
    resolveEwiproVendor(storeClient),
    getAccountId(storeClient, 'Materials'),
    getTermId(storeClient, 'Net 90'),
    resolveSalesTaxCode(storeClient),
  ]);

  const lines = [];
  // Category details — Materials classification (Amount=0)
  lines.push({
    DetailType: 'AccountBasedExpenseLineDetail',
    Amount: 0,
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: materialsAccId },
      TaxCodeRef: { value: purchTax.id },
    },
  });
  // Item details
  for (let i = 0; i < invoicePayload.Line.length; i++) {
    const il = invoicePayload.Line[i];
    const kl = parsedKreisel.lines[i];
    const itemId = await getItemId(storeClient, kl.ewi_sku);
    const line = {
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: il.Amount,
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: itemId },
        Qty: il.SalesItemLineDetail.Qty,
        UnitPrice: il.SalesItemLineDetail.UnitPrice,
        TaxCodeRef: { value: purchTax.id },
      },
    };
    // Mirror the Invoice's Description (set for generic-item lines), else derive.
    const desc = il.Description || genericDescription(kl);
    if (desc) line.Description = desc;
    lines.push(line);
  }

  return {
    realm: 'store',
    tax_info: purchTax,
    payload: {
      VendorRef: { value: ewiproId },
      // DocNumber set by caller AFTER Pro Invoice posts (= Pro Invoice DocNumber)
      TxnDate: invoicePayload.TxnDate,
      DueDate: invoicePayload.DueDate,
      CurrencyRef: { value: 'GBP' },
      SalesTermRef: { value: termId },
      GlobalTaxCalculation: 'TaxExcluded',
      Line: lines,
    },
  };
}

/**
 * Upload PDF file → attachable linked to a transaction.
 */
async function attachPdfToTxn(client, pdfPath, txnType /* 'Bill' | 'Invoice' */, txnId) {
  const fs = require('fs');
  const pathMod = require('path');
  const FormData = require('form-data');
  const form = new FormData();
  const fileName = pathMod.basename(pdfPath);
  const meta = {
    AttachableRef: [{ EntityRef: { type: txnType, value: String(txnId) }, IncludeOnSend: false }],
    FileName: fileName,
    ContentType: 'application/pdf',
  };
  form.append('file_metadata_01', JSON.stringify(meta), { contentType: 'application/json', filename: 'meta.json' });
  form.append('file_content_01', fs.createReadStream(pdfPath), { contentType: 'application/pdf', filename: fileName });
  return await client.postMultipart('upload', form);
}

/**
 * Upload PDF from in-memory Buffer → attachable linked to a transaction.
 * Used when source PDF is generated by QBO (e.g. Invoice PDF re-attached to a Bill in another realm).
 */
async function attachPdfBufferToTxn(client, pdfBuffer, fileName, txnType, txnId) {
  const FormData = require('form-data');
  const form = new FormData();
  const meta = {
    AttachableRef: [{ EntityRef: { type: txnType, value: String(txnId) }, IncludeOnSend: false }],
    FileName: fileName,
    ContentType: 'application/pdf',
  };
  form.append('file_metadata_01', JSON.stringify(meta), { contentType: 'application/json', filename: 'meta.json' });
  form.append('file_content_01', pdfBuffer, { contentType: 'application/pdf', filename: fileName });
  return await client.postMultipart('upload', form);
}

module.exports = {
  buildKreiselBill,
  buildEwiproInvoice,
  buildEwistoreBillFromInvoice,
  attachPdfToTxn,
  attachPdfBufferToTxn,
  getEntityId,
  getItemId,
  getAccountId,
  resolveTaxCode,
  resolveSalesTaxCode,
};
