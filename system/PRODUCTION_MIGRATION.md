# Migracja Sandbox → Production

> Workflow: konfiguracja produkcji odbywa się **na komputerze Patryka**, potem cały gotowy zestaw przenosimy do koleżanki. Bezpiecznie, sprawdzalnie, bez konieczności jej ingerencji w technikalia.

---

## Faza 1 — Przygotowanie produkcyjnych kluczy (Patryk, 5 min)

### 1.1 Production keys w Intuit Developer

1. Wejdź na https://developer.intuit.com/app/developer/myapps
2. Otwórz swoją apkę (tę używaną do sandbox)
3. **Lewa kolumna → Production → Keys & credentials**
4. Skopiuj:
   - **Production Client ID**
   - **Production Client Secret**
5. **Redirect URIs (Production)** → dodaj: `http://localhost:3000/callback` → Save

### 1.2 Realm IDs produkcyjnych firm

Potrzebujesz dwóch Company IDs (= Realm IDs):

1. Zaloguj się do produkcyjnego QBO **EWI Pro**: https://qbo.intuit.com
2. Z URL skopiuj parametr `?realmId=XXXXX` (np. `9341457208649326`)
3. To samo dla **EWI Store** (osobno się zaloguj, sprawdź URL)

Zapisz oba realm IDs.

---

## Faza 2 — Backup sandboxa (Patryk, 1 min)

**Nie chcemy stracić działającej sandbox konfiguracji** — robimy backup `.env`:

```cmd
cd /d E:\claude\mysql\kreisel
copy .env .env.sandbox.backup
```

W razie czego, można potem wrócić do sandbox przez `copy .env.sandbox.backup .env`.

---

## Faza 3 — Production OAuth na komputerze Patryka (10 min, z koleżanką/adminem)

### 3.1 Zaktualizuj `.env`

Edytuj `E:\claude\mysql\kreisel\.env` — zmień **tylko** te 5 wartości:

```
QBO_CLIENT_ID=<PRODUCTION client id z 1.1>
QBO_CLIENT_SECRET=<PRODUCTION client secret z 1.1>
QBO_EWIPRO_REALM_ID=<production realm id EWI Pro z 1.2>
QBO_EWISTORE_REALM_ID=<production realm id EWI Store z 1.2>
QBO_EWIPRO_REFRESH_TOKEN=         ← WYCZYŚĆ na pusto
QBO_EWISTORE_REFRESH_TOKEN=       ← WYCZYŚĆ na pusto
QBO_ENV=production                ← KLUCZOWA zmiana z sandbox
```

Zostaw bez zmian:
- `MYSQL_*` — nadal twoje (dist)

### 3.2 OAuth dla EWI Pro

Na **twoim komputerze** (Patryk), z koleżanką/adminem EWI Pro przy klawiaturze:

```cmd
cd /d E:\claude\mysql\kreisel
node qbo_oauth_helper.js pro
```

Przeglądarka otworzy się na **produkcyjnym Intuit login screen**.

- **Koleżanka wpisuje swój login Intuit** (ten którym normalnie loguje się do QBO produkcyjnego)
- Wybiera **EWI PRO INSULATION SYSTEMS LTD** z listy companies
- Klika **Connect**
- Token zapisuje się automatycznie w `.env`

⚠️ Jeśli widzi listę kilku firm, MUSI wybrać EWI Pro. Jeśli wybierze EWI Store, dostaniemy token do złej firmy.

### 3.3 OAuth dla EWI Store

Powtórz dla store:
```cmd
node qbo_oauth_helper.js store
```
Wybiera **EWI STORE LTD**.

### 3.4 Test połączenia

```cmd
node qbo_client.js
```

Powinieneś zobaczyć **prawdziwe** dane firm (nie sandbox):
- `Company: EWI PRO INSULATION SYSTEMS LTD`
- `Country: GB`
- `MultiCurrencyEnabled: true`
- Drugi blok dla EWI Store

Jeśli widzisz „ewi pro" lub „ewi store" małymi literami → to sandbox, znaczy że `QBO_ENV=sandbox` w `.env` (popraw).

---

## Faza 4 — Pre-flight check produkcji (Patryk, 5 min)

### 4.1 Zobacz co jest w produkcji

```cmd
node qbo_inspect.js
```

Szukamy:

