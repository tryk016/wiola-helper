# Setup na nowy komputer

> Workflow Kreisel → EWI Pro → EWI Store. Działa na Windows. Zajmuje ok. 30 minut.

---

## 1. Wymagania (jednorazowo)

| Co | Skąd | Po co |
|----|------|-------|
| **Node.js v20+** | https://nodejs.org/ — pobierz LTS, zainstaluj kliknij-dalej | uruchamia wszystkie skrypty |
| **Outlook desktop** (opcjonalnie) | jeśli już masz w firmie | tylko jeśli chce się autoload PDF z maila — bez tego ręcznie pobierasz |
| **Dostęp do MySQL `dist`** | `10.1.20.15:3306`, user `pbaranai` + hasło | resolver szukania daty importu, mapowania Kreisel→FSE |
| **Dostęp do SharePoint Magemar** | https://cmacgmgroup.sharepoint.com/sites/GRP-CSPGDYNIA/... | manualny download xlsx codziennie rano |
| **Konto Intuit Developer** | https://developer.intuit.com/ — własne lub współdzielone | trzyma sandbox + produkcyjne tokeny |

---

## 2. Skopiuj projekt

```cmd
:: na nowym komputerze, jeden raz:
mkdir E:\claude\mysql
xcopy /E /I /Y \\<source>\claude\mysql\kreisel E:\claude\mysql\kreisel
xcopy /E /I /Y \\<source>\claude\mysql\node_modules E:\claude\mysql\node_modules
```

Albo `git clone` jeśli kiedyś wrzucimy do repo.

---

## 3. Zainstaluj zależności

```cmd
cd /d E:\claude\mysql\kreisel
npm install
```

Pobierze: `pdf-parse`, `axios`, `dotenv`, `intuit-oauth`, `node-quickbooks`, `tesseract.js`, `form-data`. Czas ok. 2 min.

---

## 4. Uzupełnij `.env`

Edytuj `E:\claude\mysql\kreisel\.env`. Potrzebne:

```
QBO_CLIENT_ID=<z Intuit Developer Keys&Credentials>
QBO_CLIENT_SECRET=<jak wyżej>
QBO_EWIPRO_REALM_ID=<Company ID — sandbox PRO>
QBO_EWISTORE_REALM_ID=<Company ID — sandbox STORE>
QBO_EWIPRO_REFRESH_TOKEN=   ← puste, wypełni się w kroku 5
QBO_EWISTORE_REFRESH_TOKEN= ← puste, wypełni się w kroku 5
QBO_ENV=sandbox
MYSQL_HOST=10.1.20.15
MYSQL_PORT=3306
MYSQL_DB=dist
MYSQL_USER=pbaranai
MYSQL_PASSWORD=<hasło>
```

⚠️ Plik `.env` zawiera sekrety. NIE wysyłaj na maila, NIE wrzucaj do repo.

---

## 5. Pobierz tokeny OAuth do QBO

W Intuit Developer → Twoja apka → **Sandbox keys → Redirect URIs → dodaj `http://localhost:3000/callback`** → Save.

Potem w terminalu:
```cmd
cd /d E:\claude\mysql\kreisel
node qbo_oauth_helper.js pro
```
Otworzy przeglądarkę → zaloguj się → wybierz **EWI Pro Sandbox** → Connect → token zapisze się w `.env`.

Powtórz:
```cmd
node qbo_oauth_helper.js store
```
Wybierz **EWI Store Sandbox**.

Test że działa:
```cmd
node qbo_client.js
```
Powinno wypisać oba realmy, GBP home, MultiCurrencyEnabled: true.

---

## 6. Jednorazowy setup sandbox

Tworzy: Kreisel vendor, EWI Store customer, EWI Pro vendor, Items per SKU, Terms Net 90, Accounts Import (Pro) + Materials (Store).

```cmd
node qbo_setup_entities.js
node qbo_setup_skus.js
node qbo_setup_store_materials.js
node qbo_update_items_to_import.js
```

(Wszystkie idempotentne — można odpalać wielokrotnie, nic nie psuje.)

---

## 7. Codzienny workflow

### A. Rano — pobierz aktualny Magemar Excel

1. Otwórz https://cmacgmgroup.sharepoint.com/:x:/r/sites/GRP-CSPGDYNIA/_layouts/15/Doc.aspx?sourcedoc=%7B66C73C07-BF78-4A5F-8B07-498787E443BB%7D&file=Ewi%20Pro%20-%20Magemar%20-%20CMA%20SSL.xlsx
2. File → Save As → **Download a copy**
3. Zapisz jako `C:\kreisel\magemar.xlsx` (nadpisz)

