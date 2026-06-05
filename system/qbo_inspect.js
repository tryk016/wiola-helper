// Inspect both QBO sandboxes — list vendors, customers, currencies, taxcodes, accounts.
const { getClient } = require('./qbo_client');

async function inspectCompany(which) {
  const c = await getClient(which);
  console.log('\n' + '═'.repeat(70));
  console.log(`COMPANY: ${which.toUpperCase()} (realm ${c.realmId})`);
  console.log('═'.repeat(70));

  const vendors = await c.query("SELECT Id, DisplayName, CurrencyRef FROM Vendor MAXRESULTS 200");
  console.log(`\nVendors (${(vendors.QueryResponse.Vendor || []).length}):`);
  (vendors.QueryResponse.Vendor || []).forEach(v => {
    const cur = v.CurrencyRef ? v.CurrencyRef.value : '-';
    console.log(`  #${v.Id} [${cur}]  ${v.DisplayName}`);
  });

  const customers = await c.query("SELECT * FROM Customer MAXRESULTS 200");
  console.log(`\nCustomers (${(customers.QueryResponse.Customer || []).length}):`);
  (customers.QueryResponse.Customer || []).forEach(v => {
    const cur = v.CurrencyRef ? v.CurrencyRef.value : '-';
    console.log(`  #${v.Id} [${cur}]  ${v.DisplayName}`);
  });

  // VAT/Tax codes (UK PVA)
  try {
    const tax = await c.query("SELECT Id, Name, Description FROM TaxCode MAXRESULTS 100");
    const list = tax.QueryResponse.TaxCode || [];
    console.log(`\nTaxCodes (${list.length}):`);
    list.forEach(t => {
      console.log(`  #${t.Id}  ${t.Name}  — ${t.Description || ''}`);
    });
  } catch (e) {
    console.log('\nTaxCodes query failed:', e.response ? e.response.status : e.message);
  }

  // currencies supported
  try {
    const cur = await c.get('preferences');
    const sup = cur.Preferences && cur.Preferences.CurrencyPrefs && cur.Preferences.CurrencyPrefs.SupportedCurrencies;
    console.log('\nSupported currencies:', sup ? JSON.stringify(sup) : 'n/a');
  } catch (e) {}
}

(async () => {
  await inspectCompany('pro');
  await inspectCompany('store');
})().catch(e => { console.error(e.response ? JSON.stringify(e.response.data, null, 2) : e); process.exit(1); });