| W EWI Pro | Co znajdziesz |
|-----------|---------------|
| Vendor `KREISEL TECHNIKA BUDOWLANA SP. Z O.O.` (PLN) | Pewnie istnieje. Fuzzy lookup znajdzie wariant nazwy. |
| Customer `EWI STORE LTD` (GBP) | Pewnie istnieje |
| TaxCode `PVA Import 20.0%` | **Powinno być** — w sandbox było tylko `20.0% S` |
| Account `Import` lub podobne | Sprawdź jak nazywa się obecne konto importu |
| Items: `EWI-225 25KG`, `EWI-269 25KG`, ... | Sprawdź czy istnieją pod tymi nazwami |

### 4.2 Zaktualizuj account names jeśli inne niż sandbox

Jeśli produkcyjny EWI Pro ma konto importu o innej nazwie niż „Import" → zaktualizuj w `qbo_payloads.js::buildKreiselBill`:

```js
getAccountId(proClient, 'Import'),   // ← zmień nazwę jeśli inna
```

Podobnie dla store „Materials".

### 4.3 Items setup w produkcji

Jeśli któryś Item z `sku_mapping.js::EXACT_MAP` nie istnieje w produkcji:

**Opcja A** — zaktualizuj nazwy w mapowaniu pod istniejące Items (jeśli np. EWI Pro produkcyjnie używa „EWI-225 Premium Basecoat 25kg")

**Opcja B** — utwórz brakujące Items przez:
```cmd
node qbo_setup_skus.js
```
(Idempotentny — nie utworzy duplikatów, jeśli już są.)

---

## Faza 5 — Pierwszy DRY-RUN na produkcji (Patryk, 2 min)

```cmd
copy fixtures\kreisel_82_2026_v2.pdf C:\kreisel\inbox\
```

Następnie:
```cmd
node process_inbox.js
```
(bez `--post` — sam podgląd)

Sprawdź wyniki:
- ✅ TaxCode pokazuje **„REAL PVA ✓"** (zamiast „sandbox fallback")
- ✅ Pro Invoice DocNumber proponowany to **~4994** (kontynuuje EWI Pro sekwencję 4993+1)
- ✅ Subtotale matchują oryginał
- ✅ Cross-check Δ ≤ £0,50

Jeśli wszystko OK → **NIE postuj jeszcze. Najpierw upewnij się że dane wyglądają dobrze.**

---

## Faza 6 — Pierwszy realny POST na produkcji (Patryk, 5 min)

