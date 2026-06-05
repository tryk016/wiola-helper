// Create one QBO Item per Kreisel SKU (idempotent).
// Also creates Account "Import" (Cost of Sales) used for the Category section on Bills.

const { getClient } = require('./qbo_client');

// Full SKU list — names matching production EWI Pro QBO conventions (verified 2026-06-04).
// On production, smart Item lookup will find existing Items by exact + LIKE match.
const SKUS = [
  // Pallet + generic sample
  'Pallet',
  'EWI Sample',
  // Basecoaty
  'EWI-212',
  'EWI-220 25KG',
  'EWI-225 25KG',
  'EWI-226 25KG',
  'EWI-260',
  'EWI-269 25KG',
  // Tynki silikonowe 075 (różne grain sizes, baza A i D)
  'EWI-075-0.5A',
  'EWI-075-1A',
  'EWI-075-1.5A',
  'EWI-075-1D',
  'EWI-075-1.5D',
  'EWI-075-2A',
  'EWI-075-3A',
  // Tynki bio-silikonowe 076
  'EWI-076-1A',
  'EWI-076-1.5A',
  'EWI-076-1.5D',
  'EWI-076-3A',
  // NanoDrex 077
  'EWI-077 1.5A',
  // Acrylic 010 + Silicone-silicate 040
  'EWI-010-1.5A',
  'EWI-010 SB 1A',
  'EWI-040-1.5A',
  // Concrete effect 055
  'EWI-055-A',
  // OCDC 065
  'EWI-065 25KG',
  // Mosaic line — Mozatynk-S NAT 01..12 (BAZA II 2.5kg)
  'Mozatynk-S 051 BAZA II NAT 01 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 02 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 03 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 04 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 05 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 06 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 07 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 08 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 09 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 10 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 11 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 12 2.5kg',
  'Mozatynk-S 050 Baza I 6.5KG',
  // EWI-050 mosaic renders (kolor) + buckets + labels
  'EWI-050-MOZ.CCCC 1,8 MM 25KG',
  'EWI-050-MOZ.DDDD 1,8 MM 25KG',
  'BUCKET 3L',
  'BUCKET 10L',
  'Label EWI-050 25KG',
  // Paints
  'EWI-002',
  'EWI-005-5A',
  'EWI-005-15A',
  'EWI-005-15D 15L',
  'EWI-006-15A',
  // Primery
  'EWI-301',
  'EWI-302',
  'EWI-303 Gel primer 5L',
  'EWI-310 20KG',
  'EWI-330-20',
  'EWI-333-7',
  'EWI-333-20',
  // Pigmenty — wszystkie PIGMENT-D-XXX (bez 1L, uppercase)
  'PIGMENT-D-11',
  'PIGMENT-D-100',
  'PIGMENT-D-104',
  'PIGMENT-D-110',
  'PIGMENT-D-113',
  'PIGMENT-D-200',
  'PIGMENT-D-204',
  'PIGMENT-D-213',
  'PIGMENT-D-300',
  'PIGMENT-D-305',
  'PIGMENT-D-802',
  'PIGMENT-D-900',
  'PIGMENT-D-902',
  'PIGMENT-D-905',
  'PIGMENT-D-907',
];

const INCOME_ACC = '66'; // Sales of Product Income
const COGS_ACC = '67';   // Cost of Sales
const EXP_ACC = '67';

async function ensureItem(c, name, kind /* 'pro' | 'store' */) {
  const q = await c.query(`SELECT Id, Name FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Item && q.QueryResponse.Item[0];
  if (existing) {
    return existing;
  }
  // Service item, used for both income (Pro side) and expense (Store side)
  const payload = {
    Name: name,
    Type: 'Service',
    IncomeAccountRef: { value: INCOME_ACC },
    ExpenseAccountRef: { value: EXP_ACC },
    Taxable: true,
  };
  const r = await c.post('item', payload);
  return r.Item;
}

async function ensureAccount(c, name, accountType, accountSubType) {
  const q = await c.query(`SELECT Id, Name FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Account && q.QueryResponse.Account[0];
  if (existing) return existing;
  const r = await c.post('account', { Name: name, AccountType: accountType, AccountSubType: accountSubType });
  return r.Account;
}

(async () => {
  for (const which of ['pro', 'store']) {
    const c = await getClient(which);
    console.log(`\n=== ${which.toUpperCase()} ===`);
    // Account Import (Category section on Bills)
    const a = await ensureAccount(c, 'Import', 'Cost of Goods Sold', 'SuppliesMaterialsCogs');
    console.log(`  Account Import: #${a.Id}`);
    // Items per SKU
    for (const sku of SKUS) {
      const it = await ensureItem(c, sku, which);
      console.log(`  Item ${sku}: #${it.Id}`);
    }
  }
  console.log('\n✓ Done.');
})().catch(e => {
  console.error('ERR', e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
  process.exit(1);
});
