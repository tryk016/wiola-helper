---
title: Stany faktur
layout: default
---

# Stany faktur (InvoiceStatus)

Każda faktura w `InvoiceQueue` ma jeden z poniższych statusów. Każdemu odpowiada wizualny badge w UI i (czasem) modal.

| Status | Ikona | Kolor | Label PL | Co to znaczy |
|--------|-------|-------|----------|--------------|
| `waiting` | ⏳ | slate | "Oczekuje" | Wczytana, czeka na "Wyślij wszystkie" |
| `parsing` | 🧠 | blue | "Parsuję" | LLM/text parser w toku |
| `processing` | ⚙️ | blue | "Procesuję" | Resolver / HMRC / POST QBO |
| `done` | ✅ | emerald | "Gotowe" | Wszystkie 3 dokumenty w QBO, attachment OK |
| `failed` | ❌ | red | "Błąd" | Wywaliło, ale można 🔄 retry |
| `ambiguous` | ⏸ | amber | "Granica miesiąca" | W sekcji Oczekujące, czeka na decyzję HMRC |
| `unknown_sku` | ⚠️ | amber | "Nieznany produkt" | LLM nie zmapował SKU — modal pyta |
| `delay` | ⏱ | purple | "Czekam (anti-bot)" | Random 4-10 min między fakturami |
| `missing_transport` | 🚛 | orange | "Brak danych transportu — klik" | (Legacy, rzadko teraz — przez nowy flow) |
| `awaiting_transport_confirm` | 🚛 | blue | "Potwierdź transport — klik" | PDF nie ma kontenera, MySQL pre-loaded, modal otwarty |

---

## Szczegółowy flow per status

### ⏳ `waiting`
- **Wejście**: enqueue (drag & drop, file picker), klik 🔄 retry, klik "Procesuj dalej" w modal
- **Wyjście**: → `parsing` przy następnym processAll
- **UI**: zwykły wiersz w kolejce, button ✕ delete na hover

### 🧠 `parsing`
- **Wejście**: processAll pętla zaczyna runPipeline
- **Wyjście**:
  - → `processing` (parser OK + nie ma flag)
  - → `unknown_sku` (LLM zwrócił linie z `ewi_sku: null`)
  - → `awaiting_transport_confirm` (parser OK ale brak `container`)
  - → `failed` (parser rzucił błąd, np. timeout)
- **Persist**: ten status zostaje w queue.json, ale przy starcie aplikacji `load()` przepisuje na `failed` z message "Aplikacja zrestartowana w trakcie przetwarzania"

### ⚙️ `processing`
- **Wejście**: po parse, po confirm_transport, po pending recheck
- **Wyjście**:
  - → `delay` (jeśli enabled, post=true, nie pierwsza faktura)
  - → `done` (QBO OK + attachment OK)
  - → `failed` (resolver no_data, QBO 400/401, network)
  - → `ambiguous` (resolver ambiguous_month, kontener bliski granicy)
- **Persist**: jak `parsing` — reset na restart

### ✅ `done`
- **Wejście**: pipeline kompletny
- **Wyjście**: po `autoArchiveSeconds` (default 30s) → archive do `history`
- **UI**: zielony badge, można kliknąć w sidebar żeby zobaczyć pro_bill_id, store_bill_id, kwoty GBP

### ❌ `failed`
- **Wejście**: catch w pipeline (QBO error, parse error, network), albo `decision.halt` w ConfirmTransportModal
- **Wyjście**:
  - → `waiting` przez 🔄 retry button (clear error, clear progress)
  - lub user usuwa przez ✕
- **UI**: czerwony badge, error message w sidebar (z QBO Fault.Error details jeśli były)

### ⏸ `ambiguous` (w `pending[]`, nie w `queue[]`)
- **Wejście**: resolver zwrócił `status: 'ambiguous_month'`
- **Wyjście**:
  - → `waiting` przez ChooseMonthModal z manual_hmrc_month
  - lub przez "Sprawdź teraz" (pending:recheck) jeśli Magemar/MySQL ma teraz dane
- **UI**: pomarańczowy tile w sekcji Oczekujące pod kolejką. Klik → ChooseMonthModal
- **Specjalnie**: jeśli `hmrc_month_options: []` (truck pending), modal pokazuje manual YYYY-MM input zamiast dwóch propozycji miesięcy
- **Field `pending_message`**: human-readable powód (np. "POD #8637 jest w MySQL, brak delivery_date")

