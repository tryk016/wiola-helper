// In-app QBO OAuth flow. Opens a child BrowserWindow with Intuit auth page,
// intercepts redirect to localhost:3000/callback, exchanges code for tokens,
// saves refresh_token to .env.

import { BrowserWindow, type BrowserWindow as BW } from 'electron';
import axios from 'axios';
import { readEnv, writeEnv, type EnvVars } from './settings';

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';

// Intuit requires HTTPS for Production redirect URIs (HTTP rejected with
// "Please enter a unique valid redirect URI"). Sandbox accepts HTTP/localhost.
// For production we use a static HTTPS bouncer page on GitHub Pages — the
// BrowserWindow's will-redirect handler intercepts the navigation BEFORE the
// page actually loads, so the page content is just a fallback for the user.
const REDIRECT_URI_SANDBOX    = 'http://localhost:3000/callback';
const REDIRECT_URI_PRODUCTION = 'https://tryk016.github.io/wiola-helper/oauth-callback.html';

function redirectUriFor(envVal: string | undefined): string {
  return envVal === 'production' ? REDIRECT_URI_PRODUCTION : REDIRECT_URI_SANDBOX;
}

export interface OauthResult {
  ok: boolean;
  realmId?: string;
  refresh_token_preview?: string;
  warning?: string;
  error?: string;
}

function buildAuthUrl(clientId: string, role: 'pro' | 'store', redirectUri: string): string {
  const state = `${role}_${Date.now()}`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(clientId: string, clientSecret: string, code: string, redirectUri: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }).toString();
  const res = await axios.post(TOKEN_URL, body, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 20000,
  });
  return res.data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };
}

export async function startOauthFlow(
  parentWindow: BW,
  role: 'pro' | 'store'
): Promise<OauthResult> {
  const env = readEnv() as Partial<EnvVars>;
  // Sandbox and Production have separate Client ID/Secret pairs in Intuit
  // Developer. Pick the pair that matches QBO_ENV; fall back to the legacy
  // un-suffixed names so older installs keep working until they migrate.
  const envLabel = env.QBO_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const envRecord = env as unknown as Record<string, string | undefined>;
  const clientId = envRecord[`QBO_CLIENT_ID_${envLabel}`] || env.QBO_CLIENT_ID;
  const clientSecret = envRecord[`QBO_CLIENT_SECRET_${envLabel}`] || env.QBO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: `Brak QBO_CLIENT_ID_${envLabel} lub QBO_CLIENT_SECRET_${envLabel} w .env. ` +
             `Wpisz je w Ustawieniach → "QBO Credentials" (${envLabel === 'PRODUCTION' ? 'Production' : 'Sandbox'}).`,
    };
  }

  const expectedRealmId =
    role === 'pro' ? env.QBO_EWIPRO_REALM_ID : env.QBO_EWISTORE_REALM_ID;
  const refreshKey =
    role === 'pro' ? 'QBO_EWIPRO_REFRESH_TOKEN' : 'QBO_EWISTORE_REFRESH_TOKEN';

  const isProduction = env.QBO_ENV === 'production';
  const redirectUri = redirectUriFor(env.QBO_ENV);
  const authUrl = buildAuthUrl(clientId, role, redirectUri);

  return new Promise<OauthResult>((resolve) => {
    let resolved = false;
    const safeClose = () => {
      try {
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
      } catch { /* already gone */ }
    };
    const authWindow = new BrowserWindow({
      width: 700,
      height: 850,
      parent: parentWindow,
      modal: true,
      title: `Wiola Helper — Zaloguj jako EWI ${role === 'pro' ? 'Pro' : 'Store'} ${isProduction ? '(PRODUKCJA)' : '(SANDBOX)'}`,
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:qbo-oauth-${role}`,
      },
    });

    const handleRedirect = (url: string) => {
      if (!url.startsWith(redirectUri)) return false;
      const u = new URL(url);
      const code = u.searchParams.get('code');
      const realmId = u.searchParams.get('realmId');
      const errorParam = u.searchParams.get('error');

      if (errorParam) {
        resolved = true;
        safeClose();
        resolve({ ok: false, error: `Intuit: ${errorParam} — ${u.searchParams.get('error_description') || ''}` });
        return true;
      }

      if (!code) return false;

      // Show "exchanging" UI by loading a tiny inline page (if window still alive)
      if (!authWindow.isDestroyed()) {
        authWindow.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent(
              '<html><body style="font-family:Segoe UI;padding:50px;text-align:center;background:#f5f5f5"><div style="font-size:48px">⏳</div><h2>Pobieram token z Intuit...</h2><p style="color:#666">Za chwilę zamknę to okno.</p></body></html>'
            )
        );
      }

      exchangeCodeForTokens(clientId, clientSecret, code, redirectUri)
        .then((tokens) => {
          // ALWAYS save realm ID from OAuth (Intuit returns the actually-authorized company).
          // If user picked wrong company, they'll see the new realm ID in UI and can re-login.
          let warning: string | undefined;
          if (expectedRealmId && realmId && realmId !== expectedRealmId) {
            warning = `Zmieniono realm z ${expectedRealmId} na ${realmId}. Jeśli to inna firma niż EWI ${role === 'pro' ? 'Pro' : 'Store'}, zaloguj się ponownie i wybierz właściwą.`;
          }

          const updates: Partial<EnvVars> = { [refreshKey]: tokens.refresh_token };
          if (realmId) {
            if (role === 'pro') updates.QBO_EWIPRO_REALM_ID = realmId;
            else updates.QBO_EWISTORE_REALM_ID = realmId;
          }
          writeEnv(updates);

          resolved = true;
          setTimeout(safeClose, 1000);
          resolve({
            ok: true,
            realmId: realmId || undefined,
            refresh_token_preview: tokens.refresh_token.slice(0, 12) + '••••' + tokens.refresh_token.slice(-4),
            warning,
          });
        })
        .catch((e) => {
          resolved = true;
          safeClose();
          resolve({
            ok: false,
            error:
              `Wymiana code → token nie powiodła się: ${(e as Error).message}\n\n` +
              `Upewnij się że ${redirectUri} jest dodany w Intuit Developer → Twoja apka → Keys & Credentials → Redirect URIs (${isProduction ? 'tab Production' : 'tab Development'}).`,
          });
        });

      return true;
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (handleRedirect(url)) event.preventDefault();
    });
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (handleRedirect(url)) event.preventDefault();
    });

    authWindow.on('closed', () => {
      if (!resolved) resolve({ ok: false, error: 'Anulowano (okno zamknięte przed zalogowaniem).' });
    });

    authWindow.loadURL(authUrl);
  });
}
