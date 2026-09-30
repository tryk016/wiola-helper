---
title: Development
layout: default
---

# Development workflow

## Setup developerski

```powershell
git clone https://github.com/tryk016/wiola-helper.git C:\kreisel
cd C:\kreisel

# system deps
cd system
npm install
cd ..

# GUI deps
cd wiola-helper
npm install
cd ..

# .env (skopiuj z istniejącego lub uzupełnij ręcznie)
copy <gdzieś_twoje>\.env C:\kreisel\system\.env
```

Wymaga: Node 22 LTS, Windows 10/11. Linux/macOS niewspierane (electron + windows-specific paths).

## Dev mode

```powershell
cd C:\kreisel\wiola-helper
npm run dev
```

- Vite dev server na `http://localhost:5173`
- Electron startuje, ładuje renderer z dev server (hot reload)
- DevTools automatycznie się otwierają (development mode flag)

## Hot reload

| Co zmieniasz | Reload? |
|--------------|---------|
| `src/renderer/**/*.tsx` lub `*.css` | Vite HMR (instant) |
| `src/main/**/*.ts` lub `src/preload/**/*.ts` | **NIE — restart `npm run dev`** (Ctrl+C + ponownie) |
| `C:\kreisel\system\**/*.js` | **NIE — restart `npm run dev`** (Node module cache) |
| `.env` | Restart aplikacji (env loaded raz na start) |
| `prefs.json` | Reload na następne IPC call |

Gdy mówię "Vite tego nie reloaduje" — chodzi o main process. Renderer tak. To częsta przyczyna confused stanu w trakcie pracy.

## Build production-like

```powershell
cd C:\kreisel\wiola-helper
npm run build:vite

# Run jak production (no DevTools, no menu)
.\node_modules\electron\dist\electron.exe .
```

Vite build:
- Renderer: `dist/index.html` + assets (minified)
- Main + preload: `dist-electron/main.js` + `dist-electron/preload.js`

W production mode:
- `webPreferences.devTools = false`
- `Menu.setApplicationMenu(null)` (no File/Edit/View/Window/Help bar)
- belt-and-braces `webContents.on('devtools-opened', closeDevTools)`

## Code structure

### Główny entry point Electron
`src/main/index.ts` — bootstrap, IPC handlers, processAll orchestration.

### Główny entry point Renderer
`src/renderer/main.tsx` → `src/renderer/App.tsx`.

### Współdzielona logika
`C:\kreisel\system\*.js` — wywoływane przez `require()` w `src/main/system-modules.ts`.

### Co JEST w `src/main/` (Electron-specific):
- queue.ts (zarządzanie stanem, archiwizacja, persist do JSON w `app.getPath('userData')`)
- pipeline.ts (orchestrator wszystkich faz)
- qbo-oauth.ts (BrowserWindow OAuth)
- settings.ts (env + prefs management)
- updater.ts (GitHub API + spawn VBS updater)

### Co JEST w `system/` (pure Node, używane też przez CLI):
- parse_kreisel_llm.js (LLM parser + quickKreiselRef)
- resolve_import.js (HMRC resolver + lookupPodTransport)
- hmrc_rate.js (HMRC API + cache)
- qbo_client.js (axios client)
- qbo_payloads.js (builder dla Bill/Invoice)
- magemar_lookup.js (xlsx parsing)
- sku_mapping.js (PL → EWI Pro SKU)

## Testing

Currently no automated tests — kod testowany ręcznie przez sandbox QBO + replay starych faktur.

Smoke test parsera:
```powershell
cd C:\kreisel\system
node parse_kreisel_llm.js "C:\path\to\FSE-XXX.pdf"
```

Smoke test resolver:
```powershell
node resolve_import.js "FSE-139/2026/EXP"
```

Smoke test QBO connection:
```powershell
node qbo_client.js
# → prints company info dla EWI Pro + EWI Store
```

## TypeScript

- `tsconfig.json` (project references base)
- `tsconfig.node.json` — main + preload
- `tsconfig.app.json` — renderer

