---
title: Pipeline przetwarzania
layout: default
---

# Pipeline przetwarzania faktury

Każda faktura przeprowadzana przez ten sam pipeline w `wiola-helper/src/main/pipeline.ts → runPipeline()`. Poniżej krok-po-kroku.

---

## Faza 0: Discovery (przed pipeline)

Wykonywane w `processAll` w `index.ts` ZANIM odpalamy pełny pipeline, tylko żeby znać kolejność sortowania batcha.

```
for each waiting invoice without kreisel_ref:
   1. Try quickKreiselRef(file) — pdf-parse text + regex (no LLM, ~600ms)
   2. Jeśli zwróciło null (skan PDF) → fallback do parseKreiselWithLlm (LLM)
   3. Zapisz kreisel_ref w queue
   
sort batch by kreisel_ref ASC (FSE-XXX numerycznie)
```

**Po co**: zachowanie invariantu `Kreisel FSE ASC == EWI Pro Invoice ASC`. Wiola zazwyczaj wrzuca PDFy w przypadkowej kolejności (data downloadu), my musimy je przetworzyć w kolejności wystawienia.

**Koszt**: ~0 dla tekstowych PDF (regex), ~$0.005 + 40s dla skanów (LLM call). Większość faktur od Kreisla teraz jest tekstowych.

---

## Faza 1: PARSE

```ts
const k = await parseKreiselWithLlm(pdfPath);
```

`parse_kreisel_llm.js`:

1. Czyta PDF jako buffer
2. **Detekcja text layer**:
   - `pdf-parse` → tekst
   - Jeśli > 200 znaków + zawiera "Faktura eksportowa" → **text mode**
   - W przeciwnym razie → **vision mode**
3. **Text mode**: wysyła tekst do Claude Sonnet 4.5 z system promptem zawierającym listę znanych EWI Pro Items + reguły mapowania
4. **Vision mode**: wysyła PDF jako document attachment (Claude vision)
5. Claude wywołuje `submit_kreisel_invoice` tool (forced) z strukturalnym output:
   - `invoice_no`, `kreisel_ref`, `issue_date`, `sale_date`, `container`, `total_pln`
   - `lines[]` z `ewi_sku`, `qty`, `unit_pln`, `total_pln`, `pkwiu`, `pcn`, flags
6. **Post-parse safety filter**: usuwa linie bez `PKWiU` lub `PCN` (np. "Przelew-90" w sekcji warunków płatności)
7. Zwraca `{ invoice_no, lines, unmapped_lines, warnings, _meta }`

**`_meta.parser_mode`**: `'text'` (szybko, ~7s) lub `'vision'` (~40s).

**Co jeśli LLM zwróci `ewi_sku: null`** dla jakiejś linii? → trafia do `unmapped_lines[]`. Pipeline emit `status='unknown_sku'` i czeka na `UnknownSkuModal` od użytkownika.

---

## Faza 1.5: TRANSPORT CONFIRM GATE

Wykonuje się **TYLKO jeśli**:
- `k.container == null` (PDF nie ma numeru kontenera)
- `options.manualContainer === undefined` (user jeszcze nie potwierdzał)

```ts
const suggested = await lookupPodTransport(k.kreisel_ref);
ev.onProgress({ status: 'awaiting_transport_confirm', suggested_transport: suggested });
const decision = await ev.onConfirmTransport({ suggested });
```

**`lookupPodTransport`**:
- Szuka w `dist.purchase_orders_deliveries` po `invoice_number_supplier LIKE 'FSE-XXX/YYYY/%' OR 'XXX/YYYY/%'`
- Zwraca: pod_id, branch_id, truck_reg_number, is_placeholder (jeśli wygląda jak invoice ref), is_container (4 letters + 7 digits), delivered, delivery_date

Renderer otwiera `ConfirmTransportModal`, użytkownik:
- Zatwierdza propozycję, lub
- Wpisuje inny numer, lub
- Wpisuje HMRC month bezpośrednio (pomija resolver), lub
- **Stop batch** → status `failed`, halt invariant

