---
title: Instalacja
layout: default
---

# Instalacja Wiola Helper

> Kompletny proces zerowy → działająca aplikacja u Wioli.

---

## 📋 KROK 0: Twoja checklista PRZED wizytą u Wioli

### A) `.env` u Ciebie

Otwórz `C:\kreisel\system\.env`. Musi mieć obie pary kluczy QBO (po migracji dual-credentials):

```env
QBO_ENV=production
QBO_CLIENT_ID_SANDBOX=<sandbox Client ID z Intuit Developer>
QBO_CLIENT_SECRET_SANDBOX=<sandbox Client Secret>
QBO_CLIENT_ID_PRODUCTION=<production Client ID z Intuit Developer>
QBO_CLIENT_SECRET_PRODUCTION=<production Client Secret>
ANTHROPIC_API_KEY=sk-ant-...
MYSQL_HOST=10.1.20.15
MYSQL_PORT=3306
MYSQL_DB=dist
MYSQL_USER=pbaranai
MYSQL_PASSWORD='<password>'
```

Jeśli jeszcze nie migrowałeś — uruchom `node C:\kreisel\system\migrate_env.js`.

### B) Intuit Developer

https://developer.intuit.com → twoja apka → **Keys & OAuth**:

**Tab "Development" (sandbox)**:
- Redirect URI: `http://localhost:3000/callback` ✓

**Tab "Production"**:
- Redirect URI: `https://tryk016.github.io/wiola-helper/oauth-callback.html` ✓
- **NIE** `http://localhost:3000/callback` (production wymaga HTTPS)

Sprawdź też że `https://tryk016.github.io/wiola-helper/oauth-callback.html` działa w przeglądarce (powinien pokazać "Autoryzacja zakończona").

### C) Pendrive

**1.** Skopiuj `C:\kreisel\system\.env` na pendrive jako `\.env` (np. `F:\.env`).

**2.** Edytuj `F:\.env` w Notatniku — **wyczyść 4 linijki** (Wiola loguje się świeżo, żeby refresh tokeny się nie konfliktowały z Twoimi):
```
QBO_EWIPRO_REALM_ID=
QBO_EWISTORE_REALM_ID=
QBO_EWIPRO_REFRESH_TOKEN=
QBO_EWISTORE_REFRESH_TOKEN=
```

Resztę (Client ID/Secret dla obu envs, ANTHROPIC, MYSQL) zostaw bez zmian.

**3.** Tylko jeśli repo jest prywatne — dopisz token GitHub (jak go zrobić: [Konfiguracja .env → `GITHUB_TOKEN`](env-config.html)):
```
GITHUB_TOKEN=github_pat_...
```

**4.** Skopiuj na pendrive z `C:\kreisel\`: `setup_wiola.cmd`, `setup_wiola.ps1` (muszą leżeć obok siebie), `INSTRUKCJA_IT.md`.

### D) Zapisz osobno (nie na pendrive!)

- Login + hasło Wioli do **produkcyjnego** QBO EWI Pro
- Login + hasło Wioli do **produkcyjnego** QBO EWI Store

---

## 💻 KROK 1: Instalacja u Wioli (~10 min)

**1.** Wiola wkłada pendrive.

**2.** Na pendrive: **prawym na `setup_wiola.cmd` → "Otwórz"** (admin nie potrzebny). Akceptuje SmartScreen jeśli wyskoczy.

**3.** Czarne okno:
```
[1/9] Tworzenie folderu C:\kreisel        OK
[2/9] Wskaz plik .env z pendrive ⬅
```

**4.** Wyskakuje **okno wyboru pliku** "Wybierz plik .env z pendrive":
- Klik pendrive (F: lub inna litera)
- Wybierz **.env**
- Klik **OK**

(Repo prywatne i brak `GITHUB_TOKEN` w `.env` → skrypt poprosi o wklejenie tokena.)

**5.** Dokończenie:
```
[3/9] Pobieranie kodu z GitHub            OK
[4/9] Pobieranie Node.js v22.11.0         OK  (~30 MB)
[5/9] Instalacja zaleznosci system        OK  (~30s)
[6/9] Instalacja zaleznosci GUI           OK  (~2 min)
[7/9] Budowanie aplikacji                 OK
[8/9] Tworzenie folderow roboczych        OK
[9/9] Tworzenie skrotow (pulpit + Menu)   OK

   GOTOWE!
   Skrot: Pulpit → Wiola Helper