Type check:
```powershell
cd C:\kreisel\wiola-helper
npx tsc -b --noEmit
```

`global.d.ts` w `src/renderer/` definiuje `Window.wiola` API.

## Git workflow

Branch: `main` only (single dev).

Każdy commit ma multi-line message z **DLACZEGO** (przyczyna), **CO** (zmiana), opcjonalnie **WPŁYW** (kogo dotyczy).

Przed push: zawsze sprawdź że TS się kompiluje (`npx tsc -b --noEmit`). Vite build się waliduje przy każdym `npm run dev` więc rzadko coś przeskoczy.

## Deployment

Push do `main` → automatycznie dostępne dla wszystkich userów którzy klikną "Aktualizuj teraz" w Settings.

GitHub Pages auto-deploy z `docs/` przy każdym push do main (1-2 min opóźnienie).

## Adding new functionality

### Nowy status faktury
1. Update `InvoiceStatus` w `src/main/queue.ts`
2. Update mirror w `src/renderer/types.ts`
3. Update reset-on-load logic w `queue.ts` jeśli stan jest transient
4. Update halt-list w `index.ts processAll` jeśli ma blokować batch
5. Dodaj status badge w `src/renderer/components/Queue.tsx`
6. (opcjonalnie) modal z user input + IPC handler

### Nowa pre-resolver gate w pipeline
1. Dodaj do `PipelineEvents` w `pipeline.ts` (callback Promise)
2. W pipeline await callback w odpowiednim miejscu
3. W `index.ts processAll`, przekaż callback resolver do Map (jak `pendingUnknownSku`)
4. IPC handler resolves Promise + queue.update na fallback

### Nowy modal
1. Stwórz `src/renderer/components/MyModal.tsx`
2. Import + mount w `App.tsx`
3. State `myModalFor` (useState<Invoice | null>)
4. Trigger: useEffect on queue change, lub onClick z Queue list
5. onSubmit → window.wiola.someIpc → main process

### Nowa kolumna w MySQL query
1. Update `resolve_import.js getPodRow` SELECT
2. Update `lookupPodTransport` returning object
3. Update `system-modules.ts` TS interface
4. Update `queue.ts InvoiceState.suggested_transport` type
5. Update `ConfirmTransportModal` aby pokazać nowe pole

## Debug tips

- **Main process console.log** → trafia do terminal'a z `npm run dev`
- **Renderer console.log** → DevTools console (F12 w dev mode)
- **stderr (`process.stderr.write`)** → terminal `npm run dev` (np. intuit_tid)
- **log.txt** → file, append every operation, persistent

W production mode:
- `log.txt` jest jedynym sensownym źródłem informacji
- DevTools nie działają (devTools: false)
- Console output trafia do `electron.exe` stderr ale nie ma do niego dostępu z UI

## Common pitfalls

### `process.env` w main vs renderer
Main process ma `process.env` z `.env` (po `require('dotenv').config()`). Renderer NIE MA — przekazuje przez IPC (`settings:getEnv`).

### Async w setTimeout w Electron
Promise rejected w setTimeout NIE jest złapany przez try/catch wokół await. Trzeba `try { await ... } catch` lub `.catch(e => {})` na promise.

To była przyczyna "Object has been destroyed" crash — setTimeout na `authWindow.close()` nie miał guards na destroyed window.

Dodaliśmy `process.on('uncaughtException')` w main jako belt-and-braces.

### `require()` cache
`require('C:/kreisel/system/foo.js')` jest cached na `module.id`. Modyfikacja pliku nie wpływa na running process. Restart aplikacji.

W development: zmiana `system/*.js` wymaga Ctrl+C w terminal `npm run dev` + restart.

### Vite + Electron paths
`__dirname` w bundled main.js wskazuje na `dist-electron/`. Używaj `path.join(__dirname, '..', 'dist', ...)` żeby trafić do renderer build.

### IPC payload size
IPC channel ma limit ~100MB. Stream large data (np. PDF base64) przez fragments albo file path zamiast bufora.