Pipeline awaits Promise inline i kontynuuje z odpowiedzią.

---

## Faza 2: RESOLVE HMRC MONTH

Pomijana jeśli `options.manualHmrcMonth` ustawione (z ChooseMonthModal lub ConfirmTransportModal).

```ts
const resolved = await resolveImport({ kreisel_ref, container, issue_date });
```

`resolve_import.js` decyzyjnie:

### BRANCH A: MySQL niedostępne lub brak PODa

| `pdfContainer` | `pdfIssueDate` | Rezultat |
|----------------|----------------|----------|
| ❌ brak | ❌ brak | `status: 'no_data'` (nie da się przetworzyć) |
| ❌ brak | ✓ ma | `status: 'ambiguous_month'`, `pending_message` "Truck — brak wpisu w MySQL…" |
| ✓ ma kontener | (cokolwiek) | `lookupContainer(container)` w Magemar. Jeśli ATA → `'ok'` confirmed. Jeśli brak → `predictFromInvoiceDate(+12d)` (88% same-month accuracy z 612 historycznych kontenerów) |

### BRANCH B: MySQL ma POD

| Pod | Co dalej |
|-----|----------|
| `truck_reg_number` to kontener (4 litery + 7 cyfr) | Magemar lookup → ATA UK lub +12d prediction |
| `delivery_date` ustawione (truck dostarczony) | `month(delivery_date)`, day≤3 → poprzedni miesiąc |
| `delivery_date == null` | `status: 'ambiguous_month'`, `pending_message` z POD ID, truck_reg, delivered flag. NIE robimy +3d prediction (user explicit requirement) |

**Wszystkie scenariusze ambiguous** trafiają do **pending** sekcji UI z `ChooseMonthModal` (manual month input).

---

## Faza 3: HMRC RATE

```ts
const hmrc = await getRate(chosenHmrcMonth, 'PLN');
```

`hmrc_rate.js`:
- Cache w `C:\kreisel\system\hmrc_cache\{year}-{month}-{currency}.json`
- Jeśli cache miss → call do publicznego HMRC API
- Zwraca `{ rate, year, month }` gdzie `rate` to PLN→GBP (np. 0.2104)

---

## Faza 4: BUILD QBO PAYLOADS

```ts
const pro = await qboClient.getClient('pro');
const store = await qboClient.getClient('store');

const bill1 = await qboPayloads.buildKreiselBill(pro, k, hmrc.rate);
const inv = await qboPayloads.buildEwiproInvoice(pro, k, hmrc.rate);
const bill2 = await qboPayloads.buildEwistoreBillFromInvoice(store, k, inv.payload, hmrc.rate);
```

**Trzy dokumenty**:

1. **EWI Pro Bill** (Kreisel → EWI Pro): w PLN, vendor=Kreisel
   - Category line: `Import` (CoGS), Amount=0.00, TaxCode=PVA Import 20%
   - Item lines: per linia Kreisla, Qty × UnitPrice = Amount
   - Bill DocNumber = pełny Kreisel ref (np. `FSE-203/2026/EXP`)

2. **EWI Pro Invoice** (EWI Pro → EWI Store): w GBP, customer=EWI Store
   - Wartości przeliczone z PLN przez `hmrc.rate`
   - Line items wyrównane do `Item.SalesPrice` × 1.X margin (jeśli skonfigurowane w QBO)

3. **EWI Store Bill** (EWI Store → EWI Pro): w GBP, vendor=EWI Pro
   - Lustro Invoice powyżej
   - Bill DocNumber = numer Invoice EWI Pro

`getItemId`: lookup po nazwie EWI Pro Item w QBO przez query API. Cachowane in-memory per `getClient` session.

---

## Faza 5: ANTI-AUTOMATION DELAY

Tylko gdy `post=true` i prefs.delayMinMinutes > 0 i to **nie pierwsza faktura** w batchu.

