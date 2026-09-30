---
title: Konfiguracja .env
layout: default
---

# `C:\kreisel\system\.env` — pełna referencja

> Plik tekstowy. Format `KEY=value`. Komentarze `#`. Wartości z `$`, `'`, `"` ujmij w single quotes.

## Pełen szablon

```env
# ═══════════════════════════════════════════════════
# QBO — Intuit QuickBooks Online
# ═══════════════════════════════════════════════════

# Aktywne środowisko: "sandbox" lub "production"
QBO_ENV=production

# --- Sandbox app (Intuit Developer → twoja apka → Development tab) ---
QBO_CLIENT_ID_SANDBOX=ABaXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
QBO_CLIENT_SECRET_SANDBOX=kk0ixxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- Production app (Intuit Developer → twoja apka → Production tab) ---
QBO_CLIENT_ID_PRODUCTION=ABPlhukBxxxxxxxxxxxxxxxxxxxxxxx
QBO_CLIENT_SECRET_PRODUCTION=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Realm IDs (Company IDs w QBO) — auto-zapisywane po OAuth login
QBO_EWIPRO_REALM_ID=
QBO_EWISTORE_REALM_ID=

# Refresh tokens (~100 days) — auto-zapisywane i rotowane po OAuth login
QBO_EWIPRO_REFRESH_TOKEN=
QBO_EWISTORE_REFRESH_TOKEN=

# ═══════════════════════════════════════════════════
# Anthropic Claude API (LLM parser)
# ═══════════════════════════════════════════════════

ANTHROPIC_API_KEY=sk-ant-...

# ═══════════════════════════════════════════════════
# MySQL (read-only, dist database)
# ═══════════════════════════════════════════════════

MYSQL_HOST=10.1.20.15
MYSQL_PORT=3306
MYSQL_DB=dist
MYSQL_USER=pbaranai
# Hasło z $ lub ' musi być w single quotes:
MYSQL_PASSWORD='{q$xxxxxxxxxxxx}'

# ═══════════════════════════════════════════════════
# GitHub — tylko gdy repo jest prywatne (instalacja i aktualizacje)
# ═══════════════════════════════════════════════════

GITHUB_TOKEN=github_pat_...
```

---

## Szczegółowy opis każdej zmiennej

### `QBO_ENV`
- **Wartości**: `sandbox` (default jeśli pusta lub coś innego) | `production`
- **Wpływ**: wybór par credentials (`*_SANDBOX` vs `*_PRODUCTION`), wybór API base URL, wybór redirect URI dla OAuth
- **Zmienna używana przez**: `qbo_client.js apiBase()`, `qbo_client.js getQboCredentials()`, `qbo-oauth.ts redirectUriFor()`, `qbo-oauth.ts startOauthFlow()`

### `QBO_CLIENT_ID_SANDBOX` / `QBO_CLIENT_SECRET_SANDBOX`
- **Format**: `AB` prefix + ~46 chars dla ID, ~32 chars dla Secret
- **Skąd brać**: Intuit Developer Dashboard → wybierz apkę → **Keys & OAuth** → tab **Development**
- **Kiedy używane**: gdy `QBO_ENV != 'production'`

### `QBO_CLIENT_ID_PRODUCTION` / `QBO_CLIENT_SECRET_PRODUCTION`
- **Format**: `AB` prefix + ~46 chars dla ID, ~32 chars dla Secret
- **Skąd brać**: Intuit Developer Dashboard → wybierz apkę → **Keys & OAuth** → tab **Production**
- **Kiedy używane**: gdy `QBO_ENV == 'production'`

### `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` (legacy)
- **Status**: deprecated, ale działa jako fallback
- **Kiedy używane**: gdy `QBO_CLIENT_ID_{ENV}` jest pusty
- **Migracja**: zmień ręcznie nazwy w `.env` na `QBO_CLIENT_ID_SANDBOX` / `_PRODUCTION` (patrz niżej)

### `QBO_EWIPRO_REALM_ID` / `QBO_EWISTORE_REALM_ID`
- **Format**: 15-16 cyfr (np. `9341452840843752`)
- **Auto-fill**: tak, po pomyślnym OAuth login dla danej firmy
- **Skąd brać ręcznie**: po zalogowaniu do QBO w przeglądarce, URL pokazuje `?realmId=XXXXXX`

### `QBO_EWIPRO_REFRESH_TOKEN` / `QBO_EWISTORE_REFRESH_TOKEN`
- **Format**: `RT1-` prefix + ~37 chars
- **Auto-fill**: tak, po OAuth login + auto-rotated przy każdym `refreshAccessToken`
- **Wygasanie**: 100 dni od ostatniego użycia (długo unused → wymaga re-login)
- **Skąd brać ręcznie**: NIGDY ręcznie — zawsze przez OAuth flow