### ⚠️ `unknown_sku`
- **Wejście**: parsedKreisel.unmapped_lines.length > 0
- **Wyjście**:
  - → `processing` jeśli user wpisał mapping w UnknownSkuModal (TODO: apply mapping to k.lines)
  - → `failed` jeśli user klika "Pomiń całą fakturę"
- **UI**: żółty badge, automatyczne otwarcie modalu z listą `raw_desc` + `suggestions[]` z sku_mapping
- **TODO**: aktualnie pipeline po user mapping nie re-parsuje — user mapping zapisywany do `ewi_pro_known_items.json` żeby przy następnym uruchomieniu LLM go znał

### ⏱ `delay`
- **Wejście**: między udanymi POST QBO (faktura ≥ 2 w batchu)
- **Wyjście**:
  - → `waiting` po sleep zakończonym (manual reset on app restart)
  - lub natychmiast przez "Wyślij teraz" button (skipDelay)
- **UI**: countdown MM:SS + skip button
- **Field `delay_until`**: unix ms — kiedy timer się skończy
- **Persist**: status zapisywany ale przy restart aplikacji → `waiting`

### 🚛 `awaiting_transport_confirm`
- **Wejście**: pipeline Phase 1.5, gdy `!k.container && !options.manualContainer`
- **Wyjście**: pipeline awaits `onConfirmTransport` Promise. ConfirmTransportModal submit → resolve Promise → pipeline kontynuuje od fazy 2
  - `decision.halt = true` → status `failed`, halt invariant batch
  - Else → manualContainer + optional manualHmrcMonth → status `processing` → resolver
- **UI**: niebieski badge "Potwierdź transport — klik", auto-open modal przez useEffect
- **Field `suggested_transport`**: { pod_id, branch_id, truck_reg_number, is_placeholder, is_container, delivered, delivery_date }
- **Persist**: status zapisany ale przy restart → `waiting` + clear suggested_transport (świeży lookup MySQL przy następnym processAll)

### 🚛 `missing_transport` (legacy)
- Wcześniej używane gdy nie było MySQL preview. Teraz pipeline preferuje `awaiting_transport_confirm`. Modal nadal istnieje (MissingTransportModal) jako fallback gdy user ręcznie wprowadza fakturę bez OK MySQL lookup
- **UI**: pomarańczowy badge, otwiera MissingTransportModal po kliku

---

## Halt-on-failure list

`processAll` checking po runPipeline:

```ts
if (['failed', 'ambiguous', 'unknown_sku', 'missing_transport'].includes(status)) {
  halted = true;
  haltedAt = inv.kreisel_ref;
}
```

`awaiting_transport_confirm` NIE jest tutaj — pipeline obsługuje to inline.

Po halt: wszystkie kolejne faktury (większe FSE) dostają `status: 'waiting'` + `error: 'Wstrzymane — czeka na FSE-XXX'`.

---

## Reset hung statuses on app load

W `queue.ts load()`:

```ts
for (const inv of this.queue) {
  if (inv.status === 'parsing' || inv.status === 'processing') {
    inv.status = 'failed';
    inv.error = 'Aplikacja zrestartowana w trakcie przetwarzania — kliknij 🔄 aby spróbować ponownie';
  }
  if (inv.status === 'delay') {
    inv.status = 'waiting';
    delete inv.delay_until;
  }
  if (inv.status === 'awaiting_transport_confirm') {
    inv.status = 'waiting';
    delete inv.suggested_transport;  // re-lookup MySQL on next processAll
  }
  // missing_transport persists — user musi explicit rozwiązać
}
```

Zapobiega "ducha" faktura wiszącym w niezdefiniowanym stanie po crashu lub Ctrl+C.

---

## State persistence locations

| Stan | Plik | Zawartość |
|------|------|-----------|
| Active queue | `%APPDATA%\Wiola Helper\state\queue.json` | InvoiceState[] |
| Pending (wstrzymane) | `%APPDATA%\Wiola Helper\state\pending.json` | InvoiceState[] |
| History (zarchiwizowane) | `%APPDATA%\Wiola Helper\state\history.json` | InvoiceState[] (last 1000) |
| Preferences | `%APPDATA%\Wiola Helper\state\prefs.json` | AppPrefs (defaultMode, autoArchiveSeconds, delayMin/MaxMinutes) |

Wszystko JSON, edytowalne w Notatniku jeśli coś trzeba ręcznie naprawić. Wiola może też kliknąć "Wyczyść historię" lub usuwać pojedyncze wpisy w UI.