```ts
const delay = randomInt(delayMinMs, delayMaxMs);
queue.update({ status: 'delay', delay_until: Date.now() + delay });
await sleepWithSkip(invoiceId, delay);  // skippable przez "Wyślij teraz"
```

Po co: QBO audit history nie pokaże "20 Bills w 30 sekund" co byłoby red flag automatyzacji.

---

## Faza 6: POST TO QBO

```ts
await pro.post('bill', bill1.payload);          // → returns Id
await pro.post('invoice', inv.payload);
await store.post('bill', bill2.payload);
```

`qbo_client.js` axios interceptor wyciąga `intuit_tid` z response headers i loguje do stderr (dla Intuit support troubleshooting).

**Pre-validation**: QBO API wymaga `Line.Amount` na każdej linii. Wcześniej próbowaliśmy `Amount: null` na Category line → 400 error 2020. Teraz `Amount: 0`.

---

## Faza 7: ATTACHMENT

```ts
const formData = new FormData();
formData.append('file_metadata_0', JSON.stringify({...}));
formData.append('file_content_0', pdfBuffer, {
  filename: kreisel_ref.replace(/\//g, '-') + '.pdf',  // np. "FSE-203-2026.pdf"
});
await pro.postMultipart('upload', formData);
```

Załączamy oryginalny PDF Kreisla do EWI Pro Bill.

---

## Faza 8: ARCHIVE

```ts
ev.onProgress({ id, status: 'done', progress: 100, pro_bill_id, store_bill_id });
```

`queue.update()` ustawia `completed_at = Date.now()`. Po 30 sekundach `archiveDone()` przenosi do historii (configurable via `autoArchiveSeconds`).

---

## Error handling

Cały `runPipeline` jest opakowany w try/catch:

```ts
catch (e) {
  // Extract QBO Fault.Error details if axios 400/422
  const fault = e?.response?.data?.Fault;
  if (fault?.Error?.length) {
    message = `QBO ${e.response.status}:\n${fault.Error.map(formatErr).join('\n')}`;
  }
  ev.onProgress({ status: 'failed', error: message });
}
```

Pipeline NIE rzuca wyjątku do processAll loop. Status `failed` jest dla użytkownika. Halt invariant w processAll łapie status.

---

## Numeracja invariant (halt-on-failure)

```ts
for (const inv of sorted) {  // sorted ASC by FSE number
  if (halted) {
    queue.update({ status: 'waiting', error: `Czeka na ${haltedAt}` });
    continue;
  }
  await runPipeline(...);
  if (['failed', 'ambiguous', 'unknown_sku', 'missing_transport'].includes(currentStatus)) {
    halted = true;
    haltedAt = inv.kreisel_ref;
  }
}
```

Kontekst: księgowa rejestruje EWI Pro Invoice w QBO ręcznie (przed automatyzacją). Numeracja Invoice w QBO Pro jest sekwencyjna. Jeśli FSE-200 padnie ale FSE-201 przejdzie, Invoice #1234 odpowiada FSE-201 a Invoice #1235 odpowiada FSE-202 — niezgodność z fizycznym papierem.

Halt zachowuje invariant. Wiola rozwiąże FSE-200 (retry, manual, edit dist), klika Wyślij wszystkie ponownie, batch rusza od miejsca gdzie się zatrzymał.

**Wyjątek**: `awaiting_transport_confirm` NIE jest na halt-list — pipeline awaitu na Promise inline i kontynuuje.

---

## Wpływ na czas batcha

| Scenariusz | Per faktura | 20 faktur |
|-----------|-------------|-----------|
| Text PDF, kontener w PDF, delay=0 | ~10s (parse + resolve + post) | ~3 min |
| Text PDF, no kontener, MySQL pre-fill, user OK + HMRC, delay=0 | ~15s (+ czas user input) | ~5 min |
| Skan PDF, vision parse, delay=0 | ~50s | ~17 min |
| Text PDF, delay 4-10 min | ~10s + 4-10 min | **~1.5-3.5h** |

Random delay dominuje. Jeden powód więcej żeby wszystkie faktury Kreisla brać jako PDF (nie skan).
