// HMRC monthly exchange rate fetcher with on-disk cache
// API: https://www.trade-tariff.service.gov.uk/api/v2/exchange_rates/files/monthly_csv_{YYYY}-{M}.csv
// Note: month with NO leading zero (2026-6, not 2026-06).

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CACHE_DIR = path.join(__dirname, 'hmrc_cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(year, month) {
  return path.join(CACHE_DIR, `${year}-${month}.csv`);
}

function url(year, month) {
  return `https://www.trade-tariff.service.gov.uk/api/v2/exchange_rates/files/monthly_csv_${year}-${month}.csv`;
}

async function fetchMonth(year, month) {
  ensureCacheDir();
  const cp = cachePath(year, month);
  if (fs.existsSync(cp)) {
    return fs.readFileSync(cp, 'utf8');
  }
  const u = url(year, month);
  const res = await axios.get(u, { responseType: 'text', timeout: 20000 });
  fs.writeFileSync(cp, res.data, 'utf8');
  return res.data;
}

function parseRow(csv, currencyCode) {
  const lines = csv.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    // Parse CSV (simple split — HMRC CSV doesn't use quoted commas in numeric fields)
    const cols = line.split(',').map(c => c.trim());
    // Columns may be: Country, Currency, Currency Code, Units per £1, Start, End
    // Header skip
    if (cols[2] === 'Currency Code') continue;
    if (cols[2] === currencyCode) {
      return {
        country: cols[0],
        currency: cols[1],
        code: cols[2],
        rate: parseFloat(cols[3]),
        start_date: cols[4],
        end_date: cols[5] || null,
      };
    }
  }
  return null;
}

/**
 * Get HMRC monthly rate.
 * @param {string|Date} dateOrYM  ISO date "YYYY-MM-DD" / Date object / "YYYY-M" / "YYYY-MM"
 * @param {string} currencyCode  e.g. "PLN"
 */
async function getRate(dateOrYM, currencyCode = 'PLN') {
  let year, month;
  if (dateOrYM instanceof Date) {
    year = dateOrYM.getFullYear();
    month = dateOrYM.getMonth() + 1;
  } else if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(String(dateOrYM))) {
    const parts = String(dateOrYM).split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else {
    throw new Error(`Cannot parse date: ${dateOrYM}`);
  }
  const csv = await fetchMonth(year, month);
  const row = parseRow(csv, currencyCode);
  if (!row) throw new Error(`No rate for ${currencyCode} in ${year}-${month}`);
  return {
    year,
    month,
    currency: currencyCode,
    rate: row.rate, // units per £1
    inverse: 1 / row.rate, // £ per 1 unit (for QBO Bill ExchangeRate field)
    start_date: row.start_date,
    end_date: row.end_date,
    source: url(year, month),
  };
}

module.exports = { getRate, fetchMonth, parseRow };

if (require.main === module) {
  (async () => {
    const arg = process.argv[2] || '2026-6';
    const cc = process.argv[3] || 'PLN';
    const r = await getRate(arg, cc);
    console.log(JSON.stringify(r, null, 2));
  })();
}