Jeśli plik starszy niż 24h → pipeline wypisze warning.

### B. Dla każdej nowej faktury Kreisla

1. Zapisz PDF Kreisla (polska wersja „Faktura eksportowa") do `E:\<gdziekolwiek>\<plik>.pdf`
2. Dry-run (zobacz co się posta, bez postowania):
```cmd
node qbo_post_kreisel.js "E:\<sciezka>\faktura.pdf"
```
3. Jeśli wygląda OK — zatwierdź:
```cmd
node qbo_post_kreisel.js "E:\<sciezka>\faktura.pdf" --post
```

Pipeline:
- OCR Kreisel PDF → ekstrakcja `{invoice_no, lines, totals}`
- MySQL `dist.purchase_orders_deliveries` → znajdź kontener
- Magemar xlsx → ATA Tilbury → miesiąc HMRC (lub fallback +13 dni gdy kontener jeszcze nie w Magemar)
- HMRC API → stawka PLN/£
- Zbuduj 3 dokumenty w QBO: Bill PLN (Pro), Invoice GBP (Pro), Bill GBP (Store)
- Załączniki: Kreisel PDF do Pro Bill, EWI Pro Invoice PDF do Store Bill

---

## 8. Przejście na produkcję

Jak skoleżanka zatwierdzi sandbox:

1. W `.env`: `QBO_ENV=production`
2. Wygeneruj produkcyjne tokeny: `node qbo_oauth_helper.js pro` / `store` (zaloguj się do produkcyjnego QBO tym razem)
3. Sprawdź że produkcyjne EWI Pro już ma Kreisel jako Vendor + EWI Store jako Customer + EWI Pro w EWI Store jako Vendor (pewnie tak, ale zweryfikuj: `node qbo_inspect.js`).
4. **Produkcja JEST inna** od sandboxa:
   - PVA Import 20.0% tax code **istnieje** w produkcji — kod auto-wykryje (zobaczysz „REAL PVA ✓" zamiast „sandbox fallback")
   - Pro Invoice DocNumber zacznie się od `max(istniejących)+1` — na produkcji to pewnie 4994 lub coś (sekwencja kontynuowana)
   - Names match — fuzzy lookup (LIKE '%KREISEL%' + PLN) złapie production wariant nazwy

5. Pierwszy test na produkcji w **DRY-RUN tylko** — sprawdź na jednej fakturze że payload wygląda OK, NIE postuj.
6. Pojedynczy POST kontrolny.
7. Routine use.

---

## 9. Co jak coś nie działa

| Problem | Sprawdź |
|---------|---------|
| `QBO_CLIENT_ID missing` | `.env` ma puste pola — uzupełnij |
| `401 Unauthorized` | Refresh token wygasł (>100 dni) — odpal ponownie `qbo_oauth_helper.js` |
| `Magemar Excel not found` | Brak `C:\kreisel\magemar.xlsx` — pobierz z SharePoint |
| `container_not_in_magemar` | Kontener jeszcze nie dotarł — pipeline daje provisional ETA z +13 dni |
| `Term not found: Net 90` | Pominięty step 6 — odpal `qbo_setup_entities.js` |
| `UNMAPPED LINES` | Nowy SKU w fakturze — dodaj do `parse_kreisel_pl.js::mapSku` |
| Tesseract pierwszy run wolny | Normalne — pobiera modele OCR (~10MB), do `tesseract_cache/`. Drugi run szybki. |

---

## 10. Pliki które warto znać

```
E:\claude\mysql\kreisel\
├── .env                        ← sekrety (NIE udostępniać)
├── qbo_post_kreisel.js         ← GŁÓWNA KOMENDA — dry-run / --post
├── parse_kreisel_pl.js         ← parser polskiej Faktury eksportowej + mapowanie SKU
├── resolve_import.js           ← MySQL + Magemar → miesiąc HMRC
├── hmrc_rate.js                ← API HMRC z cache
├── qbo_payloads.js             ← buduje payloady Bill/Invoice
├── qbo_client.js               ← REST client z auto-refresh tokenów
├── qbo_setup_entities.js       ← jednorazowo, tworzy vendor/customer
├── qbo_setup_skus.js           ← jednorazowo, tworzy Items per SKU
├── qbo_inspect.js              ← debug — pokazuje vendors, accounts itd.
└── (C:\kreisel\magemar.xlsx)   ← ręcznie pobierane z SharePoint, w głównym folderze koleżanki
├── hmrc_cache/                 ← auto-cache stawek (jeden plik per miesiąc)
├── tesseract_cache/            ← auto-cache modeli OCR (~10MB jednorazowo)
└── fixtures/                   ← testowe pdfy + ground truth
```
