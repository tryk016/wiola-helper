// Copy products (QBO Items) from EWI Pro to EWI Store.
//
// Usage (Electron main):
//   const pro = await getClient('pro'), store = await getClient('store');
//   const proItems = await listItems(pro);
//   const rows = compareCatalogs(proItems, await listItems(store));   // for the picker UI
//   await exportToStore({ storeClient: store, proItems, ids, onProgress });
//
// Create-only: never updates or deletes an existing Store Item. Accounts + VAT
// come from a Store template (pickItemTemplate) — Pro account Ids mean nothing
// in the Store realm. Prices are not copied (each Bill line carries its own).

const PAGE = 1000; // QBO query MAXRESULTS ceiling
const EXPORTABLE_TYPES = ['Service', 'NonInventory', 'Inventory'];
const QBO_DUPLICATE_NAME = '6240';

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// All active Items in the realm, paging past the 1000-row query limit.
async function listItems(client) {
  const out = [];
  for (let start = 1; ; start += PAGE) {
    const r = await client.query(`SELECT * FROM Item WHERE Active = true STARTPOSITION ${start} MAXRESULTS ${PAGE}`);
    const page = (r.QueryResponse && r.QueryResponse.Item) || [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

function parentFullName(item, byId) {
  if (!item.ParentRef) return null;
  const parent = byId.get(item.ParentRef.value);
  return parent ? parent.FullyQualifiedName || parent.Name : item.ParentRef.name || null;
}

// Rows for the picker: every sellable Pro product + whether Store already has
// an Item with that name.
function compareCatalogs(proItems, storeItems) {
  const inStore = new Set(storeItems.map(i => normName(i.Name)));
  const byId = new Map(proItems.map(i => [i.Id, i]));
  return proItems
    .filter(i => EXPORTABLE_TYPES.includes(i.Type))
    .map(i => ({
      id: i.Id,
      name: i.Name,
      fullName: i.FullyQualifiedName || i.Name,
      sku: i.Sku || '',
      type: i.Type,
      description: i.Description || '',
      parentName: parentFullName(i, byId),
      inStore: inStore.has(normName(i.Name)),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pl'));
}

// POST /item body for Store: product fields from Pro, accounts + VAT from the
// Store template. Inventory → NonInventory (Store has no opening stock to give).
function buildStoreItemBody(proItem, template, parentId) {
  const body = { Name: proItem.Name, Type: proItem.Type === 'Inventory' ? 'NonInventory' : proItem.Type };
  for (const f of ['Sku', 'Description', 'PurchaseDesc']) {
    if (proItem[f]) body[f] = proItem[f];
  }
  for (const f of ['IncomeAccountRef', 'ExpenseAccountRef', 'SalesTaxCodeRef', 'PurchaseTaxCodeRef']) {
    if (template[f] && template[f].value) body[f] = { value: template[f].value };
  }
  if (template.Taxable !== undefined) body.Taxable = template.Taxable;
  if (parentId) {
    body.SubItem = true;
    body.ParentRef = { value: parentId };
  }
  return body;
}

function qboFault(e) {
  const err = e && e.response && e.response.data && e.response.data.Fault && e.response.data.Fault.Error;
  return err && err[0];
}

function qboErrorMessage(e) {
  const f = qboFault(e);
  if (f) return f.Detail ? `${f.Message}: ${f.Detail}` : f.Message;
  return (e && e.message) || String(e);
}

// Create the selected Pro products (by Id) in Store, one at a time.
// Returns one result per id: { id, name, status: 'created'|'exists'|'error', storeId?, message? }.
async function exportToStore({ storeClient, proItems, ids, pickTemplate, onProgress }) {
  if (!pickTemplate) pickTemplate = require('./qbo_payloads').pickItemTemplate;
  const byId = new Map(proItems.map(i => [i.Id, i]));

  const storeItems = await listItems(storeClient);
  const existing = new Set(storeItems.map(i => normName(i.Name)));
  const categories = new Map(
    storeItems.filter(i => i.Type === 'Category').map(i => [normName(i.FullyQualifiedName || i.Name), i.Id])
  );

  const results = [];
  for (const id of ids) {
    const item = byId.get(id);
    let r;
    if (!item) {
      r = { id, name: '', status: 'error', message: 'Produktu nie ma na liście z EWI Pro — odśwież listę' };
    } else if (existing.has(normName(item.Name))) {
      r = { id, name: item.Name, status: 'exists' };
    } else {
      try {
        const template = await pickTemplate(storeClient, item.Name);
        if (!template) throw new Error('Brak szablonu kont w EWI Store (żaden produkt nie ma konta przychodu)');
        const parent = parentFullName(item, byId);
        const parentId = parent ? categories.get(normName(parent)) : undefined;
        const res = await storeClient.post('item', buildStoreItemBody(item, template, parentId));
        existing.add(normName(item.Name));
        r = { id, name: item.Name, status: 'created', storeId: res.Item && res.Item.Id };
        console.log(`[products-export] created "${item.Name}" in EWI Store (Id ${r.storeId})`);
      } catch (e) {
        const f = qboFault(e);
        if (f && f.code === QBO_DUPLICATE_NAME) {
          existing.add(normName(item.Name));
          r = { id, name: item.Name, status: 'exists' };
        } else {
          r = { id, name: item.Name, status: 'error', message: qboErrorMessage(e) };
          console.warn(`[products-export] FAILED "${item.Name}": ${r.message}`);
        }
      }
    }
    results.push(r);
    if (onProgress) onProgress(r);
  }
  return results;
}

module.exports = { listItems, compareCatalogs, buildStoreItemBody, exportToStore };
