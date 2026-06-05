// Update existing EWI SKU Items so their ExpenseAccountRef points to "Import" account.
// This makes the Bill lines auto-classify as "Import" (Category=Import on P&L) without needing
// a separate Category line.

const { getClient } = require('./qbo_client');
const { getAccountId, getItemId } = require('./qbo_payloads');

const SKUS = [
  'EWI-212', 'EWI-269 25KG', 'EWI-225 25KG', 'EWI-075-1A', 'EWI-075-1.5A',
  'GOTOWA GLADZ POLIMEROWA GM150 18KG', 'Pallet',
  'Pigment-D-11 1L', 'PIGMENT-D-802', 'RENO SZPACHLA REMONTOWA 952 3-20 MM 25KG',
];

(async () => {
  for (const which of ['pro', 'store']) {
    const c = await getClient(which);
    const importAccId = await getAccountId(c, 'Import');
    console.log(`\n=== ${which.toUpperCase()} — Import acc #${importAccId} ===`);
    for (const sku of SKUS) {
      const q = await c.query(`SELECT * FROM Item WHERE Name = '${sku.replace(/'/g, "\\'")}'`);
      const it = q.QueryResponse.Item && q.QueryResponse.Item[0];
      if (!it) { console.log(`  skip ${sku}: not found`); continue; }
      const cur = it.ExpenseAccountRef ? it.ExpenseAccountRef.value : '-';
      if (cur === importAccId) { console.log(`  ✓ ${sku}: already on Import`); continue; }
      const upd = {
        Id: it.Id,
        SyncToken: it.SyncToken,
        sparse: true,
        ExpenseAccountRef: { value: importAccId },
        Type: it.Type,
        Name: it.Name,
      };
      const r = await c.post('item', upd);
      console.log(`  → ${sku}: Expense ${cur} → ${importAccId} (synctoken ${r.Item.SyncToken})`);
    }
  }
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data, null, 2) : e.message); process.exit(1); });
