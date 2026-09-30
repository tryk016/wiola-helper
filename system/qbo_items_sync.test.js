// Tests for qbo_items_sync.js — run: node --test qbo_items_sync.test.js
// QBO clients are fakes (no network): query() answers from an in-memory
// catalog, post() records what would be created.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listItems, compareCatalogs, buildStoreItemBody, exportToStore,
} = require('./qbo_items_sync');
const { pickItemTemplate } = require('./qbo_payloads');

function fakeClient(items, { realmId = 'r1', failOn = {} } = {}) {
  const posted = [];
  const queries = [];
  return {
    realmId,
    posted,
    queries,
    async query(sql) {
      queries.push(sql);
      const m = /STARTPOSITION (\d+) MAXRESULTS (\d+)/.exec(sql);
      if (m) {
        const start = +m[1] - 1;
        return { QueryResponse: { Item: items.slice(start, start + +m[2]) } };
      }
      const like = /Name LIKE '(.*)%'/.exec(sql);
      if (like) {
        const prefix = like[1].replace(/\\'/g, "'");
        return { QueryResponse: { Item: items.filter(i => i.Name.startsWith(prefix)) } };
      }
      if (/Type='Service'/.test(sql)) {
        return { QueryResponse: { Item: items.filter(i => i.Type === 'Service') } };
      }
      throw new Error('unexpected query: ' + sql);
    },
    async post(path, body) {
      if (failOn[body.Name]) throw failOn[body.Name];
      posted.push({ path, body });
      return { Item: { ...body, Id: String(900 + posted.length) } };
    },
  };
}

const acc = (value, name) => ({ value, name });
const qboError = (code, Message, Detail) =>
  Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data: { Fault: { Error: [{ code, Message, Detail }] } } },
  });

// ── listItems ────────────────────────────────────────────────────────────

test('listItems pages through the catalog until a short page', async () => {
  const items = Array.from({ length: 2500 }, (_, i) => ({ Id: String(i), Name: `P${i}`, Type: 'Service' }));
  const c = fakeClient(items);
  const out = await listItems(c);
  assert.equal(out.length, 2500);
  assert.equal(c.queries.length, 3);
  assert.match(c.queries[0], /WHERE Active = true STARTPOSITION 1 MAXRESULTS 1000/);
  assert.match(c.queries[2], /STARTPOSITION 2001 /);
});

// ── compareCatalogs ──────────────────────────────────────────────────────

test('compareCatalogs lists only sellable item types', () => {
  const pro = [
    { Id: '1', Name: 'EWI-212', FullyQualifiedName: 'EWI-212', Type: 'Service' },
    { Id: '2', Name: 'Tynki', FullyQualifiedName: 'Tynki', Type: 'Category' },
    { Id: '3', Name: 'Zestaw', FullyQualifiedName: 'Zestaw', Type: 'Group' },
    { Id: '4', Name: 'Wiadro', FullyQualifiedName: 'Wiadro', Type: 'Inventory' },
    { Id: '5', Name: 'Pallet', FullyQualifiedName: 'Pallet', Type: 'NonInventory' },
  ];
  const rows = compareCatalogs(pro, []);
  assert.deepEqual(rows.map(r => r.id).sort(), ['1', '4', '5']);
});

test('compareCatalogs marks items already in Store ignoring case and spacing', () => {
  const pro = [
    { Id: '1', Name: 'EWI-075-1.5A', FullyQualifiedName: 'EWI-075-1.5A', Type: 'Service' },
    { Id: '2', Name: 'EWI Goods', FullyQualifiedName: 'EWI Goods', Type: 'Service' },
  ];
  const store = [{ Id: '9', Name: ' ewi-075-1.5a ', FullyQualifiedName: 'ewi-075-1.5a', Type: 'Service' }];
  const rows = compareCatalogs(pro, store);
  assert.equal(rows.find(r => r.id === '1').inStore, true);
  assert.equal(rows.find(r => r.id === '2').inStore, false);
});

test('compareCatalogs exposes display fields, parent category and sorts by full name', () => {
  const pro = [
    { Id: '2', Name: 'Zeta', FullyQualifiedName: 'Zeta', Type: 'Service' },
    { Id: '7', Name: 'Tynki', FullyQualifiedName: 'Tynki', Type: 'Category' },
    {
      Id: '1', Name: 'EWI-075-1A', FullyQualifiedName: 'Tynki:EWI-075-1A', Type: 'Service',
      Sku: 'SKU1', Description: 'Tynk silikonowy', SubItem: true, ParentRef: { value: '7' },
    },
  ];
  const rows = compareCatalogs(pro, []);
  assert.deepEqual(rows.map(r => r.id), ['1', '2']);
  assert.deepEqual(rows[0], {
    id: '1', name: 'EWI-075-1A', fullName: 'Tynki:EWI-075-1A', sku: 'SKU1', type: 'Service',
    description: 'Tynk silikonowy', parentName: 'Tynki', inStore: false,
  });
  assert.equal(rows[1].parentName, null);
});

