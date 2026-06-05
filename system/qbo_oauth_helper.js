// Local OAuth helper for QBO sandbox.
// Opens browser to Intuit auth → captures callback → exchanges code for refresh_token.
// Run once per sandbox company.
//
// Prereq: in your Intuit Developer app (Sandbox keys page), add redirect URI:
//   http://localhost:3000/callback
//
// Usage:
//   node qbo_oauth_helper.js pro          # for EWI Pro sandbox
//   node qbo_oauth_helper.js store        # for EWI Store sandbox
//
// On the Intuit consent page, sign in with the account that owns BOTH sandbox companies,
// then SELECT the company that matches the label you started this helper with.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const OAuthClient = require('intuit-oauth');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROLE = (process.argv[2] || '').toLowerCase();
if (!['pro', 'store'].includes(ROLE)) {
  console.error('Usage: node qbo_oauth_helper.js [pro|store]');
  process.exit(1);
}

const ENV_VAR_REFRESH = ROLE === 'pro' ? 'QBO_EWIPRO_REFRESH_TOKEN' : 'QBO_EWISTORE_REFRESH_TOKEN';
const ENV_VAR_REALM = ROLE === 'pro' ? 'QBO_EWIPRO_REALM_ID' : 'QBO_EWISTORE_REALM_ID';
const EXPECTED_REALM = process.env[ENV_VAR_REALM];
const REDIRECT_URI = 'http://localhost:3000/callback';

const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: process.env.QBO_ENV || 'sandbox',
  redirectUri: REDIRECT_URI,
});

const authUri = oauthClient.authorizeUri({
  scope: [OAuthClient.scopes.Accounting],
  state: ROLE,
});

console.log(`\n=== QBO OAuth helper — ${ROLE.toUpperCase()} sandbox ===`);
console.log(`Expected realmId: ${EXPECTED_REALM || '(none — will accept any)'}`);
console.log('\nOpening browser to Intuit auth…');
console.log('If browser does not open, paste this URL manually:');
console.log(authUri + '\n');

// Try to open browser (Windows-friendly)
exec(`start "" "${authUri}"`, () => {});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const fullUrl = 'http://localhost:3000' + req.url;
    const token = await oauthClient.createToken(fullUrl);
    const t = token.getJson();
    const realmId = new URL(fullUrl).searchParams.get('realmId');

    console.log('\n--- TOKEN RECEIVED ---');
    console.log('realmId         :', realmId);
    console.log('access_token    :', t.access_token.slice(0, 20) + '… (expires in ' + t.expires_in + 's)');
    console.log('refresh_token   :', t.refresh_token);
    console.log('x_refresh_in    :', t.x_refresh_token_expires_in + 's (≈100 days)');

    if (EXPECTED_REALM && realmId !== EXPECTED_REALM) {
      console.warn(`\n⚠️  WARNING: realmId ${realmId} does not match expected ${EXPECTED_REALM} for role "${ROLE}".`);
      console.warn('You probably authorized the wrong sandbox company. Re-run and choose the other one.');
    }

    // Update .env
    const envPath = path.join(__dirname, '.env');
    let envText = fs.readFileSync(envPath, 'utf8');
    const re = new RegExp(`^${ENV_VAR_REFRESH}=.*$`, 'm');
    if (re.test(envText)) envText = envText.replace(re, `${ENV_VAR_REFRESH}=${t.refresh_token}`);
    else envText += `\n${ENV_VAR_REFRESH}=${t.refresh_token}\n`;
    fs.writeFileSync(envPath, envText, 'utf8');
    console.log(`\n✓ Saved refresh_token to .env as ${ENV_VAR_REFRESH}`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2>OK — refresh token saved (role: ${ROLE})</h2><p>You can close this tab and return to the terminal.</p><pre>realmId: ${realmId}\nexpected: ${EXPECTED_REALM || '(any)'}\nmatch: ${realmId === EXPECTED_REALM ? '✓' : '✗'}</pre>`);
    setTimeout(() => server.close(), 500);
  } catch (e) {
    console.error('Error:', e.message);
    res.writeHead(500); res.end('Error: ' + e.message);
  }
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000/callback …');
});
