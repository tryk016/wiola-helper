// Analyze Kreisel container transit times: invoice date → ATA Tilbury (UK port arrival).
// Pulls all delivered POD records with container-shaped truck_reg_number,
// joins with Magemar Excel, computes days from invoice_date to ATA.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { loadIndex, isContainerNumber } = require('./magemar_lookup');

// Read .env manually (dotenv has issues with $ in MYSQL_PASSWORD)
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  const envText = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const m = new RegExp(`^${key}=(.+)$`, 'm').exec(envText);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;

function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function bar(n, max, width = 50) {
  const len = Math.round((n / max) * width);
  return '█'.repeat(len) + '·'.repeat(width - len);
}

(async () => {
  const conn = await mysql.createConnection({
    host: readEnv('MYSQL_HOST'),
    port: parseInt(readEnv('MYSQL_PORT') || '3306', 10),
    database: readEnv('MYSQL_DB'),
    user: readEnv('MYSQL_USER'),
    password: readEnv('MYSQL_PASSWORD'),
  });

  // Get all delivered Kreisel PODs with reasonably-shaped truck_reg
  const [rows] = await conn.execute(
    `SELECT id, invoice_number_supplier,
            invoice_date, delivery_date, delivered_stamp,
            truck_reg_number, branch_id
       FROM purchase_orders_deliveries
      WHERE supplier_id = 2884
        AND delivered = 1
        AND invoice_number_supplier LIKE 'FSE-%'
        AND invoice_date > UNIX_TIMESTAMP('2024-01-01')
      ORDER BY invoice_date DESC`
  );
  await conn.end();
  console.log(`Pulled ${rows.length} delivered PODs from MySQL.`);

  // Load Magemar Excel
  const { index } = await loadIndex();
  console.log(`Loaded Magemar Excel — ${index.size} containers indexed.\n`);

  // Cross-reference
  const data = [];
  let containerShape = 0, containerInMagemar = 0;
  for (const r of rows) {
    const truck = (r.truck_reg_number || '').trim().toUpperCase();
    if (!CONTAINER_RE.test(truck)) continue;
    containerShape++;
    const mag = index.get(truck);
    if (!mag || !mag.ata_uk) continue;
    containerInMagemar++;
    const invDate = new Date(r.invoice_date * 1000);
    const ata = mag.ata_uk;
    const days = daysBetween(invDate, ata);
    if (days < 0 || days > 90) continue; // skip suspicious values
    data.push({
      fse: r.invoice_number_supplier,
      container: truck,
      invoice_date: invDate.toISOString().slice(0, 10),
      ata_uk: ata.toISOString().slice(0, 10),
      atd_gdansk: mag.atd_gdansk ? mag.atd_gdansk.toISOString().slice(0, 10) : null,
      days_to_uk: days,
      // also: days from ATD (Gdansk) → ATA (UK) = sea transit
      sea_transit: mag.atd_gdansk ? daysBetween(mag.atd_gdansk, ata) : null,
      // days from invoice to ATD (PL handling)
      pl_handling: mag.atd_gdansk ? daysBetween(invDate, mag.atd_gdansk) : null,
    });
  }
  console.log(`Containers in MySQL with container-shaped truck_reg: ${containerShape}`);
  console.log(`  ... of those, found in Magemar with ATA: ${containerInMagemar}`);
  console.log(`  ... after filtering crazy values: ${data.length}\n`);

  if (data.length < 20) {
    console.log('Too few data points. Increase date range or check Magemar coverage.');
    return;
  }

  // === STATISTICS ===
  const days = data.map(d => d.days_to_uk);
  const n = days.length;
  const mean = days.reduce((s, d) => s + d, 0) / n;
  const stdev = Math.sqrt(days.reduce((s, d) => s + (d - mean) ** 2, 0) / n);

  console.log('═'.repeat(70));
  console.log(`KREISEL CONTAINER TRANSIT (invoice date → ATA Tilbury/Teesport)`);
  console.log('═'.repeat(70));
  console.log(`Sample size:  ${n} containers (over ${Math.round((Date.now() - new Date(data[data.length - 1].invoice_date).getTime()) / 86400000)} days of history)`);
  console.log('');
  console.log(`Mean:         ${mean.toFixed(1)} days`);
  console.log(`Median (p50): ${percentile(days, 50).toFixed(1)} days`);
  console.log(`Stdev:        ${stdev.toFixed(1)} days`);
  console.log('');
  console.log(`Percentiles:`);
  console.log(`  p5  (5% arrive by):   ${percentile(days, 5).toFixed(1)} days`);
  console.log(`  p25 (25%):            ${percentile(days, 25).toFixed(1)} days`);
  console.log(`  p50 (median):         ${percentile(days, 50).toFixed(1)} days`);
  console.log(`  p75 (75%):            ${percentile(days, 75).toFixed(1)} days`);
  console.log(`  p90 (90%):            ${percentile(days, 90).toFixed(1)} days`);
  console.log(`  p95 (95%):            ${percentile(days, 95).toFixed(1)} days`);
  console.log(`  min:                  ${Math.min(...days)} days`);
  console.log(`  max:                  ${Math.max(...days)} days`);

  // Histogram
  console.log(`\nHistogram (days from invoice → ATA):`);
  const buckets = {};
  for (const d of days) buckets[d] = (buckets[d] || 0) + 1;
  const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const maxCount = Math.max(...Object.values(buckets));
  for (const k of keys) {
    if (k < 5 || k > 40) continue; // focus on realistic range
    console.log(`  ${String(k).padStart(2)} days  ${bar(buckets[k], maxCount, 40)}  ${buckets[k]}`);
  }

  // Break out sea transit
  const withSea = data.filter(d => d.sea_transit !== null && d.sea_transit > 0 && d.sea_transit < 30);
  if (withSea.length > 20) {
    const seaD = withSea.map(d => d.sea_transit);
    const plD = withSea.map(d => d.pl_handling);
    console.log(`\n--- Breakdown (where both ATD Gdansk + ATA Tilbury known, n=${withSea.length}) ---`);
    console.log(`PL handling (invoice → ATD Gdansk):  mean ${(plD.reduce((a, b) => a + b, 0) / plD.length).toFixed(1)} d, p50 ${percentile(plD, 50).toFixed(1)} d, p90 ${percentile(plD, 90).toFixed(1)} d`);
    console.log(`Sea transit (ATD Gdansk → ATA UK):  mean ${(seaD.reduce((a, b) => a + b, 0) / seaD.length).toFixed(1)} d, p50 ${percentile(seaD, 50).toFixed(1)} d, p90 ${percentile(seaD, 90).toFixed(1)} d`);
  }

  // === RECOMMENDATION ===
  console.log('\n' + '═'.repeat(70));
  console.log('REKOMENDACJA dla resolver heurystyki');
  console.log('═'.repeat(70));
  console.log(`Aktualnie: invoice_date + 13 dni (z buforem +/- 3 dni dla month boundary).\n`);

  // For each candidate +N, what % falls within month boundary safety zone?
  console.log('Testowane heurystyki:');
  console.log(`  N    Median Δ  Mean Δ   |Δ|≤2  |Δ|≤3  |Δ|≤5   Within month`);
  for (let N = 8; N <= 18; N++) {
    const errors = days.map(d => N - d);
    const med = percentile(errors, 50);
    const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
    const within2 = errors.filter(e => Math.abs(e) <= 2).length / errors.length;
    const within3 = errors.filter(e => Math.abs(e) <= 3).length / errors.length;
    const within5 = errors.filter(e => Math.abs(e) <= 5).length / errors.length;
    // "within month" — predicted ATA in same calendar month as actual
    let sameMonth = 0;
    for (const d of data) {
      const inv = new Date(d.invoice_date + 'T00:00:00Z');
      const pred = new Date(inv.getTime() + N * 86400000);
      const actual = new Date(d.ata_uk + 'T00:00:00Z');
      if (pred.getUTCMonth() === actual.getUTCMonth() && pred.getUTCFullYear() === actual.getUTCFullYear()) sameMonth++;
    }
    const sameMonthPct = sameMonth / data.length;
    const marker = N === 13 ? ' ← obecna' : '';
    console.log(`  ${String(N).padStart(2)}d  ${med.toFixed(1).padStart(8)}  ${meanErr.toFixed(1).padStart(7)}  ${(within2 * 100).toFixed(0).padStart(4)}%  ${(within3 * 100).toFixed(0).padStart(4)}%  ${(within5 * 100).toFixed(0).padStart(4)}%   ${(sameMonthPct * 100).toFixed(0).padStart(4)}%${marker}`);
  }

  console.log(`\n💡 Optimal: użyj N najbliższe medianie ${percentile(days, 50).toFixed(0)}d — wtedy „same month" %ile jest najwyższy.`);
  console.log(`   Plus zostaw bufor month boundary (day ≤3 lub ≥28 → flag ambiguous) — to obsługuje p25-p75 spread.`);
})().catch(e => { console.error(e); process.exit(1); });