// ── buildStoreItemBody ───────────────────────────────────────────────────

const storeTemplate = {
  Name: 'EWI-212', Type: 'Service',
  IncomeAccountRef: acc('66', 'Sales of Product Income'),
  ExpenseAccountRef: acc('80', 'Materials'),
  SalesTaxCodeRef: { value: '3' }, PurchaseTaxCodeRef: { value: '3' },
  Taxable: true,
};

test('buildStoreItemBody copies product fields and takes accounts from the Store template', () => {
  const proItem = {
    Id: '5', Name: 'EWI-220 25KG', Type: 'Service', Sku: 'E220', Description: 'Klej',
    PurchaseDesc: 'Klej zakup', UnitPrice: 12.5, PurchaseCost: 9,
    IncomeAccountRef: acc('66', 'Sales of Product Income'), ExpenseAccountRef: acc('99', 'Import'),
  };
  assert.deepEqual(buildStoreItemBody(proItem, storeTemplate), {
    Name: 'EWI-220 25KG', Type: 'Service', Sku: 'E220', Description: 'Klej', PurchaseDesc: 'Klej zakup',
    IncomeAccountRef: { value: '66' }, ExpenseAccountRef: { value: '80' },
    SalesTaxCodeRef: { value: '3' }, PurchaseTaxCodeRef: { value: '3' },
    Taxable: true,
  });
});

test('buildStoreItemBody creates Inventory products as NonInventory', () => {
  const body = buildStoreItemBody({ Name: 'Wiadro', Type: 'Inventory', QtyOnHand: 5 }, storeTemplate);
  assert.equal(body.Type, 'NonInventory');
  assert.equal(body.QtyOnHand, undefined);
});

test('buildStoreItemBody puts the product under a Store category when given', () => {
  const body = buildStoreItemBody({ Name: 'EWI-075-1A', Type: 'Service' }, storeTemplate, '44');
  assert.equal(body.SubItem, true);
  assert.deepEqual(body.ParentRef, { value: '44' });
});

// ── exportToStore ────────────────────────────────────────────────────────

const PRO = [
  { Id: '7', Name: 'Tynki', FullyQualifiedName: 'Tynki', Type: 'Category' },
  { Id: '1', Name: 'EWI Goods', FullyQualifiedName: 'EWI Goods', Type: 'Service', Sku: 'G1' },
  { Id: '2', Name: 'EWI-212', FullyQualifiedName: 'EWI-212', Type: 'Service' },
  { Id: '3', Name: 'EWI-075-1A', FullyQualifiedName: 'Tynki:EWI-075-1A', Type: 'Service', SubItem: true, ParentRef: { value: '7' } },
  { Id: '4', Name: 'Bad Item', FullyQualifiedName: 'Bad Item', Type: 'Service' },
  { Id: '5', Name: 'Pallet', FullyQualifiedName: 'Pallet', Type: 'Service' },
];
const STORE = [
  { Id: '70', Name: 'Tynki', FullyQualifiedName: 'Tynki', Type: 'Category' },
  { Id: '71', Name: 'EWI-212', FullyQualifiedName: 'EWI-212', Type: 'Service' },
];
const alwaysTemplate = async () => storeTemplate;

test('exportToStore creates only the selected products that are missing in Store', async () => {
  const store = fakeClient(STORE);
  const results = await exportToStore({ storeClient: store, proItems: PRO, ids: ['1', '2'], pickTemplate: alwaysTemplate });
  assert.deepEqual(results.map(r => [r.id, r.status]), [['1', 'created'], ['2', 'exists']]);
  assert.equal(store.posted.length, 1);
  assert.equal(store.posted[0].path, 'item');
  assert.equal(store.posted[0].body.Name, 'EWI Goods');
  assert.equal(results[0].storeId, '901');
});

test('exportToStore places products in the matching Store category', async () => {
  const store = fakeClient(STORE);
  await exportToStore({ storeClient: store, proItems: PRO, ids: ['3'], pickTemplate: alwaysTemplate });
  assert.deepEqual(store.posted[0].body.ParentRef, { value: '70' });
});

