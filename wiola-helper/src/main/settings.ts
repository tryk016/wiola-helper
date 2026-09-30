// Settings management — read/write .env file at C:\kreisel\system\.env
// Plus app preferences in userData.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const ENV_PATH = 'C:/kreisel/system/.env';
const PREFS_PATH = path.join(app.getPath('userData'), 'state', 'prefs.json');

export interface AppPrefs {
  defaultMode: 'dry-run' | 'post';
  autoArchiveSeconds: number;
  showLineDetails: boolean;
  // Random anti-automation delay between consecutive invoice posts.
  // Each post (except the first) waits a uniformly-random duration in
  // [delayMinMinutes, delayMaxMinutes]. Set min=max=0 to disable.
  delayMinMinutes: number;
  delayMaxMinutes: number;
}

const DEFAULT_PREFS: AppPrefs = {
  defaultMode: 'post',
  autoArchiveSeconds: 30,
  showLineDetails: true,
  delayMinMinutes: 4,
  delayMaxMinutes: 10,
};

export interface EnvVars {
  QBO_ENV: string;
  // Legacy single pair (still read as fallback for older installs)
  QBO_CLIENT_ID: string;
  QBO_CLIENT_SECRET: string;
  // Per-environment pairs (Sandbox and Production are separate Intuit apps)
  QBO_CLIENT_ID_SANDBOX: string;
  QBO_CLIENT_SECRET_SANDBOX: string;
  QBO_CLIENT_ID_PRODUCTION: string;
  QBO_CLIENT_SECRET_PRODUCTION: string;
  QBO_EWIPRO_REALM_ID: string;
  QBO_EWISTORE_REALM_ID: string;
  QBO_EWIPRO_REFRESH_TOKEN: string;
  QBO_EWISTORE_REFRESH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  MYSQL_HOST: string;
  MYSQL_PORT: string;
  MYSQL_DB: string;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  // Read-only token for the private GitHub repo (in-app update check + update script)
  GITHUB_TOKEN: string;
}

export function readEnv(): Partial<EnvVars> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out as Partial<EnvVars>;
}

export function writeEnv(updates: Partial<EnvVars>) {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error('.env not found at ' + ENV_PATH);
  }
  let text = fs.readFileSync(ENV_PATH, 'utf8');
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    const re = new RegExp(`^${k}=.*$`, 'm');
    // If value has special chars ($ for MySQL pass), quote it
    const needsQuote = /[$\s'"]/.test(v);
    const value = needsQuote ? `'${v}'` : v;
    if (re.test(text)) {
      text = text.replace(re, `${k}=${value}`);
    } else {
      text += `\n${k}=${value}`;
    }
  }
  fs.writeFileSync(ENV_PATH, text, 'utf8');
}

// Mask secrets when sending to renderer
export function maskedEnv(): Partial<EnvVars> {
  const e = readEnv();
  const mask = (s?: string) => (s ? s.slice(0, 8) + '••••' + s.slice(-4) : '');
  return {
    ...e,
    QBO_CLIENT_SECRET: mask(e.QBO_CLIENT_SECRET),
    QBO_CLIENT_SECRET_SANDBOX: mask(e.QBO_CLIENT_SECRET_SANDBOX),
    QBO_CLIENT_SECRET_PRODUCTION: mask(e.QBO_CLIENT_SECRET_PRODUCTION),
    QBO_EWIPRO_REFRESH_TOKEN: mask(e.QBO_EWIPRO_REFRESH_TOKEN),
    QBO_EWISTORE_REFRESH_TOKEN: mask(e.QBO_EWISTORE_REFRESH_TOKEN),
    ANTHROPIC_API_KEY: mask(e.ANTHROPIC_API_KEY),
    MYSQL_PASSWORD: mask(e.MYSQL_PASSWORD),
    GITHUB_TOKEN: mask(e.GITHUB_TOKEN),
  };
}

export function readPrefs(): AppPrefs {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) };
    }
  } catch {}
  return DEFAULT_PREFS;
}

export function writePrefs(updates: Partial<AppPrefs>) {
  const current = readPrefs();
  const merged = { ...current, ...updates };
  if (!fs.existsSync(path.dirname(PREFS_PATH))) {
    fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
  }
  fs.writeFileSync(PREFS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}
