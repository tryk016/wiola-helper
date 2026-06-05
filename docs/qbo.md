---
title: QBO Integracja
layout: default
---

# QuickBooks Online Integration

## Aplikacje Intuit Developer

Wiola Helper integruje się z QBO przez Intuit Developer App o ID `<INTUIT_APP_ID>`. App ma dwa zestawy kluczy:
- **Sandbox** (Development tab) — do testów na sandbox companies
- **Production** (Production tab) — do realnych firm EWI Pro + EWI Store

Wybór jest dyktowany przez `QBO_ENV` w `.env`.

## OAuth 2.0 Flow

### Pierwsze logowanie
```
1. Wiola Helper otwiera BrowserWindow z URL:
   https://appcenter.intuit.com/connect/oauth2
     ?client_id={CLIENT_ID_FOR_ENV}
     &response_type=code
     &scope=com.intuit.quickbooks.accounting
     &redirect_uri={REDIRECT_URI_FOR_ENV}
     &state={role}_{timestamp}
   
2. User loguje się do Intuita w nowym oknie.
3. User wybiera firmę (Realm) i potwierdza zakres uprawnień.
4. Intuit 302-redirect na redirect_uri z parametrami:
   ?code=...&realmId=...&state=...
   
5. Electron webContents.on('will-redirect') interceptuje navigation
   ZANIM strona się załaduje. Parsuje code + realmId.
   
6. POST do https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
   z grant_type=authorization_code, code, redirect_uri.
   
7. Odpowiedź zawiera:
   - access_token (1h)
   - refresh_token (~100 dni)
   - x_refresh_token_expires_in
   
8. Zapisujemy refresh_token + realmId do .env per role:
   QBO_EWIPRO_REFRESH_TOKEN, QBO_EWIPRO_REALM_ID  (lub _EWISTORE_)
   
9. Okno OAuth zamyka się automatycznie po 1s.
```

### Redirect URIs

| Środowisko | Redirect URI |
|------------|--------------|
| Sandbox | `http://localhost:3000/callback` |
| Production | `https://tryk016.github.io/wiola-helper/oauth-callback.html` |

**Dlaczego dwie różne**: Intuit wymaga HTTPS dla production redirect URIs. Localhost HTTP jest akceptowane tylko dla sandbox. Custom URL schemes nie są zaufane.

GitHub Pages serwuje statyczny `oauth-callback.html` który jest tylko placeholderem — Electron BrowserWindow interceptuje navigation ZANIM strona się załaduje. Strona pokazuje "Autoryzacja zakończona — wracam do Wiola Helper" jako fallback dla niezłapanego intercept'u.

### Refresh access token

```ts
async function refreshAccessToken(refreshToken) {
  // Same TOKEN_URL, grant_type=refresh_token, refresh_token=...
  return res.data;  // { access_token, refresh_token (rotated!), expires_in, ... }
}
```

**Intuit rotuje refresh_token** przy każdym refresh. Zapisujemy nowy do `.env` automatycznie (`persistRefresh` w `qbo_client.js`).

Access tokens cachowane in-memory per role (`_cache.pro`, `_cache.store`) z `expires_at`. Re-refresh gdy `expires_at < now + 60s`.

### Token wygasanie

- **Access token**: 1 godzina
- **Refresh token**: 100 dni od ostatniego użycia (~3.5 miesiąca w workflow Wioli który robi codzienne posty)

Jeśli refresh token wygaśnie (np. miesiąc bez pracy) — `refreshAccessToken` zwraca 401. Pipeline emit `failed` z message "Refresh token expired — re-login wymagany". Wiola otwiera Settings → "Zaloguj jako EWI Pro/Store" → nowy refresh token.

## Per-environment credentials

```ts
function getQboCredentials() {
  const env = process.env.QBO_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const id = process.env[`QBO_CLIENT_ID_${env}`] || process.env.QBO_CLIENT_ID;
  const secret = process.env[`QBO_CLIENT_SECRET_${env}`] || process.env.QBO_CLIENT_SECRET;
  return { id, secret, envLabel: env };
}
```

Fallback do legacy `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` (single pair) jeśli per-environment variant pusty — backward compat z pre-migration installs.

## API base URLs

```ts
function apiBase() {
  return (process.env.QBO_ENV === 'production')
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';
}
```

Pełen URL endpoint: `{apiBase}/{realmId}/{operation}?minorversion=75`.

## API surface used

| Endpoint | Method | Co robimy |
|----------|--------|-----------|
| `companyinfo/{realmId}` | GET | Health check, sprawdzenie czy realm działa |
| `preferences` | GET | Sprawdza MultiCurrencyEnabled, HomeCurrency |
| `query?query=SELECT...` | GET | Lookup Vendors, Customers, Items by Name, Accounts, TaxCodes |
| `bill` | POST | Tworzy Bill (PLN dla Pro, GBP dla Store) |
| `invoice` | POST | Tworzy Invoice (EWI Pro → EWI Store, w GBP) |
| `upload` | POST multipart | Załącza PDF do Bill (multipart form-data) |

**Nigdy nie używamy DELETE**, **nigdy nie modyfikujemy istniejących dokumentów**. Wiola Helper jest write-only do nowych Bills/Invoices. Aplikacja przechodzi App Assessment jako "Accounting / Expense Management / Invoicing / Document Management".

## Payloads

