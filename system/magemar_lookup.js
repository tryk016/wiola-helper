// Magemar CMA SSL container tracker — load Excel, lookup by container number.
//
// Source: cross-tenant SharePoint, downloaded manually to external/magemar.xlsx
// Sheet "Sheet1", columns:
//   B  Container number
//   L  ATD Gdansk      (Actual Time Departure from PL)
//   N  ETA Tilbury/Teesport (planned arrival to UK port)
//   O  ATA Tilbury/Teesport (ACTUAL arrival to UK port) ← customs clearance date
//   R  Actual delivery date  (received at EWI Store warehouse)
//
// ATA Tilbury/Teesport is the HMRC month determinant.

const path = require('path');
const ExcelJS = require('exceljs');

// Szukaj pliku w kolejności: zmienna środowiskowa → C:/kreisel/ → legacy external/.
const SEARCH_PATHS = [
  process.env.MAGEMAR_PATH,
  'C:/kreisel/magemar.xlsx',
  path.join(__dirname, 'external', 'magemar.xlsx'),
].filter(Boolean);

function findMagemarPath() {
  const fs = require('fs');
  for (const p of SEARCH_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const DEFAULT_PATH = findMagemarPath() || SEARCH_PATHS[1]; // fallback to C:/kreisel/magemar.xlsx

const COLS = {
  container: 2,       // B
  atd_gdansk: 12,     // L
  eta_uk: 14,         // N
  ata_uk: 15,         // O
  planned_delivery: 16, // P
  actual_delivery: 18,  // R
};

const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;

function isContainerNumber(s) {
  return CONTAINER_RE.test(String(s || '').trim());
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    // formats: "21.04.2026", "5/27/2026"
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(val);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const d = new Date(val);
    if (!isNaN(+d)) return d;
  }
  if (val && val.richText) {
    // pick the non-strike (most recent) text
    const live = val.richText.filter(t => !(t.font && t.font.strike));
    const pick = (live[live.length - 1] || val.richText[val.richText.length - 1]).text;
    return toDate(pick.trim());
  }
  return null;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function isoMonth(d) {
  return d ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}` : null;
}

function isoDate(d) {
  return d ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` : null;
}

let _cache = null;

// Drop the in-memory index so the next lookup re-reads the file. Call after
// replacing magemar.xlsx (e.g. via the in-app "Wybierz plik Magemar" button).
function clearCache() { _cache = null; }

async function loadIndex(xlsxPath = null) {
  const fs = require('fs');
  // Re-resolve path each time in case files appeared/moved
  const actualPath = xlsxPath || findMagemarPath() || SEARCH_PATHS[1];
  if (!fs.existsSync(actualPath)) {
    throw new Error(
      `Magemar Excel not found. Sprawdzano:\n` +
      SEARCH_PATHS.map(p => `  - ${p}`).join('\n') +
      `\n\nPobierz z SharePoint i zapisz jako: C:\\kreisel\\magemar.xlsx`
    );
  }
  const stat = fs.statSync(actualPath);
  // Reuse cache only if the same file AND it hasn't changed on disk (mtime) —
  // so a replaced file (same path, new content) is picked up without restart.
  if (_cache && _cache.path === actualPath && _cache.mtimeMs === stat.mtimeMs) return _cache;
  const ageHours = (Date.now() - stat.mtime.getTime()) / 3600000;
  if (ageHours > 24) {
    console.warn(`⚠️  magemar.xlsx ma ${ageHours.toFixed(1)}h (>24h). Rozważ pobranie świeższego z SharePoint.`);
  }
  console.log(`  Magemar: ${actualPath} (${ageHours.toFixed(1)}h old)`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(actualPath);
  const ws = wb.getWorksheet('Sheet1');
  if (!ws) throw new Error('Sheet1 not found in ' + actualPath);
  const idx = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getCell(r, COLS.container).value;
    const cont = String(v ? (v.text || v) : '').trim();
    if (!cont) continue;
    idx.set(cont, {
      row: r,
      container: cont,
      atd_gdansk: toDate(ws.getCell(r, COLS.atd_gdansk).value),
      eta_uk: toDate(ws.getCell(r, COLS.eta_uk).value),
      ata_uk: toDate(ws.getCell(r, COLS.ata_uk).value),
      planned_delivery: toDate(ws.getCell(r, COLS.planned_delivery).value),
      actual_delivery: toDate(ws.getCell(r, COLS.actual_delivery).value),
    });
  }
  _cache = { path: actualPath, index: idx, mtime: stat.mtime, mtimeMs: stat.mtimeMs };
  return _cache;
}

/**
 * Lookup HMRC month by container number.
 * @returns { status: 'ok'|'no_ata'|'not_found'|'not_a_container',
 *            container, ata_uk, hmrc_month, source }
 */
async function lookupContainer(containerNo, xlsxPath = DEFAULT_PATH) {
  const cn = String(containerNo || '').trim();
  if (!isContainerNumber(cn)) {
    return { status: 'not_a_container', container: cn };
  }
  const { index } = await loadIndex(xlsxPath);
  const row = index.get(cn);
  if (!row) return { status: 'not_found', container: cn };
  if (!row.ata_uk) {
    return {
      status: 'no_ata',
      container: cn,
      eta_uk: isoDate(row.eta_uk),
      atd_gdansk: isoDate(row.atd_gdansk),
      source: 'magemar:Sheet1',
    };
  }
  return {
    status: 'ok',
    container: cn,
    ata_uk: isoDate(row.ata_uk),
    hmrc_month: isoMonth(row.ata_uk),
    actual_delivery: isoDate(row.actual_delivery),
    atd_gdansk: isoDate(row.atd_gdansk),
    source: 'magemar:Sheet1',
  };
}

module.exports = { loadIndex, lookupContainer, isContainerNumber, clearCache };

if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    if (arg) {
      console.log(JSON.stringify(await lookupContainer(arg), null, 2));
    } else {
      // batch test on 4 fixture containers
      const tests = ['ECMU5405966', 'CGMU8514020', 'FFAU5409519', 'CMAU6487821'];
      for (const c of tests) {
        console.log(c, '→', JSON.stringify(await lookupContainer(c)));
      }
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
