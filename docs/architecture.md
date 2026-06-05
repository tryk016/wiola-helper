---
title: Architektura
layout: default
---

# Architektura Wiola Helper

## High-level

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Wiola Helper (Electron)                     │
│                                                                     │
│  ┌──────────────────┐         ┌────────────────────────────────┐   │
│  │   Renderer       │  IPC    │   Main process                 │   │
│  │   (React + TS)   │ ◄──────►│   (Node, TypeScript)           │   │
│  │                  │         │                                 │   │
│  │  - DropZone      │         │  - InvoiceQueue (state)         │   │
│  │  - Queue list    │         │  - runPipeline(file)            │   │
│  │  - Modals        │         │  - OAuth flow (BrowserWindow)   │   │
│  │  - Sidebar       │         │  - settings.ts / updater.ts     │   │
│  │  - Settings      │         │  - require('C:/kreisel/system') │   │
│  │  - History       │         │                                 │   │
│  └──────────────────┘         └─────────────┬───────────────────┘   │
│                                             │                       │
└─────────────────────────────────────────────┼───────────────────────┘
                                              │ require()
                                              ▼
                  ┌──────────────────────────────────────────┐
                  │      C:\kreisel\system\ (Node.js)        │
                  │                                          │
                  │  parse_kreisel_llm.js    (LLM parser)    │
                  │  resolve_import.js       (HMRC resolver) │
                  │  hmrc_rate.js            (FX lookup)     │
                  │  qbo_client.js           (QBO REST)      │
                  │  qbo_payloads.js         (Bill+Invoice)  │
                  │  magemar_lookup.js       (xlsx parse)    │
                  └──────────────────────────────────────────┘
                                  │
                                  │ HTTPS
                                  ▼
        ┌─────────────┬──────────────┬─────────────┬──────────────┐
        │  Anthropic  │  Intuit QBO  │    HMRC     │    MySQL     │
        │  Claude API │   v3 REST    │ public API  │  10.1.20.15  │
        └─────────────┴──────────────┴─────────────┴──────────────┘
