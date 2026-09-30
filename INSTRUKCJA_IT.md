# Wiola Helper — instrukcja dla IT

Jak pobrać, zainstalować, zaktualizować i uruchomić Wiola Helper na komputerze z Windows.

Wiola Helper to aplikacja okienkowa (Electron) do księgowania faktur Kreisel w QuickBooks Online
(EWI Pro + EWI Store). Kod jest w tym repozytorium; na komputerze wszystko ląduje w `C:\kreisel\`.

---

## 1. Wymagania

- Windows 10 lub 11, konto zwykłego użytkownika (**admin niepotrzebny**).
- Ok. 1 GB wolnego miejsca na dysku `C:`.
- Internet z dostępem do: `github.com`, `api.github.com`, `nodejs.org`, `registry.npmjs.org`,
  `*.intuit.com`, `api.anthropic.com`.
- Dostęp do firmowego serwera MySQL (port 3306, adres jest w pliku `.env`) — z sieci biurowej lub przez VPN.
- Node.js **nie** musi być zainstalowany — instalator pobiera własną, przenośną wersję do `C:\kreisel\nodejs\`.

## 2. Co dostajesz od Patryka

- Plik **`.env`** (na pendrive). Zawiera klucze API i hasła — **nie wysyłaj go mailem, nie wrzucaj do chmury
  ani do repozytorium**. Po instalacji oddaj pendrive.
- Loginy do QuickBooks Online (EWI Pro i EWI Store) dla osoby, która będzie korzystać z aplikacji.

---

## 3. Pierwsza instalacja (nowy komputer, ok. 10 min)

1. Włóż pendrive z plikiem `.env`.
2. Otwórz <https://github.com/tryk016/wiola-helper> → zielony przycisk **Code → Download ZIP**.
3. Rozpakuj ZIP gdziekolwiek (np. do *Pobrane*) — **nie** do `C:\kreisel`.
   Potrzebne są dwa pliki leżące obok siebie: `setup_wiola.cmd` i `setup_wiola.ps1`
   (sam `setup_wiola.cmd` bez `.ps1` nie zadziała).
4. W rozpakowanym folderze kliknij prawym na `setup_wiola.cmd` → **Otwórz**
   (jeśli SmartScreen ostrzeże → *Więcej informacji → Uruchom mimo to*).
   Skrypt sam pobierze aktualny kod do `C:\kreisel\`; rozpakowany folder można potem usunąć.
5. Czarne okno przejdzie przez 9 kroków: pobranie kodu z GitHuba, Node.js, instalacja bibliotek, budowanie aplikacji.
6. W kroku 7 pojawi się okno **„Wybierz plik .env z pendrive”** → wskaż `.env` na pendrive → **OK**.
7. Na końcu: **GOTOWE!** i skrót **„Wiola Helper”** na pulpicie oraz w Menu Start.
8. Wyjmij pendrive — `.env` jest już skopiowany do `C:\kreisel\system\.env`.

Jeśli w `C:\kreisel\system` jest już stara instalacja, skrypt zapyta, czy nadpisać (`t` = tak).
Plik `.env` i `magemar.xlsx` zostaną zachowane.

## 4. Aktualizacja istniejącej instalacji (ok. 2–5 min)

Dowolny z dwóch sposobów:

- **Z aplikacji:** Ustawienia (⚙️ w prawym dolnym rogu) → **🔄 Aktualizacje** → **🔍 Sprawdź aktualizacje**
  → **⬇ Aktualizuj teraz**. Aplikacja zamknie się, zaktualizuje i uruchomi ponownie.
- **Ręcznie:** zamknij Wiola Helper → dwuklik `C:\kreisel\update_wiola.cmd`.

Aktualizacja pobiera najnowszy kod z gałęzi `main`, przebudowuje aplikację i **zachowuje** `.env`,
`magemar.xlsx`, historię faktur, foldery robocze i Node.js.

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
| Instalator: „Nie udalo sie pobrac z GitHub” / npm install failed | Sprawdź internet / proxy / firewall dla adresów z punktu 1 i uruchom ponownie. |
| Instalator: „Build sie nie powiodl” | Uruchom ponownie `setup_wiola.cmd`; jeśli się powtarza — zrzut ekranu do Patryka. |
| Aplikacja: czerwone QBO w pasku stanu / „Token QBO wygasł” | Ustawienia → Logowanie do QBO → zaloguj EWI Pro i EWI Store ponownie. |
| Błędy MySQL / „ECONNREFUSED” / timeout | Komputer nie widzi serwera MySQL — sprawdź sieć firmową lub VPN. |
| Aktualizacja: „Nie udalo sie zamknac Wioli” | Zamknij aplikację ręcznie (także w Menedżerze zadań proces `electron.exe`) i uruchom aktualizację ponownie. |
| Brak skrótu na pulpicie | Uruchom `C:\kreisel\update_wiola.cmd` — odtworzy skróty. |

Kontakt: Patryk Baran · patrick.baran@ewistore.co.uk
