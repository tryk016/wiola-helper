---
title: Changelog
layout: default
---

# Changelog

Lista wszystkich znaczących zmian, od początku projektu.

## Wrzesień 2026

### 📦 Eksport produktów EWI Pro → EWI Store
- Nowy ekran **„📦 Produkty Pro → Store”** (stopka): lista aktywnych produktów z QBO EWI Pro, checkboxy, „Zaznacz / Odznacz wszystkie”, wyszukiwarka, filtr „tylko brakujące w Store”
- **„Wyślij do EWI Store”** zakłada zaznaczone produkty po kolei, z wynikiem ✓ / ✗ przy każdym wierszu
- Kopiowane: nazwa, SKU, opisy, typ (Inventory → NonInventory). Konta + VAT z szablonu w Store (`pickItemTemplate`, wspólny z auto-create przy fakturach). Kategoria, jeśli istnieje w Store. Bez cen
- Tylko tworzenie: istniejące produkty w Store nie są zmieniane; duplikaty nazw pomijane
- Logika w `system/qbo_items_sync.js` + testy `node --test qbo_items_sync.test.js`

### 🔑 Instalacja i aktualizacje gotowe na prywatne repo (opcjonalny token GitHub)
- `setup_wiola.ps1`, `update_wiola.ps1` i „Sprawdź aktualizacje” pobierają przez GitHub API. Publiczne repo — bez tokena; gdy GitHub odmówi (repo prywatne), skrypty proszą o `GITHUB_TOKEN`, zapisują go w `.env` i ponawiają
- `setup_wiola.ps1`: wybór `.env` przeniesiony na krok 2 (przed pobraniem kodu)
- Ustawienia: nowa sekcja **🔑 Token GitHub**; czytelne komunikaty przy 401/404
- Nowa instrukcja `INSTRUKCJA_IT.md`, zaktualizowane `PENDRIVE_INSTRUKCJA.txt`, `docs/installation.md`, `docs/env-config.md`

### 🧹 Sprzątanie
- Usunięty stary tryb bez okna: `1_INSTALACJA…cmd`, `2_Sprawdz…cmd`, `3_Procesuj…cmd`, `INSTRUKCJA.txt`, `process_inbox.js` + parser OCR/regex (`parse_kreisel_pl.js`, `ocr_pdf.js`, `extract_pdf_image.js`, `parse_kreisel_ocr.js`)
- Usunięte jednorazowe skrypty z fazy sandbox (`qbo_setup_*`, `qbo_inspect*`, `qbo_post_kreisel`, `qbo_oauth_helper`, `migrate_env`, `reconcile`, `dump_*`, …) i stare notatki (`NOTES`, `PHASE0_REPORT`, `PRODUCTION_MIGRATION`, `SETUP`)
- Usunięte `fix_shortcut.cmd` (skróty odbudowuje `update_wiola`) i `make_portable.cmd`
- Nieużywane biblioteki: `tesseract.js`, `node-quickbooks`, `intuit-oauth`

## Czerwiec 2026

### 🚀 Hybrid parser + double-parse elimination
- **Hybrid parser** (`parse_kreisel_llm.js`): text-layer detection via pdf-parse, Claude **text-only** dla text PDFs (~7s, ~50% mniej tokens), Claude **vision** dla skanów (~40s, fallback)
- **`quickKreiselRef`**: regex-only extraction kreisel_ref dla discovery phase. **Wyeliminowane podwójne parsowanie** — discovery używał LLM, teraz tylko ~600ms regex, fallback do LLM tylko dla skanów
- **Wpływ**: 20 faktur tekstowych = ~2.5 min parsowania (vs ~5 min wcześniej), ~$0.05 oszczędności miesięcznie