```

## Komponenty

### `wiola-helper/` — Electron GUI

| Plik | Odpowiedzialność |
|------|------------------|
| `src/main/index.ts` | Bootstrap, IPC handlers, processAll loop, OAuth orchestration |
| `src/main/queue.ts` | InvoiceQueue class: persist state w `%APPDATA%\Wiola Helper\state\queue.json`, auto-archive, hung-status reset on load, retry/confirm methods |
| `src/main/pipeline.ts` | `runPipeline(fileId, pdfPath, post, events, options)` — parse → resolve → HMRC → payloads → POST → attachment |
| `src/main/qbo-oauth.ts` | In-app BrowserWindow OAuth, will-redirect intercept, sandbox vs production redirect URI |
| `src/main/settings.ts` | Read/write `.env`, mask secrets for renderer, `prefs.json` |
| `src/main/updater.ts` | GitHub API check for latest commit, spawn VBS bouncer → PowerShell hidden → update + relaunch |
| `src/main/system-modules.ts` | Re-exports `require('C:/kreisel/system/*.js')` with TS types |
| `src/preload/index.ts` | contextBridge: exposes `window.wiola.*` API to renderer |
| `src/renderer/App.tsx` | Layout, modal orchestration, useStore (Zustand) |
| `src/renderer/components/Queue.tsx` | List + status badges + retry button + delay countdown |
| `src/renderer/components/*Modal.tsx` | UnknownSku, PendingResolved, Duplicates, ChooseMonth, MissingTransport, ConfirmTransport |
| `src/renderer/components/Sidebar.tsx` | Selected invoice detail panel |
| `src/renderer/components/HistoryView.tsx` | Archived invoices, monthly grouping |
| `src/renderer/components/SettingsView.tsx` | QBO env, credentials, OAuth login, preferences, updates, support |
| `src/renderer/components/LogView.tsx` | `log.txt` tail viewer |
| `src/renderer/store.ts` | Zustand store: queue, pending, history, modals |

### `system/` — Pure Node logic

Wykorzystywane także przez stare CLI workflowy (`process_inbox.js`, `qbo_post_kreisel.js`). Wiola Helper require()-uje moduły, nie kopiuje kodu.

| Plik | Odpowiedzialność |
|------|------------------|
| `parse_kreisel_llm.js` | Hybrid parser: pdf-parse text → Claude text-only API; fallback do Claude vision dla skanów. Plus `quickKreiselRef` (regex tylko, no LLM, dla discovery phase) |
| `resolve_import.js` | Główna logika HMRC. BRANCH A: tylko PDF (no MySQL). BRANCH B: MySQL POD lookup. Plus `lookupPodTransport` dla ConfirmTransportModal pre-fill |
| `hmrc_rate.js` | HMRC monthly exchange rates (cached in `hmrc_cache/`) |
| `qbo_client.js` | Axios client, refresh token rotation, sandbox/production base URLs, intuit_tid interceptor for support |
| `qbo_payloads.js` | Buduje JSON dla Bill/Invoice z parsed Kreisel + HMRC rate |
| `magemar_lookup.js` | Parse `C:\kreisel\magemar.xlsx` po numerze kontenera |
| `sku_mapping.js` | Mapowanie polskich opisów Kreisla → EWI Pro SKU |

### `docs/` — GitHub Pages

Publiczna dokumentacja serwowana z `https://tryk016.github.io/wiola-helper/`. Zawiera EULA, Privacy Policy, OAuth callback bouncer dla production, oraz tę dokumentację.

---

## Technology stack

| Warstwa | Wybór | Dlaczego |
|---------|-------|----------|
| Desktop runtime | Electron 33 LTS | Cross-platform GUI, Node access do MySQL + Anthropic + plików, native dialogi |
| Renderer | React 18 + TypeScript | Idiomatyczny, hot reload via Vite |
| Bundler | Vite 6 + vite-plugin-electron | Fast dev server, sub-second renderer rebuild |
| State (renderer) | Zustand | Minimalny boilerplate, no provider hell |
| Styling | Tailwind CSS | Inline, no class-name juggle, easy dark mode |
| LLM | Anthropic Claude Sonnet 4.5 | Vision dla skanów + text-only dla nowych PDF; prompt caching ~$0.001/faktura |
| HTTP | axios | Per-request timeout, request/response interceptors (intuit_tid) |
| MySQL | mysql2/promise | Read-only access do produkcyjnej DB `dist` na 10.1.20.15 |
| Excel | ExcelJS | Parse `magemar.xlsx` (Magemar wysyła XLSX cotygodniowo) |
| PDF text | pdf-parse v2 | Wyciąg tekstu z text-layer PDF dla quickKreiselRef i hybrid parser |
| OAuth | Native Electron BrowserWindow | No external OAuth lib — full control nad redirect intercept |

---

## State machine: invoice

Każda faktura przechodzi przez następujące stany w `InvoiceQueue`:

```
                 enqueue()
                    │
                    ▼
              ┌─────────────┐
              │  waiting    │ ◄────────────────┐
              └──────┬──────┘                  │
                     │ processAll              │ retry()
                     ▼                         │
              ┌─────────────┐                  │
              │  parsing    │                  │
              └──────┬──────┘                  │
                     │                         │
        ┌────────────┼────────────┐            │
        ▼            ▼            ▼            │
   ┌─────────┐ ┌──────────┐ ┌────────────┐    │
   │ unknown │ │ awaiting │ │ ambiguous  │    │
   │  _sku   │ │_transport│ │  (pending) │    │
   │ (modal) │ │ _confirm │ │  (sidebar) │    │
   │         │ │ (modal)  │ │            │    │
   └────┬────┘ └─────┬────┘ └──────┬─────┘    │
        │            │             │           │
        │ user input │ user input  │ ChooseMon │
        ▼            ▼             ▼  modal    │
              ┌─────────────┐                  │
              │ processing  │                  │
              └──────┬──────┘                  │
                     │                         │
                     ▼                         │
              ┌─────────────┐                  │
              │   delay     │ (4-10 min)       │
              └──────┬──────┘                  │
                     │ sleep + skip option     │
                     ▼                         │
              ┌─────────────┐                  │
              │ processing  │                  │
              └──────┬──────┘                  │
                     │ POST QBO + attachments  │
                     │                         │
        ┌────────────┴────────────┐            │
        ▼                         ▼            │
   ┌─────────┐               ┌─────────┐       │
   │  done   │               │ failed  │───────┘
   └────┬────┘               └─────────┘
        │ 30s
        ▼
   ┌─────────┐
   │ history │
   └─────────┘
```

Pełen opis każdego stanu: [Stany faktur](invoice-states.html).

---

## IPC channels

`window.wiola.*` (typed in `src/renderer/global.d.ts`):

| Channel | Direction | Payload |
|---------|-----------|---------|
| `pdf:pick` | invoke | () → string[] (paths) |
| `queue:enqueue` | invoke | string[] paths → { added, duplicates } |
| `queue:enqueueForce` | invoke | string[] (skips duplicate check) |
| `queue:remove` | invoke | id |
| `queue:retry` | invoke | id |
| `queue:state` | event (push) | full state on every change |
| `queue:processAll` | invoke | post: boolean → { processed, halted, haltedAt } |
| `queue:skipDelay` | invoke | id |
| `queue:resolveTransport` | invoke | (id, transport) — for missing_transport flow |
| `queue:confirmTransport` | invoke | (id, { transport, hmrcMonth?, halt? }) |
| `queue:clearDone` / `clearFailed` | invoke | () |
| `history:clear` | invoke | () |
| `pending:resolveMonth` | invoke | (id, hmrcMonth) |
| `pending:recheck` | invoke | () → { found } |
| `modal:unknownSku` | event (push) | { fileId, unmapped } |
| `modal:unknownSku:respond` | invoke | (fileId, { skip, mappings? }) |
| `settings:getEnv` / `setEnv` | invoke | masked env / patch |
| `settings:getPrefs` / `setPrefs` | invoke | full prefs / patch |
| `qbo:oauthLogin` | invoke | role → { ok, realmId, refresh_token_preview, warning, error } |
| `update:check` | invoke | () → { hasUpdate, localSha, remoteSha, remoteMessage, error } |
| `update:apply` | invoke | () → { launched, error } |
| `update:localVersion` | invoke | () → SHA |
| `health:check` | invoke | () → { magemar, qbo } |
| `log:read` | invoke | (lines) → { lines, path } |
| `shell:openPath` | invoke | path |
| `support:openLogFolder` | invoke | () |

---

## Persistent state

Lokalizacje:

| Co | Gdzie | Reset on app restart? |
|----|-------|----------------------|
| Kolejka, pending, historia | `%APPDATA%\Wiola Helper\state\*.json` | Tak dla `parsing`/`processing`/`delay`/`awaiting_transport_confirm` (przepisywane na `waiting` lub `failed`) |
| Preferencje | `%APPDATA%\Wiola Helper\state\prefs.json` | Nie |
| Credentials | `C:\kreisel\system\.env` | Nie |
| Logs | `C:\kreisel\log.txt` | Nie |
| Wersja zainstalowana | `C:\kreisel\.version` (commit SHA) | Nie |
| HMRC rate cache | `C:\kreisel\system\hmrc_cache\*.json` | Nie |

---

## Security

- **Credentials never leave the device** (poza HTTPS callami do QBO/Anthropic/HMRC). `.env` jest tylko lokalnie
- **Sekrety zamaskowane** w renderer (`maskedEnv()` zwraca `XXXXXX••••YYYY` dla `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `ANTHROPIC_API_KEY`)
- **OAuth state parameter** (CSRF) sprawdzany w qbo-oauth.ts
- **No DevTools w production** (`devTools: false`, `Menu.setApplicationMenu(null)`, plus belt-and-braces `webContents.on('devtools-opened', closeDevTools)`)
- **Hidden update flow** (VBS + PowerShell -WindowStyle Hidden) — nie ma egzekwowalnego scenariusza eskalacji bo update_wiola.ps1 jest tylko-do-odczytu na końcu (rebuild + relaunch)
- **No DELETE w QBO** (App Assessment) — aplikacja tylko czyta i pisze
- **Single-tenant per install** — Wiola autoryzuje TYLKO swoje firmy EWI Pro + EWI Store

---

## Decyzje architektoniczne

### Dlaczego require() do `C:\kreisel\system\` zamiast bundlowania?

System code (parser, resolver, QBO) działa też w CLI mode (np. `node system/qbo_post_kreisel.js` jako Task Scheduler job, niezależnie od GUI). Współdzielony kod = jedna logika, jeden test surface. Bundlowanie do Electrona by oznaczało dwie kopie biznesowej logiki do utrzymania.

### Dlaczego nie electron-builder (NSIS installer)?

electron-builder próbuje pobrać narzędzia do macOS code-signing (libcrypto.dylib z symlinks), które wymagają developer mode lub admin na Windows do extractowania. Zamiast tego mamy własny PowerShell installer (`setup_wiola.ps1`) z bezpośrednim Vite build + skróty do `electron.exe`. Działa bez admin, bez symlinks, custom logic dla `.env` z pendrive.

### Dlaczego `wiolahelper://` nie jako redirect URI?

Intuit Production wymaga HTTPS. Custom URL scheme jest niedeterministyczne (zależy od OS protocol registration). HTTPS bouncer na GitHub Pages (`/oauth-callback.html`) jest 100% deterministyczne — przeglądarka rzuca na HTTPS URL, Electron `will-redirect` interceptuje zanim strona się załaduje. Sandbox zostaje na localhost HTTP (Intuit allows).

### Dlaczego trzymanie `manual_*` na invoice state zamiast lokalnych Map?

Trwałość przez restart aplikacji. Jeśli Wiola wybierze HMRC month w modal, potem zamknie aplikację, faktura wraca z `manual_hmrc_month` po restarcie i resolver jest pomijany. Map'y w pamięci by się traciły.

### Dlaczego halt-on-error w processAll?

Numeracja EWI Pro Invoice musi odpowiadać Kreisel FSE ASC. Jeśli #FSE-200 padnie, ale #FSE-201 przejdzie, mamy niezgodność. Halt zachowuje invariant. Wiola fixuje #FSE-200, retry → resztę można przepuścić.
