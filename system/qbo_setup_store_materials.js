// Switch EWI Store to use "Materials" account for SKU items + Bill Category line.
// Pro stays on "Import" (because EWI Pro genuinely imports from Kreisel).

const { getClient } = require('./qbo_client');
const { getAccountId } = require('./qbo_payloads');

const SKUS = [
  'EWI-212', 'EWI-269 25KG', 'EWI-225 25KG', 'EWI-075-1A', 'EWI-075-1.5A',
  'GOTOWA GLADZ POLIMEROWA GM150 18KG', 'Pallet',
  'Pigment-D-11 1L', 'PIGMENT-D-802', 'RENO SZPACHLA REMONTOWA 952 3-20 MM 25KG',
];

async function ensureAccount(c, name, type, subType) {
  const q = await c.query(`SELECT Id, Name FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Account && q.QueryResponse.Account[0];
  if (existing) return existing;
  const r = await c.post('account', { Name: name, AccountType: type, AccountSubType: subType });
  return r.Account;
}

(async () => {
  const store = await getClient('store');
  console.log('=== STORE ===');
  // Materials account (UK intercompany standard purchase)
  const mat = await ensureAccount(store, 'Materials', 'Cost of Goods Sold', 'SuppliesMaterialsCogs');
  console.log(`  Account Materials: #${mat.Id}`);
  // Re-point items
  for (const sku of SKUS) {
    const q = await store.query(`SELECT * FROM Item WHERE Name = '${sku.replace(/'/g, "\\'")}'`);
    const it = q.QueryResponse.Item && q.QueryResponse.Item[0];
    if (!it) { console.log(`  skip ${sku}: not found`); continue; }
    const cur = it.ExpenseAccountRef ? it.ExpenseAccountRef.value : '-';
    if (cur === mat.Id) { console.log(`  ✓ ${sku}: already on Materials`); continue; }
    const upd = {
      Id: it.Id,
      SyncToken: it.SyncToken,
      sparse: true,
      ExpenseAccountRef: { value: mat.Id },
      Type: it.Type,
      Name: it.Name,
    };
    const r = await store.post('item', upd);
    console.log(`  → ${sku}: Expense ${cur} → ${mat.Id}`);
  }
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data, null, 2) : e.message); process.exit(1); });