test('exportToStore creates a product flat when Store lacks its category', async () => {
  const store = fakeClient([]);
  await exportToStore({ storeClient: store, proItems: PRO, ids: ['3'], pickTemplate: alwaysTemplate });
  assert.equal(store.posted[0].body.ParentRef, undefined);
});

test('exportToStore never creates the same name twice in one batch', async () => {
  const pro = [
    { Id: '1', Name: 'Primer', FullyQualifiedName: 'A:Primer', Type: 'Service' },
    { Id: '2', Name: 'primer', FullyQualifiedName: 'B:primer', Type: 'Service' },
  ];
  const store = fakeClient([]);
  const results = await exportToStore({ storeClient: store, proItems: pro, ids: ['1', '2'], pickTemplate: alwaysTemplate });
  assert.deepEqual(results.map(r => r.status), ['created', 'exists']);
  assert.equal(store.posted.length, 1);
});

test('exportToStore keeps going after a failed product and reports the QBO message', async () => {
  const store = fakeClient(STORE, {
    failOn: { 'Bad Item': qboError('2020', 'Required param missing', 'IncomeAccountRef is required') },
  });
  const results = await exportToStore({ storeClient: store, proItems: PRO, ids: ['4', '5'], pickTemplate: alwaysTemplate });
  assert.equal(results[0].status, 'error');
  assert.equal(results[0].message, 'Required param missing: IncomeAccountRef is required');
  assert.equal(results[1].status, 'created');
});

test('exportToStore treats a QBO duplicate-name error as already in Store', async () => {
  const store = fakeClient([], { failOn: { Pallet: qboError('6240', 'Duplicate Name Exists Error', 'The name supplied already exists.') } });
  const results = await exportToStore({ storeClient: store, proItems: PRO, ids: ['5'], pickTemplate: alwaysTemplate });
  assert.equal(results[0].status, 'exists');
});

test('exportToStore reports an error when Store has no account template', async () => {
  const store = fakeClient([]);
  const results = await exportToStore({ storeClient: store, proItems: PRO, ids: ['5'], pickTemplate: async () => null });
  assert.equal(results[0].status, 'error');
  assert.match(results[0].message, /szablon/i);
  assert.equal(store.posted.length, 0);
});

test('exportToStore reports progress for every product in order', async () => {
  const store = fakeClient(STORE);
  const seen = [];
  await exportToStore({
    storeClient: store, proItems: PRO, ids: ['1', '2', '5'], pickTemplate: alwaysTemplate,
    onProgress: (r) => seen.push(`${r.id}:${r.status}`),
  });
  assert.deepEqual(seen, ['1:created', '2:exists', '5:created']);
});

test('exportToStore reports ids that are not in the Pro list', async () => {
  const store = fakeClient(STORE);
  const results = await exportToStore({ storeClient: store, proItems: PRO, ids: ['404'], pickTemplate: alwaysTemplate });
  assert.equal(results[0].status, 'error');
  assert.equal(store.posted.length, 0);
});

// ── pickItemTemplate (qbo_payloads) ──────────────────────────────────────

test('pickItemTemplate prefers a same-family sibling in the realm', async () => {
  const c = fakeClient([
    { Id: '1', Name: 'PIGMENT-D-104', Type: 'Service', IncomeAccountRef: acc('66'), ExpenseAccountRef: acc('80') },
    { Id: '2', Name: 'EWI-212', Type: 'Service', IncomeAccountRef: acc('66'), ExpenseAccountRef: acc('67') },
  ], { realmId: 'tmpl-a' });
  const t = await pickItemTemplate(c, 'PIGMENT-D-105');
  assert.equal(t.Name, 'PIGMENT-D-104');
});

test('pickItemTemplate falls back to the dominant account pair', async () => {
  const c = fakeClient([
    { Id: '1', Name: 'A-1', Type: 'Service', IncomeAccountRef: acc('66'), ExpenseAccountRef: acc('67') },
    { Id: '2', Name: 'B-1', Type: 'Service', IncomeAccountRef: acc('66'), ExpenseAccountRef: acc('67') },
    { Id: '3', Name: 'C-1', Type: 'Service', IncomeAccountRef: acc('50'), ExpenseAccountRef: acc('51') },
  ], { realmId: 'tmpl-b' });
  const t = await pickItemTemplate(c, 'Nowy Produkt');
  assert.equal(t.IncomeAccountRef.value, '66');
  assert.equal(t.ExpenseAccountRef.value, '67');
});