**Wybierz JEDNĄ świeżą fakturę Kreisla** (najlepiej: pojedynczy SKU, mała wartość, niski risk). Wrzuć do `C:\kreisel\inbox\`.

```cmd
node process_inbox.js --post
```

Po wystawieniu:

1. Zaloguj się do produkcyjnego **EWI Pro QBO**
2. Otwórz utworzony Bill (Kreisla) → sprawdź:
   - VAT @ 20% i -20% obie linie się pokazują (PVA mechanism)
   - Category=Import jest
   - Załączony PDF Kreisla
   - Bill no = puste (jak oryginał)
3. Otwórz Invoice (→ Store) → sprawdź:
   - Numer w ciągu (np. 4994)
   - Memo: `4.XXXX- pound rate` + `FSE-XXX/2026/EXP   DD/MM/YYYY`
   - VAT @ 20%
4. Zaloguj się do **EWI Store QBO**
5. Otwórz utworzony Bill (od EWI Pro) → sprawdź:
   - Numer Bill = numer Invoice EWI Pro
   - Category=Materials
   - Załączony PDF Invoice EWI Pro (z QBO)

Jeśli **wszystko OK** → produkcja działa. Można jechać codziennym workflow.

Jeśli **coś nie tak** → **usuń te 3 dokumenty z produkcji**, popraw kod, próbuj ponownie.

---

## Faza 7 — Przeniesienie do koleżanki (Patryk + koleżanka, 30 min)

Stan: u Patryka mamy działającą produkcyjną automatyzację. Czas przenieść.

### 7.1 Spakuj projekt

Na komputerze Patryka:

```cmd
:: spakuj cały projekt
cd /d E:\claude\mysql
tar -czf E:\kreisel_production_setup.tgz kreisel node_modules
```

Lub przez Explorer: prawym → Wyślij do → folder skompresowany ZIP.

### 7.2 Skopiuj do koleżanki

USB pendrive lub network share. Skopiuj na jej komputer do:
- `E:\claude\mysql\kreisel\`
- `E:\claude\mysql\node_modules\`
- `C:\kreisel\` (foldery wsadowe + .cmd launchery)

⚠️ Jej komputer może nie mieć dysku E:. Wtedy:
- Zmień path w skryptach (`1_INSTALACJA*.cmd`, `2_Sprawdz*.cmd`, `3_Procesuj*.cmd`) z `E:\claude\mysql\kreisel` na np. `C:\kreisel-system\kreisel`
- Lub zostań przy E: i poproś ją żeby ustawiła E:\ → mapuje folder na ten path (subst)

### 7.3 .env zawiera już produkcyjne tokeny — koleżanka NIC nie konfiguruje

`.env` po naszej Fazie 3 ma:
- ✅ Production client_id / secret
- ✅ Production realm IDs
- ✅ Production refresh tokens (świeżo wygenerowane, ważne 100 dni)
- ⚠️ MYSQL_PASSWORD — **OPCJONALNIE** zostaw lub usuń

**Jeśli koleżanka nie ma dostępu do MySQL** — wyczyść MYSQL_PASSWORD w jej .env. Pipeline będzie używać container z PDF + Magemar (zwalidowane, działa).

### 7.4 U koleżanki — odpal instalator

Dwuklik **`C:\kreisel\1_INSTALACJA_pierwsze_uruchomienie.cmd`**

Sprawdzi:
- Node.js (poprosi o instalację jeśli nie ma)
- Foldery robocze (dotworzy)
- .env (już ma!)
- Test połączenia QBO (powinno działać natychmiast — tokeny są produkcyjne)

### 7.5 Pierwsza faktura u koleżanki

Razem z nią:
1. Wrzuć JEDNĄ testową fakturę do `C:\kreisel\inbox\`
2. Dwuklik `2_Sprawdz_bez_postowania.cmd`
3. Razem zerknijcie czy dryf'tuje OK
4. Dwuklik `3_Procesuj_faktury.cmd`
5. Razem zerknijcie w QBO produkcyjnym że dokumenty są
6. Koniec — od jutra robi sama

---

## Co dzieje się z tokenami w czasie

| Co | Życie |
|----|-------|
| Production access token | 1h (auto-refresh co użycie) |
| Production refresh token | 100 dni (auto-rotate przy każdym użyciu) |

Tak długo jak koleżanka używa systemu codziennie, tokeny się odnawiają.

**Jeśli nie używa przez >100 dni** → tokeny wygasają, Patryk musi powtórzyć Fazę 3.

---

## Plan B — gdy Patryk nie ma admin access do EWI Pro/Store QBO

Jeśli Patryk nie może być przy komputerze gdy ona autoryzuje (kalendarz, urlop), opcja:

**Opcja Z — Add Patryka jako Intuit user** (długoterminowo najczystsze):
1. Admin EWI Pro → Settings → Manage Users → Add user
2. Email Patryka, rola: Standard user with full access
3. Patryk akceptuje email zaproszenia
4. Po tym Patryk ma własne loginy do produkcyjnego EWI Pro i może sam autoryzować tokeny gdy potrzeba

Polecam to zrobić rownolegle z Fazą 3 — jeden raz prosisz, służy długoterminowo.

---

## Checklist przed produkcją

- [ ] Faza 1 — Production keys w Intuit Developer skopiowane
- [ ] Faza 2 — Sandbox .env zbackupowany (.env.sandbox.backup)
- [ ] Faza 3 — Production OAuth obie firmy, .env wypełniony
- [ ] Faza 4 — `qbo_inspect.js` pokazał istniejące vendors/customers/PVA
- [ ] Faza 4 — Items i Accounts produkcyjne sprawdzone, mapping zaktualizowany jeśli trzeba
- [ ] Faza 5 — DRY-RUN przeszedł, REAL PVA pokazuje się
- [ ] Faza 6 — Pierwszy real POST zaakceptowany wizualnie w QBO UI
- [ ] Faza 7 — Skopiowane do koleżanki, instalator przeszedł
- [ ] Faza 7 — Razem z koleżanką pierwsza faktura przeszła end-to-end u niej
- [ ] (Opcjonalnie) Plan B — Patryk dodany jako Intuit user w EWI Pro i Store

---

## Po migracji

**Patryk's PC zostaje jako:**
- Backup / dev environment (jeśli coś trzeba naprawić, debugować)
- Snapshot products: raz w miesiącu `node snapshot_products.js` żeby odświeżyć `ewi_pro_products.json` (nowe SKU z systemu)
- Refresh tokens: co ~80 dni warto odpalić `qbo_client.js` żeby zrotować token (zanim wygaśnie)

**Koleżanki PC:**
- Codzienna rutyna: download Magemar + 2_Sprawdz + 3_Procesuj
- Jeśli `NIEZNANE PRODUKTY` pojawi się → fotka błędu lub _BLAD.txt → wysłać Patrykowi → on dodaje SKU mapping → wysyła zaktualizowany `sku_mapping.js` → ona kopiuje → działa
