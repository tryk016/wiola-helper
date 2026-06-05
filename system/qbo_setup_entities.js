// Ensure required vendors & customers exist in both QBO sandboxes.
// Idempotent — re-runnable, only creates if missing.

const { getClient } = require('./qbo_client');

const KREISEL_VENDOR = {
  DisplayName: 'KREISEL TECHNIKA BUDOWLANA SP. Z O.O.',
  CompanyName: 'KREISEL TECHNIKA BUDOWLANA SP. Z O.O.',
  CurrencyRef: { value: 'PLN' },
  TaxIdentifier: 'PL7810017450',
  BillAddr: {
    Line1: 'ul. Szarych Szeregow 23',
    City: 'Poznan',
    PostalCode: '60-462',
    Country: 'Poland',
  },
};

const EWISTORE_CUSTOMER = {
  DisplayName: 'EWI STORE LTD',
  CompanyName: 'EWI STORE LTD',
  CurrencyRef: { value: 'GBP' },
  PrimaryTaxIdentifier: 'GB256737179',
  BillAddr: {
    Line1: 'Unit 1 King Georges Trading Estate',
    Line2: 'Davis Road',
    City: 'Chessington',
    PostalCode: 'KT9 1TT',
    Country: 'United Kingdom',
  },
};

const EWIPRO_VENDOR = {
  DisplayName: 'EWI PRO INSULATION SYSTEMS LTD',
  CompanyName: 'EWI PRO INSULATION SYSTEMS LTD',
  CurrencyRef: { value: 'GBP' },
  TaxIdentifier: 'GB256737179',
  BillAddr: {
    Line1: 'Unit 1-2, King Georges Trading Estate',
    City: 'Surrey',
    Country: 'United Kingdom',
  },
};

async function findOrCreateVendor(c, name, payload) {
  const q = await c.query(`SELECT Id, DisplayName, CurrencyRef FROM Vendor WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Vendor && q.QueryResponse.Vendor[0];
  if (existing) {
    console.log(`  ✓ Vendor exists: #${existing.Id} ${existing.DisplayName} [${existing.CurrencyRef ? existing.CurrencyRef.value : '-'}]`);
    return existing;
  }
  const res = await c.post('vendor', payload);
  const v = res.Vendor;
  console.log(`  + Vendor CREATED: #${v.Id} ${v.DisplayName} [${v.CurrencyRef ? v.CurrencyRef.value : '-'}]`);
  return v;
}

async function findOrCreateCustomer(c, name, payload) {
  const q = await c.query(`SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Customer && q.QueryResponse.Customer[0];
  if (existing) {
    console.log(`  ✓ Customer exists: #${existing.Id} ${existing.DisplayName} [${existing.CurrencyRef ? existing.CurrencyRef.value : '-'}]`);
    return existing;
  }
  const res = await c.post('customer', payload);
  const cu = res.Customer;
  console.log(`  + Customer CREATED: #${cu.Id} ${cu.DisplayName} [${cu.CurrencyRef ? cu.CurrencyRef.value : '-'}]`);
  return cu;
}

async function findOrCreateItem(c, name, payload) {
  const q = await c.query(`SELECT Id, Name FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`);
  const existing = q.QueryResponse.Item && q.QueryResponse.Item[0];
  if (existing) {
    console.log(`  ✓ Item exists: #${existing.Id} ${existing.Name}`);
    return existing;
  }
  const res = await c.post('item', payload);
  const it = res.Item;
  console.log(`  + Item CREATED: #${it.Id} ${it.Name}`);
  return it;
}

(async () => {
  const pro = await getClient('pro');
  console.log('\n=== EWI Pro sandbox ===');
  await findOrCreateVendor(pro, KREISEL_VENDOR.DisplayName, KREISEL_VENDOR);
  await findOrCreateCustomer(pro, EWISTORE_CUSTOMER.DisplayName, EWISTORE_CUSTOMER);
  await findOrCreateItem(pro, 'EWI Goods', {
    Name: 'EWI Goods',
    Description: 'Generic line for Kreisel-sourced products (SKU in line description)',
    Type: 'Service',
    IncomeAccountRef: { value: '66' },  // Sales of Product Income
  });

  const store = await getClient('store');
  console.log('\n=== EWI Store sandbox ===');
  await findOrCreateVendor(store, EWIPRO_VENDOR.DisplayName, EWIPRO_VENDOR);

  console.log('\n✓ Setup complete.');
})().catch(e => {
  console.error('--- ERROR ---');
  console.error(e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
  process.exit(1);
});
