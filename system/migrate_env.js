// One-shot script to migrate C:\kreisel\system\.env from the single-pair
// QBO credential layout (QBO_CLIENT_ID / QBO_CLIENT_SECRET) to the new
// dual-pair layout (separate Sandbox + Production pairs).
//
// Behaviour:
//   1. Reads the existing .env (does NOT print any values to console)
//   2. Detects current QBO_ENV (default: sandbox)
//   3. Renames the legacy keys to the per-environment variant matching QBO_ENV
//   4. Adds empty placeholders for the OTHER environment's keys
//   5. Writes the result back, preserving comments and key order
//
// Idempotent — running it twice is safe (it skips if migration already done).
//
// Run: node C:\kreisel\system\migrate_env.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '.env');
const BACKUP_PATH = path.join(__dirname, `.env.backup-${Date.now()}`);

if (!fs.existsSync(ENV_PATH)) {
  console.error(`❌ Brak pliku ${ENV_PATH}`);
  process.exit(1);
}

const original = fs.readFileSync(ENV_PATH, 'utf8');
const lines = original.split(/\r?\n/);

// Parse without printing values
const keys = new Map();
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line || line.startsWith('#')) continue;
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m) keys.set(m[1], { value: m[2], lineIdx: i });
}

const hasSandbox = keys.has('QBO_CLIENT_ID_SANDBOX') || keys.has('QBO_CLIENT_SECRET_SANDBOX');
const hasProduction = keys.has('QBO_CLIENT_ID_PRODUCTION') || keys.has('QBO_CLIENT_SECRET_PRODUCTION');
const hasLegacy = keys.has('QBO_CLIENT_ID') || keys.has('QBO_CLIENT_SECRET');

if (hasSandbox && hasProduction) {
  console.log('✓ Plik już jest w nowym formacie (Sandbox + Production). Nic do migracji.');
  process.exit(0);
}

const currentEnvRaw = (keys.get('QBO_ENV')?.value || '').trim();
const currentEnv = currentEnvRaw === 'production' ? 'production' : 'sandbox';

console.log('');
console.log('🔧 Migracja .env do dual-credential layout');
console.log(`   Plik: ${ENV_PATH}`);
console.log(`   Wykryto QBO_ENV: ${currentEnv}`);
console.log(`   Klucze legacy:        ${hasLegacy ? 'tak' : 'nie'}`);
console.log(`   Już ma Sandbox keys:  ${hasSandbox ? 'tak' : 'nie'}`);
console.log(`   Już ma Production:    ${hasProduction ? 'tak' : 'nie'}`);
console.log('');

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a); }));
}

(async () => {
  console.log(`Migracja przepisze QBO_CLIENT_ID i QBO_CLIENT_SECRET → QBO_CLIENT_ID_${currentEnv.toUpperCase()} / QBO_CLIENT_SECRET_${currentEnv.toUpperCase()}.`);
  console.log(`Dla drugiego środowiska zostaną dodane PUSTE pola — wpiszesz potem ręcznie w Notatniku lub w aplikacji.`);
  console.log('');
  const a = await ask('Kontynuować? [t/N] ');
  if (a.trim().toLowerCase() !== 't') {
    console.log('Anulowano.');
    process.exit(0);
  }

  // Backup
  fs.writeFileSync(BACKUP_PATH, original, 'utf8');
  console.log(`📋 Backup: ${BACKUP_PATH}`);

  // Build new file
  const targetEnv = currentEnv.toUpperCase();
  const otherEnv = currentEnv === 'production' ? 'SANDBOX' : 'PRODUCTION';
  const renames = new Map([
    ['QBO_CLIENT_ID',     `QBO_CLIENT_ID_${targetEnv}`],
    ['QBO_CLIENT_SECRET', `QBO_CLIENT_SECRET_${targetEnv}`],
  ]);

  const newLines = [];
  const insertedAfterLegacy = { id: false, secret: false };
  for (const line of lines) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) { newLines.push(line); continue; }
    const oldKey = m[1];
    const value = m[2];
    if (renames.has(oldKey)) {
      const newKey = renames.get(oldKey);
      newLines.push(`${newKey}=${value}`);
      // Add placeholder for the OTHER env right after
      const otherKey = oldKey === 'QBO_CLIENT_ID' ? `QBO_CLIENT_ID_${otherEnv}` : `QBO_CLIENT_SECRET_${otherEnv}`;
      newLines.push(`${otherKey}=`);
      if (oldKey === 'QBO_CLIENT_ID') insertedAfterLegacy.id = true;
      else insertedAfterLegacy.secret = true;
    } else {
      newLines.push(line);
    }
  }

  // If legacy keys were already absent (corrupt state), just append both pairs empty
  if (!hasLegacy) {
    newLines.push('');
    newLines.push('# Added by migrate_env.js (legacy QBO_CLIENT_ID/SECRET not found)');
    newLines.push('QBO_CLIENT_ID_SANDBOX=');
    newLines.push('QBO_CLIENT_SECRET_SANDBOX=');
    newLines.push('QBO_CLIENT_ID_PRODUCTION=');
    newLines.push('QBO_CLIENT_SECRET_PRODUCTION=');
  }

  fs.writeFileSync(ENV_PATH, newLines.join('\r\n'), 'utf8');
  console.log(`✓ Zapisano nowy ${ENV_PATH}`);
  console.log('');
  console.log('Co dalej:');
  console.log(`  1. Otwórz ${ENV_PATH} w Notatniku`);
  console.log(`  2. Znajdź puste pola QBO_CLIENT_ID_${otherEnv}= i QBO_CLIENT_SECRET_${otherEnv}=`);
  console.log(`  3. Wpisz klucze z Intuit Developer (zakładka ${otherEnv === 'PRODUCTION' ? 'Production' : 'Development'})`);
  console.log(`  4. Zapisz`);
  console.log(`  5. Restart aplikacji jeśli była uruchomiona`);
  console.log('');
  console.log(`Jeśli coś poszło nie tak, przywróć: copy /Y "${BACKUP_PATH}" "${ENV_PATH}"`);
})();