### 🚛 Confirm Transport (interactive)
- **ConfirmTransportModal**: gdy PDF nie ma kontenera, MySQL `purchase_orders_deliveries` lookup po `kreisel_ref`, auto-prefill numeru z `truck_reg_number` (z flagą `is_placeholder` jeśli wygląda jak invoice ref)
- **Pipeline awaits inline** (jak `unknown_sku`): user submits → resolve Promise → pipeline kontynuuje → batch nie potrzebuje "Wyślij wszystkie" znowu
- **Opcjonalny HMRC month w modal**: pomija resolver dla tej faktury
- **"Nie procesuj — zatrzymaj batch"**: explicitly halts ze zachowaniem numeracji invariant

### 🔐 Dual QBO credentials
- `.env` trzyma **obie pary** kluczy QBO (Sandbox + Production)
- `getQboCredentials()` wybiera pair na podstawie `QBO_ENV`
- Settings UI: dwa oddzielne bloki (amber Sandbox / emerald Production)
- Backward compat z legacy `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`
- `migrate_env.js` helper script do migracji starych `.env`

### 🌐 HTTPS OAuth redirect (production)
- Production Redirect URI: `https://tryk016.github.io/wiola-helper/oauth-callback.html`
- Sandbox zostaje na `http://localhost:3000/callback` (Intuit allows HTTP dla sandbox)
- GitHub Pages serwuje statyczny bouncer page; Electron interceptuje navigation zanim się załaduje

### 🚛 Truck → MySQL lookup (no +3d guess)
- Trucks zawsze wymagają MySQL `delivery_date` (hard data), nigdy +3d prediction
- `purchase_orders_deliveries` query supports zarówno `FSE-XXX/YYYY/%` jak `XXX/YYYY/%` formats
- Wstrzymane faktury (no delivery_date) trafiają do "Oczekujące" z `pending_message` opisującym POD state
- Modal ChooseMonth: jeśli empty options[] → manual YYYY-MM input zamiast wyboru przycisków

### 🔄 In-app updates + retry button
- **🔄 Retry button** na statusach `failed`, `ambiguous`, `unknown_sku`, `missing_transport`, `awaiting_transport_confirm`
- **Settings → 🔄 Aktualizacje**: GitHub API check + "Aktualizuj teraz" → VBS launcher + hidden PowerShell → silent update + auto-relaunch
- **`.version` file**: lokalny commit SHA, porównywany z latest na main

### ⏱ Anti-automation delay
- Random delay 4-10 min (configurable) między udanymi POSTami QBO
- Tylko w `Posting` mode (dry-run = no delay)
- UI: countdown badge `MM:SS` + "Wyślij teraz" skip button
- Status `delay` (fioletowy ⏱), reset na restart aplikacji

### 🆘 In-app support + intuit_tid logging
- Settings → 🆘 Pomoc: mailto Patryka + "Otwórz folder z logami"
- axios interceptor captures `intuit_tid` z każdego QBO response → log.txt
- Required by Intuit App Assessment

### 🚫 Bug fix: silent +3d posts
- Wcześniej: brakujący kontener w PDF → resolver robił +3d prediction → bill szedł do QBO z synthesised date
- Teraz: blocking gate, user explicitly potwierdza transport

### 📅 Manual HMRC month picker
- `ChooseMonthModal`: gdy kontener jest, dwa proponowane miesiące do wyboru (granica miesiąca)
- Plus custom YYYY-MM input zawsze dostępny
- `manual_hmrc_month` persisted na invoice — działa również po retry

### 🤖 LLM parser fixes
- Payment terms ("Przelew-90 2026-08-20") nie są wciągane jako line items
- Safety filter: linie bez PKWiU/PCN są odrzucane (z log do stderr)
- LLM timeout 120s
- Reset hung `parsing`/`processing` statuses na app restart

### 🎨 UI polish
- `Data wystawienia` w sidebar
- Confirm Transport modal: input editable nawet po prefill (useEffect deps fix)
- Settings: ukryte sekcje MySQL + Anthropic (admin only, edycja przez `.env`)
- DevTools blocked w production (`devTools: false` + `Menu.setApplicationMenu(null)` + auto-close on devtools-opened event)

