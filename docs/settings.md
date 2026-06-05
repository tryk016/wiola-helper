---
title: Settings
layout: default
---

# Settings — wszystkie opcje

## 🌐 QBO Environment

| Wartość | Co używamy |
|---------|-----------|
| `sandbox` | Sandbox Client ID/Secret, sandbox API base, localhost redirect URI, sandbox realm IDs |
| `production` | Production Client ID/Secret, production API base, GitHub Pages redirect URI, production realm IDs |

Przycisk **"Przełącz na production/sandbox"** — wymaga restartu aplikacji.

## 🔑 QBO Credentials

Dwa wyraźnie oddzielone bloki (amber Sandbox, emerald Production):

| Pole | `.env` | Skąd brać |
|------|--------|----------|
| Sandbox Client ID | `QBO_CLIENT_ID_SANDBOX` | Intuit Dev → twoja apka → Keys & OAuth → tab Development |
| Sandbox Client Secret | `QBO_CLIENT_SECRET_SANDBOX` | j.w. |
| Production Client ID | `QBO_CLIENT_ID_PRODUCTION` | Intuit Dev → tab Production |
| Production Client Secret | `QBO_CLIENT_SECRET_PRODUCTION` | j.w. |

**Legacy fallback**: jeśli per-env variant pusty, aplikacja czyta `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` jako fallback. Pole pokazuje stare wartości w bloku zgodnym z aktualnym `QBO_ENV`.

Secrets są maskowane w UI (`XXXXXXXX••••YYYY`) — pełna wartość tylko w `.env` na dysku.

## 🏢 Realm IDs

Identyfikatory firm w QBO (Company IDs). Wypełniane automatycznie po OAuth Login, ale można edytować ręcznie.

| Pole | `.env` |
|------|--------|
| EWI Pro Realm ID | `QBO_EWIPRO_REALM_ID` |
| EWI Store Realm ID | `QBO_EWISTORE_REALM_ID` |

Znajdziesz w URL QBO po zalogowaniu: `https://app.qbo.intuit.com/app/...?realmId=XXXXXXXXXXXXXXX`.

## 🔐 OAuth Login

Self-service login do QBO bez konieczności manualnego flow:

Dla każdej firmy (Pro, Store) widzisz:
- Status: **✓ Połączone** lub **✗ Brak logowania**
- Realm ID jeśli zalogowane
- Token preview: `RT1-XXX...YYY` (zamaskowany)
- Przycisk: **"Zaloguj"** (jeśli brak) lub **"Zaloguj ponownie"** (jeśli jest)

Klik → otwiera się okno OAuth Intuit Inside Electron BrowserWindow. Po zalogowaniu okno samo zamyka się, `.env` jest zaktualizowane (`QBO_*_REFRESH_TOKEN` + `QBO_*_REALM_ID`), Settings odświeża się.

## 🎫 Refresh Tokens

Pola pokazują zamaskowane refresh tokens. Można je usunąć ręcznie (np. żeby zmusić aplikację do nowego logowania).

## 🔄 Aktualizacje

Sprawdza GitHub commits:
- Twoja wersja: lokalny commit SHA z `C:\kreisel\.version` (zapisany przy install/update)
- Wersja na GitHub: latest commit na main przez GitHub API

Status:
- **✓ Masz najnowszą wersję** (emerald)
- **📦 Dostępna nowa wersja!** (amber) z opisem commit'a i przyciskiem "Aktualizuj teraz"

**Aktualizuj teraz** → confirm dialog → pisanie VBS launcher do `%TEMP%` → spawn detached `wscript.exe` (no console window) → PowerShell -WindowStyle Hidden + parametr 0 → update_wiola.ps1 leci w tle (download + npm install + Vite build) → na końcu Start-Process electron.exe (relaunch). Po ~2 min Wiola sama otwiera się z nowym kodem.

Bez czarnej konsoli, bez ręcznych kroków.

## ⚙️ Preferencje aplikacji

### Tryb domyślny przy "Wyślij wszystkie"

| Wartość | Co robi |
|---------|--------|
| `Posting (realne)` | POST do prawdziwego QBO + załączenie PDF |
| `Dry-run (tylko podgląd)` | Pipeline kompletny WSZYSTKIE oprócz finalnego POST; w sidebar widać payloady |

Dry-run = bezpieczny test. Anti-automation delay NIE działa w dry-run (testowanie szybkie).

### Auto-archive po (sekundach)

Po zakończeniu faktury (`status: 'done'`) jak długo zostaje w kolejce zanim się przeniesie do Historii.

- **Default**: 30
- **Range**: 5 — 3600 (5s do 1h)

Po archive faktura znika z głównego widoku, jest w Historii.

### ⏱ Losowe opóźnienie między fakturami

Random sleep [min, max] minut między udanymi POST QBO (faktura ≥ 2 w batchu).

- **Default**: 4 / 10
- **Disable**: 0 / 0

Dotyczy tylko **Posting** mode. Dry-run pomija delay.

Po co: QBO audit history nie pokaże "10 Bills w 30 sekund" jak by zauważył automat.

**Skip per-invoice**: w UI countdown'a klik "Wyślij teraz" → pomija delay tej jednej faktury, kolejne mają normalny delay.

## 🆘 Pomoc i wsparcie

- **E-mail wsparcia**: mailto-link z prefilled subject "Wiola Helper - Wsparcie" do Patryka
- **"📁 Otwórz folder z logami"**: otwiera Explorer z `C:\kreisel\log.txt` zaznaczonym, żeby user mógł go załączyć do maila

Log zawiera `intuit_tid` z każdego QBO response (potrzebny dla Intuit support przy troubleshootingu).

---

## Edycja `.env` bezpośrednio

Niektóre pola są ukryte w UI (ANTHROPIC, MYSQL) bo Wiola ich nie potrzebuje. Edytuj `.env` w Notatniku:

```env
# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-...

# MySQL (read-only do dist DB)
MYSQL_HOST=10.1.20.15
MYSQL_PORT=3306
MYSQL_DB=dist
MYSQL_USER=pbaranai
MYSQL_PASSWORD='...'
```

Po edycji `.env` — restart aplikacji żeby zmiany się załadowały.

## Edycja `prefs.json` bezpośrednio

`%APPDATA%\Wiola Helper\state\prefs.json`:

```json
{
  "defaultMode": "post",
  "autoArchiveSeconds": 30,
  "showLineDetails": true,
  "delayMinMinutes": 4,
  "delayMaxMinutes": 10
}
```

Możesz dodać/usunąć pola. Brakujące będą wzięte z defaults.

## Restartowanie aplikacji

| Co zrobiłeś | Trzeba restart? |
|-------------|----------------|
| Settings → zapisz `.env` field | TAK (env vars są ładowane raz na start) |
| Settings → zmień prefs (delay, archive) | NIE (prefs czytane na każdy use) |
| Edit `.env` w Notatniku | TAK |
| Edit `prefs.json` w Notatniku | NIE |
| Edit kodu `system/*.js` | TAK (Node module cache) |
| Edit kodu `wiola-helper/src/main/*.ts` w dev | TAK (Vite nie reloadu main) |
| Edit kodu `wiola-helper/src/renderer/*.tsx` w dev | NIE (Vite HMR) |
| Aktualizacja przez "Aktualizuj teraz" | Tak (auto) |
