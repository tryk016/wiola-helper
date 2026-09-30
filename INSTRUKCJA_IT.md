# Wiola Helper — instrukcja dla IT

Jak pobrać, zainstalować, zaktualizować i uruchomić Wiola Helper na komputerze z Windows.

Wiola Helper to aplikacja okienkowa (Electron) do księgowania faktur Kreisel w QuickBooks Online
(EWI Pro + EWI Store). Kod jest w **prywatnym** repozytorium GitHub `tryk016/wiola-helper` —
instalator pobiera go sam, tokenem zapisanym w pliku `.env`, więc **konto GitHub nie jest potrzebne**.
Na komputerze wszystko ląduje w `C:\kreisel\`.

---

## 1. Wymagania

- Windows 10 lub 11, konto zwykłego użytkownika (**admin niepotrzebny**).
- Ok. 1 GB wolnego miejsca na dysku `C:`.
- Internet z dostępem do: `api.github.com`, `codeload.github.com`, `nodejs.org`, `registry.npmjs.org`,
  `*.intuit.com`, `api.anthropic.com`.
- Dostęp do firmowego serwera MySQL (port 3306, adres jest w pliku `.env`) — z sieci biurowej lub przez VPN.
- Node.js **nie** musi być zainstalowany — instalator pobiera własną, przenośną wersję do `C:\kreisel\nodejs\`.

## 2. Co dostajesz od Patryka

Pendrive albo paczka ZIP (`Wiola-Helper-IT-*.zip`) z plikami:

| Plik | Po co |
|---|---|
| `setup_wiola.cmd` + `setup_wiola.ps1` | instalator (muszą leżeć obok siebie) |
| `update_wiola.ps1` | do jednorazowej podmiany na starszych instalacjach (punkt 4) |
| `INSTRUKCJA_IT.md` | ta instrukcja |

**Osobno** (pendrive albo inny bezpieczny kanał — nigdy w ZIP-ie wysłanym mailem):

| Plik | Po co |
|---|---|
| `.env` | klucze API, hasła i token GitHub (`GITHUB_TOKEN=...`) — **poufny** |

Plus loginy do QuickBooks Online (EWI Pro i EWI Store) dla osoby, która będzie korzystać z aplikacji.

`.env` **nie wysyłaj mailem, nie wrzucaj do chmury ani do repozytorium**. Po instalacji oddaj pendrive.

---

## 3. Pierwsza instalacja (nowy komputer, ok. 10 min)

1. Rozpakuj ZIP (albo włóż pendrive) i włóż pendrive z `.env`.
2. Kliknij prawym na `setup_wiola.cmd` → **Otwórz**
   (jeśli SmartScreen ostrzeże → *Więcej informacji → Uruchom mimo to*).
3. Krok 2 z 9: okno **„Wybierz plik .env z pendrive”** → wskaż `.env` → **OK**.
   (Jeśli w `.env` nie ma tokena GitHub, skrypt poprosi o wklejenie go w czarnym oknie.)
4. Dalej samo: pobranie kodu z GitHuba, Node.js, instalacja bibliotek, budowanie aplikacji.
5. Na końcu: **GOTOWE!** i skrót **„Wiola Helper”** na pulpicie oraz w Menu Start.
6. Wyjmij pendrive — `.env` jest już skopiowany do `C:\kreisel\system\.env`. Rozpakowany folder z ZIP-a można usunąć.

Na komputerze, na którym Wiola Helper **już działa**, nie instaluj od nowa — użyj aktualizacji (punkt 4).
Instalator nadpisałby `.env` wersją z pendrive i trzeba by ponownie logować się do QuickBooks.

## 4. Aktualizacja istniejącej instalacji (ok. 2–5 min)

### Jednorazowo: instalacje sprzed 30.09.2026 (np. obecny komputer Wioli)

Repozytorium jest teraz prywatne, a stary skrypt aktualizacji nie zna tokena, więc raz trzeba go podmienić:

1. Zamknij Wiola Helper.
2. Skopiuj `update_wiola.ps1` (z ZIP-a albo pendrive'a) do `C:\kreisel\` (zastąp istniejący plik).
3. Dwuklik `C:\kreisel\update_wiola.cmd`.
4. Skrypt zapyta o **token GitHub** → wklej go (linijka `GITHUB_TOKEN=` z `.env` na pendrive, bez `GITHUB_TOKEN=`)
   → Enter. Token zapisze się w `C:\kreisel\system\.env`.
5. Po aktualizacji aplikacja uruchomi się sama. Od teraz działają zwykłe aktualizacje (niżej).

### Kolejne aktualizacje

Dowolny z dwóch sposobów:

- **Z aplikacji:** Ustawienia (⚙️ w prawym dolnym rogu) → **🔄 Aktualizacje** → **🔍 Sprawdź aktualizacje**
  → **⬇ Aktualizuj teraz**. Aplikacja zamknie się, zaktualizuje i uruchomi ponownie.
- **Ręcznie:** zamknij Wiola Helper → dwuklik `C:\kreisel\update_wiola.cmd`.

Aktualizacja pobiera najnowszy kod z gałęzi `main`, przebudowuje aplikację i **zachowuje** `.env`,
`magemar.xlsx`, historię faktur, foldery robocze i Node.js.

### Gdy token GitHub wygaśnie

„Sprawdź aktualizacje” pokaże *„GitHub 401/404 — brak dostępu do repozytorium”*. Patryk da nowy token →
Ustawienia → **🔑 Token GitHub** → wklej → **Zapisz** (u góry ekranu).

## 5. Uruchamianie

- Normalnie: **dwuklik „Wiola Helper” na pulpicie**.
- Z konsolą (widać logi, przydatne przy problemach): `C:\kreisel\Wiola Helper.cmd`.
- Ręcznie z wiersza poleceń:
  ```
  cd /d C:\kreisel\wiola-helper
  node_modules\electron\dist\electron.exe .
  ```

## 6. Pierwsze uruchomienie — logowanie do QuickBooks

1. Uruchom aplikację → **Ustawienia** (⚙️).
2. U góry sprawdź środowisko: dla pracy na prawdziwych firmach musi być **PRODUCTION**
   (sekcja „QBO Environment” → `production` → **Zapisz** → uruchom aplikację ponownie).
3. Sekcja **🔐 Logowanie do QBO** → **EWI Pro** → zaloguj się w oknie Intuit → wybierz firmę EWI Pro → **Connect**.
4. To samo dla **EWI Store**.
5. Oba wiersze powinny pokazać **✓ Połączony**.

Tokeny QuickBooks wygasają po ok. 100 dniach nieużywania — wtedy powtórz punkty 3–4.

## 7. Sprawdzenie, że działa (ok. 2 min)

- W stopce aplikacji kliknij **📦 Produkty Pro → Store** → po kilku sekundach powinna pojawić się lista
  produktów z EWI Pro (domyślnie tylko te, których brakuje w EWI Store). **Nic nie wysyłaj** — tylko sprawdź,
  że lista się ładuje; zamknij przyciskiem **Zamknij ✕**.
- W stopce kliknij **📜 Log** — nie powinno być świeżych czerwonych błędów.

---

## 8. Gdzie co jest

| Ścieżka | Co to |
|---|---|
| `C:\kreisel\system\.env` | klucze i hasła (poufne) |
| `C:\kreisel\wiola-helper\` | aplikacja okienkowa |
| `C:\kreisel\system\` | logika (parsowanie faktur, QuickBooks, MySQL) |
| `C:\kreisel\nodejs\` | przenośny Node.js |
| `C:\kreisel\log.txt` | log aplikacji |
| `C:\kreisel\magemar.xlsx` | codzienny plik Magemar |
| `%APPDATA%\wiola-helper\state\` | kolejka, historia, preferencje |

## 9. Najczęstsze problemy

| Objaw | Co zrobić |
|---|---|
| Instalator / aktualizacja: „GitHub odrzucil token (HTTP 401/404)” | Token GitHub wygasł albo jest błędny — poproś Patryka o nowy (instalacja: nowy `.env`; aktualizacja: Ustawienia → 🔑 Token GitHub). |
| Instalator: „Nie udalo sie pobrac z GitHub” (inny błąd) / npm install failed | Sprawdź internet / proxy / firewall dla adresów z punktu 1 i uruchom ponownie. |
| Instalator: „Build sie nie powiodl” | Uruchom ponownie `setup_wiola.cmd`; jeśli się powtarza — zrzut ekranu do Patryka. |
| Aplikacja: czerwone QBO w pasku stanu / „Token QBO wygasł” | Ustawienia → Logowanie do QBO → zaloguj EWI Pro i EWI Store ponownie. |
| Błędy MySQL / „ECONNREFUSED” / timeout | Komputer nie widzi serwera MySQL — sprawdź sieć firmową lub VPN. |
| Aktualizacja: „Nie udalo sie zamknac Wioli” | Zamknij aplikację ręcznie (także w Menedżerze zadań proces `electron.exe`) i uruchom aktualizację ponownie. |
| Brak skrótu na pulpicie | Uruchom `C:\kreisel\update_wiola.cmd` — odtworzy skróty. |

Kontakt: Patryk Baran · patrick.baran@ewistore.co.uk