### EWI Pro Bill (Kreisel)

```json
{
  "DocNumber": "FSE-203/2026/EXP",
  "TxnDate": "2026-05-30",
  "DueDate": "2026-08-28",
  "VendorRef": { "value": "{kreiselVendorId}" },
  "CurrencyRef": { "value": "PLN" },
  "ExchangeRate": 4.7530,  // 1/hmrc.rate, 7dp
  "Line": [
    {
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": 0,    // ⚠ QBO wymaga numeric value; UI pokaże "0.00"
      "AccountBasedExpenseLineDetail": {
        "AccountRef": { "value": "{importAccountId}" },
        "TaxCodeRef": { "value": "{pvaImportTaxCodeId}" }
      }
    },
    {
      "DetailType": "ItemBasedExpenseLineDetail",
      "Amount": 2150.40,
      "ItemBasedExpenseLineDetail": {
        "ItemRef": { "value": "{ewi150ItemId}" },
        "Qty": 96,
        "UnitPrice": 22.40,  // 4dp
        "TaxCodeRef": { "value": "{pvaImportTaxCodeId}" }
      }
    }
    // ... więcej linii produktowych
  ]
}
```

Załącznik: `upload` endpoint z multipart, plik nazwany `kreisel_ref.replace('/', '-') + '.pdf'` (np. `FSE-203-2026.pdf`).

### EWI Pro Invoice (do EWI Store)

```json
{
  "DocNumber": null,  // QBO auto-numeruje (sekwencyjnie)
  "TxnDate": "2026-05-30",
  "CustomerRef": { "value": "{ewistoreCustomerId}" },
  "CurrencyRef": { "value": "GBP" },
  "ExchangeRate": 1,  // GBP jest home currency dla Pro
  "Line": [
    {
      "DetailType": "SalesItemLineDetail",
      "Amount": 452.34,  // PLN * hmrc.rate * markup
      "SalesItemLineDetail": {
        "ItemRef": { "value": "{ewi150ItemId}" },
        "Qty": 96,
        "UnitPrice": 4.71,
        "TaxCodeRef": { "value": "{exemptTaxCodeId}" }
      }
    }
    // ... lustro Bill linii
  ]
}
```

### EWI Store Bill (od EWI Pro)

Lustro Invoice. Vendor=EWI Pro, taka sama struktura jak Invoice ale jako Bill.

## intuit_tid logging

Axios response interceptor w `qbo_client.js`:

```ts
const captureTid = (resp) => {
  const tid = resp?.headers?.['intuit_tid'] || resp?.headers?.['Intuit_Tid'];
  if (tid) process.stderr.write(`[QBO intuit_tid=${tid} status=${status} ${name} ${url}]\n`);
};
```

`intuit_tid` to unique request ID przydatny dla Intuit support przy troubleshootingu (request: "show me what happened with this call"). Logowane do `stderr` dla każdego success i error response.

## App Assessment compliance

Wiola Helper przechodzi App Assessment z następującymi cechami:

- ✅ **Account types**: tylko Accounting API (nie Payments, nie Payroll)
- ✅ **Read + Write**: czytamy Vendors, Customers, Items, Accounts; piszemy Bills, Invoices, Attachables
- ✅ **NIE deletujemy**: żadne DELETE w aplikacji
- ✅ **Platform**: Desktop app, jeden zestaw OAuth credentials per env
- ✅ **Multi-currency**: tak (PLN Bills, GBP Invoices)
- ✅ **VAT**: PVA Import 20% (UK Postponed VAT Accounting)
- ✅ **intuit_tid capture**: dla support troubleshooting
- ✅ **Error logging**: full request/response w `log.txt`
- ✅ **In-app support contact**: Settings → 🆘 Pomoc z mailto + log attachment
- ✅ **MFA**: handled by Intuit during OAuth (we don't add own layer)
- ✅ **CSRF**: state parameter w OAuth
- ✅ **No data sharing**: customer's QBO data stays local + transmitted only to Intuit
- ✅ **EULA**: hosted [docs/eula](eula.html)
- ✅ **Privacy Policy**: hosted [docs/privacy](privacy.html)
- ✅ **Re-authentication on expiry**: tak (Settings shows "Zaloguj ponownie" button)
- ✅ **Discovery document**: yes (consulted at build time for endpoint URLs)
- ✅ **Token refresh**: 1h cycle, transparent retry
- ✅ **Customer-facing version support**: Plus i Advanced (Multicurrency)
- ✅ **Version-change handling**: graceful (API errors surfaced to UI, no crash)

## Sandbox vs Production migration

| Co zmienia się | Sandbox | Production |
|---------------|---------|-----------|
| `QBO_ENV` | `sandbox` | `production` |
| Client ID/Secret | sandbox pair (Intuit Development tab) | production pair (Intuit Production tab) |
| Redirect URI | `http://localhost:3000/callback` | `https://tryk016.github.io/wiola-helper/oauth-callback.html` |
| API base | `https://sandbox-quickbooks.api.intuit.com/v3/company` | `https://quickbooks.api.intuit.com/v3/company` |
| Realm IDs | sandbox companies (dwa testowe EWI Pro/Store) | realne firmy |

`.env` trzyma obie pary kluczy. Przełączenie środowiska = zmiana jednej linijki (`QBO_ENV=...`) i nowe OAuth login (jeśli realm IDs dla nowego env nie są zapisane).
