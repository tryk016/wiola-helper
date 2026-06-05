// Thin QBO REST API client — handles access-token refresh & API calls.
//
// Usage:
//   const { getClient } = require('./qbo_client');
//   const pro = await getClient('pro');
//   const info = await pro.get('companyinfo/' + pro.realmId);
//
// Caches access tokens in-memory (1h life). Persists rotated refresh tokens back to .env.

const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ENV_PATH = path.join(__dirname, '.env');
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function apiBase() {
  return (process.env.QBO_ENV === 'production')
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';
}

function envFor(which) {
  const w = which.toLowerCase();
  if (w === 'pro' || w === 'ewipro') {
    return { name: 'pro', realmKey: 'QBO_EWIPRO_REALM_ID', refreshKey: 'QBO_EWIPRO_REFRESH_TOKEN' };
  }
  if (w === 'store' || w === 'ewistore') {
    return { name: 'store', realmKey: 'QBO_EWISTORE_REALM_ID', refreshKey: 'QBO_EWISTORE_REFRESH_TOKEN' };
  }
  throw new Error(`Unknown company: ${which} (use "pro" or "store")`);
}

function persistRefresh(refreshKey, newToken) {
  if (!newToken) return;
  let txt = fs.readFileSync(ENV_PATH, 'utf8');
  const re = new RegExp(`^${refreshKey}=.*$`, 'm');
  if (re.test(txt)) {
    txt = txt.replace(re, `${refreshKey}=${newToken}`);
  } else {
    txt += `\n${refreshKey}=${newToken}\n`;
  }
  fs.writeFileSync(ENV_PATH, txt);
  process.env[refreshKey] = newToken;
}

async function refreshAccessToken(refreshToken) {
  const id = process.env.QBO_CLIENT_ID;
  const secret = process.env.QBO_CLIENT_SECRET;
  if (!id || !secret) throw new Error('QBO_CLIENT_ID / QBO_CLIENT_SECRET missing in .env');
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    { headers: { Accept: 'application/json', Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data; // { access_token, refresh_token, expires_in, x_refresh_token_expires_in, token_type }
}

const _cache = {}; // { name: { access_token, expires_at } }

async function getClient(which) {
  const { name, realmKey, refreshKey } = envFor(which);
  const realmId = process.env[realmKey];
  if (!realmId) throw new Error(`${realmKey} missing in .env`);
  const refreshToken = process.env[refreshKey];
  if (!refreshToken) throw new Error(`${refreshKey} missing in .env — run qbo_oauth_helper.js ${name}`);

  let entry = _cache[name];
  if (!entry || entry.expires_at < Date.now() + 60_000) {
    const tok = await refreshAccessToken(refreshToken);
    // Intuit rotates refresh tokens — persist if changed
    if (tok.refresh_token && tok.refresh_token !== refreshToken) {
      persistRefresh(refreshKey, tok.refresh_token);
    }
    entry = _cache[name] = {
      access_token: tok.access_token,
      expires_at: Date.now() + tok.expires_in * 1000,
    };
  }

  const baseURL = `${apiBase()}/${realmId}`;
  const http = axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${entry.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  return {
    name,
    realmId,
    baseURL,
    accessToken: entry.access_token,
    async get(pathRel, params) {
      const r = await http.get(pathRel, { params: { ...(params || {}), minorversion: 75 } });
      return r.data;
    },
    async post(pathRel, body, params) {
      const r = await http.post(pathRel, body, { params: { ...(params || {}), minorversion: 75 } });
      return r.data;
    },
    async postMultipart(pathRel, form, params) {
      const axios = require('axios');
      const r = await axios.post(`${baseURL}/${pathRel}`, form, {
        headers: { Authorization: `Bearer ${entry.access_token}`, Accept: 'application/json', ...form.getHeaders() },
        params: { ...(params || {}), minorversion: 75 },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000,
      });
      return r.data;
    },
    async getPdf(pathRel) {
      const axios = require('axios');
      const r = await axios.get(`${baseURL}/${pathRel}`, {
        headers: { Authorization: `Bearer ${entry.access_token}`, Accept: 'application/pdf' },
        responseType: 'arraybuffer',
        params: { minorversion: 75 },
        timeout: 60000,
      });
      return Buffer.from(r.data);
    },
    async query(sql) {
      const r = await http.get('query', { params: { query: sql, minorversion: 75 } });
      return r.data;
    },
  };
}

module.exports = { getClient };

if (require.main === module) {
  (async () => {
    for (const which of ['pro', 'store']) {
      const c = await getClient(which);
      const info = await c.get(`companyinfo/${c.realmId}`);
      const ci = info.CompanyInfo || {};
      console.log(`\n=== ${which.toUpperCase()} (realm ${c.realmId}) ===`);
      console.log(`Company: ${ci.CompanyName || ci.LegalName}`);
      console.log(`Country: ${ci.Country}  Currency (home): ${ci.NameValue ? '?' : '?'}`);
      console.log(`Fiscal Year start: ${ci.FiscalYearStartMonth}`);
      // multicurrency
      const pref = await c.get('preferences');
      const cur = pref.Preferences && pref.Preferences.CurrencyPrefs;
      const home = cur ? cur.HomeCurrency && cur.HomeCurrency.value : '?';
      const multi = cur ? cur.MultiCurrencyEnabled : '?';
      console.log(`Home currency: ${home}  MultiCurrencyEnabled: ${multi}`);
    }
  })().catch(e => {
    console.error('--- ERROR ---');
    console.error('message:', e.message);
    if (e.response) {
      console.error('status:', e.response.status);
      console.error('headers:', JSON.stringify(e.response.headers, null, 2));
      console.error('data:', JSON.stringify(e.response.data, null, 2));
      console.error('url:', e.config && e.config.url);
    }
    console.error('stack:', e.stack);
    process.exit(1);
  });
}