```

**6.** Wiola **wyjmuje pendrive i oddaje Tobie** — `.env` jest już w `C:\kreisel\system\.env`.

---

## 🔐 KROK 2: Logowanie do QBO (~5 min)

**1.** Dwuklik **"Wiola Helper"** na pulpicie.

**2.** Otwórz **Ustawienia** (zębatka w prawym dolnym rogu).

**3.** Sprawdź badge u góry: powinno być **🟢 PRODUCTION**.
- Jeśli SANDBOX: sekcja "🌐 QBO Environment" → `production` → **Zapisz** → restart aplikacji.

**4.** Sekcja **🔐 OAuth Login**:
- Klik **"Zaloguj jako EWI Pro"** → otworzy się okno Intuita
- Wiola loguje się **produkcyjnym** kontem EWI Pro
- Wybiera firmę → **Connect**
- Po 1-2 sekundach okno zamknie się samo, badge zmieni na **✓ Połączone**
- Klik **"Zaloguj jako EWI Store"** → analogicznie

**5.** Oba badge zielone z realm IDs — gotowe.

---

## 🧪 KROK 3: Pierwszy test DRY-RUN (~2 min)

**1.** **Ustawienia → ⚙️ Preferencje aplikacji**:
- **Tryb domyślny** → `Dry-run (tylko podgląd)`
- **Losowe opóźnienie** → tymczasowo `0 / 0` min (szybki test)

**2.** Zamknij Ustawienia.

**3.** Daj Wioli **JEDNĄ łatwą fakturę** (najlepiej z kontenerem w PDF — bez modalu).

**4.** Wiola przeciąga PDF → klika **"Wyślij wszystkie"**.

**5.** Pipeline ~7s (text PDF) lub ~40s (skan):
   - 🧠 Parsuję → ⚙️ Procesuję → ✅ Gotowe (dry-run)

**6.** **Sprawdź w sidebar po prawej**:
   - ✅ Numer Kreisla zgadza się z PDF
   - ✅ Data wystawienia OK
   - ✅ Kwoty PLN/GBP OK
   - ✅ Linie z poprawnymi SKU
   - ✅ HMRC month sensowny

Wszystko OK → **krok 4**. Coś nie gra → pisz na chat, naprawiamy live.

---

## 🚀 KROK 4: Pierwszy REAL POST (~5 min)

**1.** **Ustawienia → ⚙️ Preferencje aplikacji**:
- **Tryb domyślny** → `Posting (realne)`
- **Losowe opóźnienie** → `0 / 0` na pierwszy real test

**2.** Przeciąga tę samą fakturę raz jeszcze. Modal duplikat → **"Wymuś"**.

**3.** Klik **"Wyślij wszystkie"** → leci do **production** QBO.

**4.** Status ✅ **Gotowe** (~10s).

**5.** Sprawdź w **QBO Pro** (prawdziwa firma EWI Pro Insulation Systems):
- Vendors → Kreisel → Bills → nowy Bill z numerem `FSE-XXX/YYYY/EXP`
- Otwórz → kwoty, linie, **Attachment**: `FSE-XXX-YYYY.pdf` ✓

**6.** Sprawdź w **QBO Store** (prawdziwa firma EWI Store):
- Vendors → EWI Pro → Bills → nowy Bill w GBP
- Customers → EWI Pro → Invoices → nowy Invoice w GBP

**Trzy dokumenty muszą być wszystkie obecne.**

---

## ⚙️ KROK 5: Przywróć produkcyjne ustawienia

**1.** **Ustawienia → ⚙️ Preferencje aplikacji**:
- **Losowe opóźnienie** → `4 / 10` (chroni przed automat-detect w audycie)
- **Tryb domyślny** → `Posting (realne)` (zostaje)

**2.** Zamknij Ustawienia.

---

## 🎓 KROK 6: Mini-szkolenie Wioli (5 min)

Pokaż wszystkie scenariusze z [Instrukcja dla Wioli](user-guide.html):
- Codzienna paczka (drag + Wyślij wszystkie)
- 🚛 Brak kontenera → ConfirmTransport modal
- ⚠️ Nieznane SKU → UnknownSku modal
- ⏸ Granica miesiąca → ChooseMonth modal
- ❌ Błąd → 🔄 retry
- 📋 Historia
- 🔄 Aktualizacje (in-app)
- 🆘 Pomoc → log → mail do Ciebie

---

## 🛟 Plan B: Co jeśli coś nie działa

| Problem | Rozwiązanie |
|---------|-------------|
| `setup_wiola.cmd` umiera w trakcie | Sprawdź internet, uruchom ponownie (idempotentny) |
| Browser blokuje `.cmd` | "Zachowaj mimo to" w SmartScreen |
| Skrót pulpitu pokazuje konsolę | Uruchom `C:\kreisel\update_wiola.cmd` (odbudowuje skróty) albo `C:\kreisel\fix_shortcut.cmd` |
| OAuth: "redirect_uri mismatch" | Sprawdź Intuit Production redirect = `https://tryk016.github.io/wiola-helper/oauth-callback.html` |
| OAuth: niezalogowanie | Wiola loguje się prawdziwym EWI kontem (nie sandbox) |
| Faktura wisi `parsing` | Restart aplikacji (auto-reset hung statuses) |
| Cokolwiek dziwnego | Ustawienia → 🆘 → mail z `log.txt` |

