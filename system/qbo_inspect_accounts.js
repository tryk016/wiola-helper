const { getClient } = require('./qbo_client');

async function show(which) {
  const c = await getClient(which);
  console.log('\n═══ ' + which.toUpperCase() + ' ═══');
  const r = await c.query(`SELECT Id, Name, AccountType, AccountSubType, Classification FROM Account WHERE AccountType IN ('Cost of Goods Sold','Expense','Income','Other Current Liability','Accounts Payable','Accounts Receivable') MAXRESULTS 200`);
  (r.QueryResponse.Account || []).forEach(a => {
    console.log(`  #${a.Id.padEnd(4)} ${a.AccountType.padEnd(28)} ${a.AccountSubType ? a.AccountSubType.padEnd(28) : ''.padEnd(28)} ${a.Name}`);
  });
}

(async () => {
  await show('pro');
  await show('store');
})().catch(e => { console.error(e.response ? JSON.stringify(e.response.data, null, 2) : e.message); process.exit(1); });