### `ANTHROPIC_API_KEY`
- **Format**: `sk-ant-` prefix + ~100 chars
- **Skąd brać**: console.anthropic.com → Settings → API Keys
- **Tier**: Standard (Tier 1) wystarcza dla naszego usage (~20 calls/day)
- **Koszt**: ~$0.005 per faktura LLM call (text mode), ~$0.01 (vision mode). Z prompt caching ~$0.001 po pierwszym call

### `MYSQL_HOST`
- **Wartość**: `10.1.20.15` (read-only do `dist` DB)
- **Wymaga**: maszyna musi widzieć ten host (VPN, intranet, czy inna sieć)
- **Test**: `Test-NetConnection 10.1.20.15 -Port 3306` w PowerShell

### `MYSQL_PORT`
- **Wartość**: `3306`

### `MYSQL_DB`
- **Wartość**: `dist`

### `MYSQL_USER`
- **Wartość**: `pbaranai`

### `MYSQL_PASSWORD`
- **Format**: zazwyczaj ma special chars (`$`, `{`, `}`, itp.)
- **WAŻNE**: ujmij w **single quotes** `'...'` żeby uniknąć interpretation przez dotenv:
  ```env
  MYSQL_PASSWORD='{q$abc...}'
  ```
- Bez quotes: dotenv może próbować expand `$abc` jako zmienną → broken connection

### `GITHUB_TOKEN`
- **Po co**: opcjonalny. Gdy repo `tryk016/wiola-helper` jest prywatne, `setup_wiola.ps1`, `update_wiola.ps1` i sprawdzanie aktualizacji w aplikacji pobierają kod z GitHub API z tym tokenem (bez niego: 404). Publiczne repo — zostaw puste
- **Format**: `github_pat_` + ~80 znaków (fine-grained personal access token)
- **Skąd brać**: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
  - Repository access: **Only select repositories** → `tryk016/wiola-helper`
  - Repository permissions: **Contents: Read-only** (Metadata: Read-only dodaje się sam)
  - Expiration: np. 1 rok — wpisz sobie przypomnienie
- **Zmiana**: w aplikacji Ustawienia → **🔑 Token GitHub** (zapisuje do `.env`), albo instalator / `update_wiola.cmd` zapyta o niego, gdy GitHub odmówi dostępu
- **Wygasł**: w aplikacji „Sprawdź aktualizacje” pokaże „GitHub 401/404 — brak dostępu do repozytorium”

---

## Inne pola które mogą się pojawić

### Legacy / opcjonalne

| Pole | Co to | Status |
|------|-------|--------|
| `KREISEL_VENDOR_NAME` | Cached vendor name | Deprecated, dynamicznie szukamy |
| `EWISTORE_CUSTOMER_NAME` | Cached customer name | Deprecated |
| `EWIPRO_VENDOR_NAME` | Cached vendor name w Store | Deprecated |
| `TAX_CODE_PVA` | TaxCode name dla PVA | Hardcoded w `qbo_payloads.js` |
| `MAGEMAR_PATH` | Custom path do magemar.xlsx | Default `C:\kreisel\magemar.xlsx` |

---

## Walidacja `.env`

Po edycji ręcznej możesz sprawdzić czy wszystko OK:

```powershell
cd C:\kreisel\system
node qbo_client.js
```

Powinno wypisać company info dla Pro + Store. Jeśli błąd → komunikat powie czego brakuje.

```powershell
node -e "require('dotenv').config({path:'C:/kreisel/system/.env'}); console.log('ENV ok:', process.env.QBO_ENV)"
```

Sprawdza tylko czy dotenv parsuje plik bez błędu.

---

## Migracja starych formatów

### Z single-pair credentials (pre-dual env)

Stare `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` nadal działają jako fallback. Żeby przejść na nowy format, w `.env` zmień nazwy na
`QBO_CLIENT_ID_PRODUCTION` / `QBO_CLIENT_SECRET_PRODUCTION` (jeśli `QBO_ENV=production`) albo `_SANDBOX` (inaczej)
i dopisz parę dla drugiego środowiska (albo wpisz je w aplikacji: Ustawienia → QBO Credentials).

---

## Bezpieczeństwo

- **Nie commituj `.env`**! `.gitignore` go pomija; sprawdź `git status` przed `git add`
- **Sekrety nigdy nie idą do logów** (`maskedEnv()` w `settings.ts`)
- **Pendrive z `.env`** trzymaj w bezpiecznym miejscu po instalacji u Wioli
- **Hasło MySQL** zmień jeśli pendrive zaginął
- **Refresh tokens** możesz invalidate przez Intuit Developer Dashboard → My Apps → Revoke

---

## Restartowanie aplikacji po zmianie `.env`

`dotenv` ładuje plik **tylko raz** przy starcie procesu. Każda zmiana wymaga:

- W dev mode: Ctrl+C w terminal `npm run dev` + ponownie
- W production: zamknij okno Wioli → otwórz ponownie z pulpitu

Settings UI po zapisaniu pola też prosi o restart.