Po naprawie po Twojej stronie (commit + push):
- Wiola → Ustawienia → 🔄 Aktualizacje → "Aktualizuj teraz" → 2 min → ma fix

---

## 📂 Co Wiola dostaje na PC po instalacji

```
C:\kreisel\
├── nodejs\                  ← portable Node.js 22 LTS (~50 MB)
├── system\                  ← parser, resolver, QBO client (~30 MB)
│   ├── node_modules\
│   ├── .env                 ← jej production+sandbox credentials
│   └── *.js
├── wiola-helper\            ← Electron + React aplikacja (~400 MB z node_modules)
│   ├── node_modules\
│   ├── dist\                ← zbudowany renderer
│   └── dist-electron\       ← zbudowany main+preload
├── inbox\, gotowe\, bledy\, wstrzymane\  ← puste (legacy folder structure)
├── magemar.xlsx             ← Wiola zapisuje codziennie z SharePoint
├── log.txt                  ← rotacyjne logi
└── .version                 ← SHA dla in-app update check

Pulpit\Wiola Helper.lnk      ← skrót do electron.exe (bez konsoli)
Menu Start\Wiola Helper.lnk  ← j.w.
%APPDATA%\Wiola Helper\state\
├── queue.json, pending.json, history.json, prefs.json
```

Wszystko prywatne dla Wioli — żaden plik nie wycieka poza jej maszynę (poza zaszyfrowanymi HTTPS callami do QBO/Anthropic/HMRC).

---

## 🔄 Aktualizacja istniejącej instalacji (bez pendrive)

### Z poziomu aplikacji
Ustawienia → 🔄 Aktualizacje → **Sprawdź aktualizacje** → jeśli nowa wersja → **Aktualizuj teraz**.

Aplikacja zamknie się, ~2 min w tle (download + npm install + Vite build), sama uruchomi się ponownie. Bez pendrive'a, bez czarnej konsoli.

### Ręcznie (gdy aplikacja nie działa)
```powershell
cd C:\kreisel
.\update_wiola.cmd
```
Skrypt zachowuje `.env`, `magemar.xlsx`, foldery robocze, state.

Gdyby repo było prywatne: aktualizacja użyje `GITHUB_TOKEN` z `.env`, a gdy go brak — zapyta o token i go zapisze.

---

## 🔧 Reinstalacja czysta (gdy wszystko się popsuło)

```powershell
# Backup .env i magemar
copy C:\kreisel\system\.env C:\users\<user>\Desktop\env.backup
copy C:\kreisel\magemar.xlsx C:\users\<user>\Desktop\magemar.backup

# Usuń wszystko (UWAGA — destrukcyjne)
rmdir /s /q C:\kreisel

# Uruchom setup ponownie
# (pobierz setup_wiola.cmd z GitHub jak w kroku 1)
```

Po setup → wskaż `.env.backup` jako plik z pendrive, skopiuj `magemar.backup` na `C:\kreisel\magemar.xlsx`.