---

## 2026-05 (faza GUI 6 + production prep)

### 🔐 In-app QBO OAuth Login
- BrowserWindow OAuth flow inside Electron — no manual `qbo_oauth_helper.js` CLI
- `will-redirect` interceptor parses code + realmId, exchanges for tokens
- Auto-saves `QBO_*_REFRESH_TOKEN` + `QBO_*_REALM_ID` to `.env`
- Sandbox vs Production redirect URI auto-detect

### 📋 History view
- Full-screen modal z filtrowaniem po FSE/data/kwota
- Monthly grouping z totals
- Two-pane layout (lista + sidebar detail)
- "Wyczyść historię" button

### 🔁 Duplicate detection
- Przy enqueue: check po filename w history
- DuplicatesModal z "Pomiń wszystkie" / "Wymuś wszystkie"

### 📊 Line items detail w sidebar
- Tabela qty/cena/PLN/GBP per linia
- 📦 paleta / 🎨 pigment / 🧪 sample tags

### ⏱ Auto-archive (30s default)
- `completed_at` timestamp na done → archive po `autoArchiveSeconds`
- Legacy items bez timestamp migrowane na load

---

## 2026-05 (GUI 1-5: scaffolding → MVP)

### 🏗 Phase 1-5: Electron + React MVP
- Vite + electron + React + TypeScript scaffold
- DropZone (drag & drop PDF) + electron `webUtils.getPathForFile`
- Queue + Pending + Sidebar + StatusBar
- IPC: pdf:pick, queue:enqueue/state/processAll, settings, OAuth (CLI initially), modals
- UnknownSku + PendingResolved modals
- Settings page (env, credentials, realm IDs, refresh tokens)
- Log viewer
- NSIS installer attempts (blocked by symlink permissions; switched to PowerShell installer)

### 📅 Container transit analysis
- 612 historical containers Kreisel → Tilbury analyzed
- +13d initial heuristic → +12d (88% same-month accuracy, vs 85% at +13d/+14d)
- Month-boundary buffer (day ≤ 3 or ≥ 28 → ambiguous)

### 🧠 LLM parser migration
- Anthropic Claude Sonnet 4.5 z vision (PDF input)
- Prompt caching na system prompt + tool definition
- Tool `submit_kreisel_invoice` z strict JSON schema
- Replaced Tesseract OCR (10-30s, ~95% accuracy) z Claude (3-5s, ~99%)

### 📦 system/ extraction
- Cały kod biznesowy do `C:\kreisel\system\` (parser, resolver, QBO client)
- Wiola Helper require()-uje, nie kopiuje

---

## 2026-04 i wcześniej (CLI era)

- Polish OCR parser (`parse_kreisel_pl.js`) — regex + Tesseract
- Manual `qbo_oauth_helper.js` CLI dla refresh tokens
- `process_inbox.js` jako CLI bridge (dziś legacy)
- HMRC monthly rates fetch + cache
- Magemar xlsx parsing dla ATA dates
- `qbo_payloads.js` builder dla 3 dokumentów
- Sandbox testing z duplikatami EWI Pro/Store

---

## Statystyki projektu

| Metryka | Wartość |
|---------|---------|
| Phase milestones | 6 (GUI 1-5 + production prep + ongoing fixes) |
| Modale | 7 (UnknownSku, PendingResolved, Duplicates, ChooseMonth, MissingTransport, ConfirmTransport, History) |
| InvoiceStatus values | 11 |
| LLM API calls per faktura | 1 (z double-parse fix), wcześniej 2 |
| Average parse time | ~7s text / ~40s vision |
| Average pipeline time per faktura (no delay) | ~15-50s |
| Average pipeline time per faktura (z delay 4-10 min) | ~5-11 min |
| Lines of code (rough) | ~5000 (TS + JS + TSX, bez node_modules) |
| Plików dokumentacji | 9 markdown w docs/ |
| GitHub commits od start projektu | 30+ |
