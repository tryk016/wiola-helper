---
title: Troubleshooting
layout: default
---

# Troubleshooting

## Instalacja

### `setup_wiola.cmd` kończy się błędem

| Komunikat | Rozwiązanie |
|-----------|-------------|
| `BLAD: Nie udalo sie pobrac z GitHub` | Brak internetu lub GitHub niedostępny. Sprawdź `ping github.com`, sprawdź firewall, spróbuj ponownie |
| `BLAD: Brak electron.exe` po npm install | `npm install` zawiódł w `wiola-helper/`. Sprawdź czy Node 22 LTS się zainstalował (`C:\kreisel\nodejs\node.exe --version`). Uruchom setup_wiola.cmd ponownie — idempotentny |
| `Build sie nie powiodl — brak dist\index.html` | Vite build failed. Sprawdź czy node_modules zostało w pełni rozpakowane. Ostatecznie: usuń `C:\kreisel\wiola-helper\node_modules` i uruchom setup ponownie |
| Browser blokuje pobranie `.cmd` | Klik "Zachowaj mimo to" lub prawym → Właściwości → "Odblokuj" |
| UAC blokuje uruchomienie | Klik "Tak" przy SmartScreen. Skrypt nie wymaga admin, ale Windows traktuje pliki z internetu podejrzliwie |

### Skrót pulpitu pokazuje czarną konsolę

Stary instalator (commit `50cbb92`) tworzył skrót do `.cmd` zamiast bezpośrednio do `electron.exe`. Uruchom `C:\kreisel\update_wiola.cmd` —
na końcu usuwa stare skróty i tworzy nowe wskazujące bezpośrednio na `electron.exe` (bez CMD wrappera).

---

## OAuth Login

### "Please enter a unique valid redirect URI" w Intuit

Production wymaga HTTPS, sandbox akceptuje HTTP. Sprawdź zakładkę:

**Sandbox/Development tab** w Intuit:
- ✓ `http://localhost:3000/callback`

**Production tab** w Intuit:
- ✓ `https://tryk016.github.io/wiola-helper/oauth-callback.html`
- ✗ `http://localhost:3000/callback` ← będzie odrzucone

### "Brak QBO_CLIENT_ID_PRODUCTION w .env" w aplikacji

Po migracji do dual-credentials musisz mieć obie pary kluczy. Dodaj ręcznie w `.env` (albo w aplikacji: Ustawienia → QBO Credentials):
```
QBO_CLIENT_ID_SANDBOX=...
QBO_CLIENT_SECRET_SANDBOX=...
QBO_CLIENT_ID_PRODUCTION=...
QBO_CLIENT_SECRET_PRODUCTION=...
```

Restart aplikacji.

### "Wymiana code → token nie powiodła się: invalid_grant"

Najczęstsze: `redirect_uri` w aplikacji nie zgadza się z tym co Intuit oczekuje. Sprawdź że dla aktualnego `QBO_ENV` masz dokładnie ten URL dodany w odpowiedniej zakładce Intuit.

Inne przyczyny:
- code użyty więcej niż raz (one-time use)
- code wygasł (~10 min)
- Client ID/Secret z innego env niż aktualnie wybrane

### "Object has been destroyed" przy logowaniu

Naprawione w komicie `e69f6e9`. Jeśli wciąż widzisz — zaktualizuj aplikację (Settings → 🔄 Aktualizacje → Aktualizuj teraz).

---

## Pipeline

### Faktura wisi w `parsing`

Zazwyczaj LLM timeout albo crash. Zamknij aplikację (X), otwórz ponownie. Przy starcie `queue.ts load()` automatycznie przepisuje hung `parsing`/`processing` na `failed` z komunikatem do retry.

Jeśli ciągle wisi po retry — log do Patryka. Możliwy timeout na Anthropic API > 2 min.

### "QBO 400: Required parameter Line.Amount is missing"

Naprawione w `qbo_payloads.js` (commit `6769947`). Category Import line ma teraz `Amount: 0` zamiast `null`. Update aplikacji.

### "Resolver: no_data"

Faktura nie ma kontenera w PDF AND nie ma issue_date. Bardzo rzadkie. Otwórz PDF ręcznie, sprawdź czy nie jest pusty lub uszkodzony. Może to faktura korygująca / proforma która ominie automatyzację.

### Faktura idzie do Wstrzymanych mimo że ma kontener

Sprawdź log — pewnie Magemar.xlsx jest stary. Pobierz nowy z SharePoint i zapisz do `C:\kreisel\magemar.xlsx`. Klik "🔍 Sprawdź teraz" w sekcji Oczekujące.

### Confirm Transport pokazuje placeholder z MySQL

To OK. Magazyn wpisał numer faktury w pole `truck_reg_number` jako tymczasowy placeholder. Wpisz prawdziwy numer auta jeśli wiesz, albo zostaw puste i podaj tylko HMRC month.

---

## Parser

### LLM zwraca dziwne mapowanie SKU

Sprawdź log — `parser_mode` w `_meta`. Jeśli `vision` (skan PDF), accuracy może spaść. Przeciągnij PDF text-based jeśli możesz.

Jeśli text-based też daje dziwne wyniki — Patryk może dodać dodatkowe przykłady do `SYSTEM_PROMPT` w `parse_kreisel_llm.js`.

### "LLM timeout 120s"

