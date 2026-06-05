---
title: Baza wiedzy MySQL (dist)
layout: default
---

# Baza wiedzy: MySQL `dist` schema

> Te tabele i kolumny używamy w Wiola Helper. Pełniejsza dokumentacja schemy `dist` jest w `E:\claude\mysql\db_relations.md` (nie publikowane).

---

## Połączenie

```env
MYSQL_HOST=10.1.20.15
MYSQL_PORT=3306
MYSQL_DB=dist
MYSQL_USER=pbaranai     # read-only
MYSQL_PASSWORD='...'
```

**Zasada żelazna**: Wiola Helper **tylko SELECT**. Żadnych INSERT/UPDATE/DELETE. Magazyn ma swoje narzędzia do pisania do `dist`.

---

## `kf_suppliers` — dostawcy

| Kolumna | Wartość | Co znaczy |
|---------|---------|-----------|
| `id` | `350`, `881`, `2884`, … | Wiele wierszy "Kreisel" — różne historyczne aliasy |
| `id = 2884` | "EWI PRO INSULATION SYSTEMS LTD" | **Intercompany** dostawca w MySQL dla EWI Store (faktury Kreisel idą tutaj bo Pro je przekazuje) |
| `id = 39` | "Pertemps Recruitment Partnership Limited" | NIE Kreisel — to inna firma |

**Use case**: `WHERE supplier_id = 2884` filtruje faktury które przeszły przez intercompany EWI Pro → Store flow.

---

## `purchase_orders_deliveries` — POD (Purchase Order Deliveries)

Wpisy magazynowe per dostawa.

| Kolumna | Typ | Co znaczy |
|---------|-----|-----------|
| `id` | int | POD ID (np. `8637`) |
| `supplier_id` | int | FK → kf_suppliers.id (`2884` dla Kreisel-via-EWI-Pro) |
| `branch_id` | int | 9 Chessington, 11 Aylesbury, 13 Bradford, 14 Birmingham |
| `invoice_number_supplier` | varchar | **Numer Kreisla** — z prefiksem (`FSE-196/2026/EXP`) lub bez (`196/2026/EXP`) — różne konwencje per operator |
| `truck_reg_number` | varchar | Numer kontenera (`CMAU6487821`) lub auta (`PO-12345`) lub placeholder (`196/2026/EXP`, jeśli magazyn nie znał prawdziwego numeru) |
| `invoice_date` | unix int | Kreisel issue date |
| `delivery_date` | unix int | Faktyczna dostawa do UK magazynu (NULL jeśli jeszcze nie dotarło) |
| `delivered` | tinyint | 0 = nie, 1 = tak |
| `delivered_stamp` | unix int | Kiedy magazyn oznaczył jako dostarczone |

**Use cases**:

```sql
-- Pełny lookup PO przez Wiola Helper
SELECT id, branch_id, invoice_number_supplier, truck_reg_number, delivered,
       FROM_UNIXTIME(invoice_date) AS inv_dt,
       FROM_UNIXTIME(delivery_date) AS deliv_dt
  FROM purchase_orders_deliveries
 WHERE supplier_id = 2884
   AND (invoice_number_supplier LIKE 'FSE-196/2026/%'
     OR invoice_number_supplier LIKE '196/2026/%')
 ORDER BY invoice_date DESC;
```

**Wykorzystywane w**:
- `resolve_import.js getPodRow()` — full record dla resolvera
- `resolve_import.js lookupPodTransport()` — uproszczony record dla ConfirmTransportModal

---

## `kf_products` + `kf_products_stock` (informacyjnie)

Nie używane przez Wiola Helper bezpośrednio, ale przy snapshotting SKUs (`system/snapshot_products.js`) wyciągamy:

```sql
SELECT p.id, p.code, p.name, p.product_type_id
  FROM kf_products p
 WHERE p.supplier_id = 2884       -- EWI Pro
   AND p.usuniety = 0
   AND p.managing = 1;
```

To daje listę "ground truth" EWI Pro SKUs dla LLM mapping (`KNOWN_ITEM_NAMES` w `parse_kreisel_llm.js`).

---

## Branch IDs (referencja)

| ID | Nazwa | Lokalizacja |
|----|-------|------------|
| 9 | Chessington | Unit 1-2, King Georges Trading Estate, KT9 1TT |
| 11 | Aylesbury | (TBD) |
| 13 | Bradford | (TBD) |
| 14 | Birmingham | Unit B1, Elektra Park, Electric Avenue, B6 7EB |

---

## Inne tabele (informacyjnie, nie używane)

- `kf_invoices` — sales invoices EWI Store → customers
- `kf_invoices_lines` — line items na invoices
- `delivery_notes2` / `delivery_notes2_lines` — wydania z magazynu
- `kf_customers` — klienci

Pełna dokumentacja w `db_relations.md` (private).

---

## Typowe queries dla debugowania

### Sprawdź czy faktura jest w MySQL
```sql
SELECT id, supplier_id, invoice_number_supplier, truck_reg_number,
       FROM_UNIXTIME(invoice_date) AS inv_dt,
       FROM_UNIXTIME(delivery_date) AS deliv_dt
  FROM purchase_orders_deliveries
 WHERE invoice_number_supplier LIKE '%FSE-XXX%2026%';
```

### Sprawdź dostawy do branchy w danym okresie
```sql
SELECT branch_id, COUNT(*) as cnt
  FROM purchase_orders_deliveries
 WHERE supplier_id = 2884
   AND invoice_date BETWEEN UNIX_TIMESTAMP('2026-05-01') AND UNIX_TIMESTAMP('2026-05-31')
 GROUP BY branch_id;
```

### Sprawdź ile faktur jeszcze NIE dostarczyło
```sql
SELECT COUNT(*) FROM purchase_orders_deliveries
 WHERE supplier_id = 2884
   AND delivered = 0
   AND invoice_date > UNIX_TIMESTAMP(NOW() - INTERVAL 90 DAY);
```

---

## Caveats

### Placeholder truck_reg
Czasami magazyn wpisuje numer faktury (np. `196/2026/EXP`) jako `truck_reg_number` jeśli nie zna jeszcze numeru auta. Wiola Helper to wykrywa przez regex `^\d+\/\d{4}\/EXP$` i flaguje jako `is_placeholder` w `lookupPodTransport`.

### Duplikaty PODs
Bardzo rzadko ten sam Kreisel ref pojawia się w wielu PODs (split shipment, lub magazyn pomyłka). Resolver robi dedupe po fingerprint `truck_reg + delivery_date + invoice_date + branch_id`. Jeśli wciąż są duplikaty → `status: 'pod_multiple'` → user musi rozwiązać w dist.

### Prefix FSE- czy bez
Historycznie różni operatorzy wpisywali różnie. Nasz query używa OR z obu wzorców:
```sql
WHERE invoice_number_supplier LIKE 'FSE-196/2026/%'
   OR invoice_number_supplier LIKE '196/2026/%'
```

### Czas
Wszystkie pola `*_date` to **unix timestamps (int)**, nie datetimes. Konwersja: `FROM_UNIXTIME(invoice_date)`.

### Read-only enforcement
Account `pbaranai` ma SELECT-only privileges. Próba UPDATE/INSERT/DELETE rzuci `Access denied`. To zabezpieczenie — Wiola Helper nie może popsuć produkcyjnej DB.
