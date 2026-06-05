# Phase 0 + Phase 1 (resolver) — Status

## ✅ End-to-end pipeline na 5 fixturach

```
Kreisel ref → MySQL POD → truck_reg → (container? Magemar ATA : MySQL heuristic) → HMRC month → rate → math → compare with PDF
```

Wynik `node reconcile.js`:

| Fixture | EWI Pro # | Resolver | Źródło | HMRC | Status |
|---------|-----------|----------|--------|------|--------|
| 11/2026/EXP | 4703 | ECMU5405966 → ATA 9-Feb | magemar_ata | 2026-02 (4.8397) | ✅ PASS |
| 38/2026/EXP | 4745 | CGMU8514020 → ATA 28-Feb | magemar_ata | 2026-02 (4.8397) | ✅ PASS |
| 55/2026/EXP | 4785 | truck (delivery 14-Mar) | mysql_heuristic | 2026-03 (4.8371) | ✅ PASS |
| 82/2026/EXP | 4817 | FFAU5409519 → ATA 20-Apr | magemar_ata | 2026-04 (4.9305) | ✅ PASS |
| 201/2026/EXP | 4993 | CMAU6487821 (nie w Magemar) | — | — | 🚫 BLOCKED |

**Summary:** 4 PASS · 1 BLOCKED · 0 FAIL.

201/2026 zablokowany poprawnie — kontener jeszcze nie dotarł do UK, brak w Magemar Excelu → pipeline nie generuje draftu zanim ATA się nie pojawi. Safety gate działa.

## Architektura resolvera (zaimplementowana)

```
resolveImport(kreiselRef)
  └─> getPodRow()  ← MySQL dist.purchase_orders_deliveries, supplier=2884 (EWI PRO), LIKE 'FSE-{nr}/{yr}/%'
        ├─> truck_reg_number ~ /^[A-Z]{4}\d{7}$/  ──→ lookupContainer(truck_reg)  [Magemar Excel]
        │     ├─ found + ATA      → status:ok       hmrc_month = month(ATA)
        │     ├─ found, no ATA    → status:container_not_arrived
        │     └─ not found        → status:container_not_in_magemar
        │
        └─> truck (slash, mixed)  ──→ heuristicHmrcMonth(delivery_date)
              ├─ delivery_date NULL  → status:truck_pending_delivery
              └─ else                → status:ok  (day≤3 → prev month, else month(delivery))
```

## Źródła prawdy (locked)

| Dane | Źródło | Pole |
|------|--------|------|
| Faktura Kreisla → POD | `dist.purchase_orders_deliveries` | `invoice_number_supplier LIKE 'FSE-{nr}/{yr}/%'` + `supplier_id=2884` |
| Nr kontenera / plates | `dist.purchase_orders_deliveries` | `truck_reg_number` |
| **ATA Tilbury/Teesport** | Magemar Excel `external/magemar.xlsx` Sheet1 | col O |
| HMRC rate | trade-tariff.service.gov.uk API | monthly CSV |
| PVA Import VAT | QBO standard tax code | `PVA Import 20.0%` |
| Bill ExchangeRate | computed | `1 / hmrc_rate` |

## Pliki (`E:/claude/mysql/kreisel/`)

```
.env                         credentials (QBO sandbox, MySQL)
parse_ewipro.js              parser PDF EWI Pro (ground truth)
hmrc_rate.js                 fetcher HMRC + cache (hmrc_cache/)
magemar_lookup.js            Magemar Excel → container → ATA
resolve_import.js            hybrid resolver (Magemar + MySQL)
math.js                      konwersja PLN→GBP (spec 2.1)
reconcile.js                 end-to-end test + bramki sec 6
qbo_oauth_helper.js          OAuth dla sandbox QBO
fixtures/
  kreisel_inputs.json        5 wejściowych z spec sec 7
  ewipro_*.pdf               5 PDF (ground truth)
  kreisel_*.pdf              5 PDF Kreisla (skany)
external/
  magemar.xlsx               manualnie pobierany z SharePoint
```

## Co działa teraz (mogę powtórzyć w 30s)

```powershell
cd E:/claude/mysql/kreisel
node reconcile.js                            # 4 PASS · 1 BLOCKED
node resolve_import.js "201/2026/EXP"        # debug resolver
node magemar_lookup.js ECMU5405966           # debug Magemar
node hmrc_rate.js 2026-6                     # debug HMRC
```

## Co zostaje do następnej fazy

### Decyzje (twoja strona)

1. **Magemar Excel — aktualizacja.** Plik na cross-tenant SharePoint, shortcut do OneDrive niemożliwy.
   - **(a)** Pobierasz xlsx ręcznie przed każdym uruchomieniem (ok dla manual run).
   - **(b)** Playwright + zapamiętana sesja → automatyczne pobranie raz dziennie do `external/magemar.xlsx`.
   - **(c)** Microsoft Graph API + multi-tenant guest auth — najczystsze, ale wymaga konfiguracji w CMA tenant.
   
   Rekomendacja: **(a) na start**, **(b) jak pójdzie do regularnej pracy**.

2. **Parser danych Kreisla** (skany PDF, brak warstwy tekstowej).
   - **(A)** Prośba do Kreisla o elektroniczne PDF/XML.
   - **(B)** Operator wpisuje 5–10 pól w formularzu, Claude API multimodal weryfikuje vs PDF.
   - **(C)** Tesseract OCR lokalny.
   
   Rekomendacja: **(B)** — najpewniejsze, ~30s/faktura, weryfikacja AI eliminuje literówki.

3. **QBO refresh tokens.** Czekam aż Intuit auth ruszy. Dodaj `http://localhost:3000/callback` do redirect URI, potem 2× `node qbo_oauth_helper.js`.

### Implementacja (moja strona, po decyzjach)

- **Faza 2:** generator draftu (PDF/HTML preview + JSON dla zatwierdzenia)
- **Faza 3:** QBO sandbox — multicurrency on, vendor/customer setup przez API, Bill+Invoice+Bill payload, dry-run, post.
- **Faza 4:** produkcja, regularne odpalania (Task Scheduler).