Hard timeout w `parse_kreisel_llm.js`. Najczęściej Anthropic API ma chwilowe problemy. Klik 🔄 retry. Jeśli ciągle — sprawdź status Anthropic na status.anthropic.com.

### "Rejected non-product lines: payment-term-or-summary"

Wszystko OK — to safety filter usuwa nie-produktowe linie ("Przelew-90", "Razem do zapłaty", "INCOTERMS"). Jeśli zmniejszył ci legalne linie produktowe — log do Patryka.

---

## MySQL

### "MySQL not configured" lub timeout

Sprawdź `.env`:
```
MYSQL_HOST=10.1.20.15
MYSQL_USER=pbaranai
MYSQL_PASSWORD='...'
```

Pendrive Wioli musi mieć tę samą konfigurację. Hasło z special chars (np. `$`) musi być w single-quotes.

Sprawdź czy maszyna Wioli widzi `10.1.20.15:3306` — `Test-NetConnection 10.1.20.15 -Port 3306` w PowerShell.

Jeśli VPN lub firewall blokuje — pipeline lecieć dalej z `BRANCH A` (no MySQL), ale truck-pending faktury nie znajdą POD. Container faktury OK.

### Faktura "nie ma w MySQL" mimo że jest

Możliwe że pole `invoice_number_supplier` ma inny format. Sprawdź ręcznie:

```sql
SELECT id, invoice_number_supplier
FROM purchase_orders_deliveries
WHERE supplier_id=2884
  AND invoice_number_supplier LIKE '%195%2026%';
```

Aktualnie nasze query szuka z prefiksem `FSE-XXX/YYYY/%` OR `XXX/YYYY/%`. Jeśli magazyn wpisał coś egzotycznego (np. `EXP-195`) — log do Patryka, rozszerzymy regex.

---

## Aplikacja nie chce się zaktualizować

### "Sprawdź aktualizacje" pokazuje błąd

Sprawdź internet, sprawdź `ping api.github.com`. Jeśli proxy / firewall blokuje GitHub API → użyj manualnego update:

```powershell
cd C:\kreisel
.\update_wiola.cmd
```

### "Aktualizuj teraz" zamknęło aplikację ale nie otwarło z powrotem

Coś poszło nie tak w `update_wiola.ps1`. Sprawdź log:
- `C:\kreisel\log.txt` (jeśli zostało napisane)
- W `Get-Process electron` — sprawdź czy proces wisi

Manual fallback:
```powershell
cd C:\kreisel
.\update_wiola.cmd
```

Jeśli ten też nie ruszy — pobierz najnowszy `setup_wiola.cmd` i zrób reinstal czysty (zachowując `.env` i `magemar.xlsx`).

---

## QBO posty są wolniejsze niż się spodziewałem

Sprawdź:
1. **Anti-automation delay** w Settings — domyślnie 4-10 min między fakturami. Możesz tymczasowo wyłączyć (0/0)
2. **LLM parse mode**: skan PDF = ~40s/faktura. Text PDF = ~7s/faktura
3. **Network**: każdy QBO POST ~1-3s, kontener Magemar lookup ~0.5s, MySQL lookup ~0.2s

Łącznie dla text PDF + delay: ~10s pipeline + 4-10 min delay = ~7 min średnio na fakturę po pierwszej.

---

## Gdzie szukać informacji diagnostycznych

| Plik | Co tam jest |
|------|-------------|
| `C:\kreisel\log.txt` | Wszystkie operacje, intuit_tid response IDs, błędy |
| `%APPDATA%\Wiola Helper\state\queue.json` | Aktualny stan kolejki (możesz otworzyć w Notatniku) |
| `%APPDATA%\Wiola Helper\state\history.json` | Wszystkie zakończone faktury (do 1000 ostatnich) |
| `%APPDATA%\Wiola Helper\state\pending.json` | Wstrzymane faktury |
| `C:\kreisel\system\hmrc_cache\` | Zcache'owane kursy HMRC per miesiąc |
| `C:\kreisel\.version` | Aktualny commit SHA (do update check) |
| Settings → 🆘 Pomoc → "Otwórz folder z logami" | Skrót do log.txt w Explorer |

---

## Awaryjny reset

Jeśli wszystko jest popsute i nic nie pomaga:

```powershell
# 1. Backup wszystkiego co prywatne
$bak = "C:\users\$env:USERNAME\Desktop\wiola_backup_$(Get-Date -Format yyyy-MM-dd)"
mkdir $bak
copy "C:\kreisel\system\.env" "$bak\.env"
copy "C:\kreisel\magemar.xlsx" "$bak\magemar.xlsx" -ErrorAction SilentlyContinue
copy "$env:APPDATA\Wiola Helper\state\*.json" "$bak\" -ErrorAction SilentlyContinue

# 2. Czysta deinstalacja
Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
rmdir /s /q C:\kreisel
rmdir /s /q "$env:APPDATA\Wiola Helper"

# 3. Pobierz nowy setup_wiola.cmd, uruchom
# (file picker wybierze .env z $bak)

# 4. Po setup — skopiuj magemar i state z backup
copy "$bak\magemar.xlsx" "C:\kreisel\magemar.xlsx" -ErrorAction SilentlyContinue
copy "$bak\*.json" "$env:APPDATA\Wiola Helper\state\" -ErrorAction SilentlyContinue
```

Powinno zacząć działać od zera z zachowaną kolejką, historią i credentials.
