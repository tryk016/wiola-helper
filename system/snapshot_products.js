// Snapshot of all products EWI Store buys from EWI Pro.
// Run by Patryk periodically (monthly?) — saves to ewi_pro_products.json.
// At runtime, parser reads this JSON to suggest matches for unknown Kreisel descriptions.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPPLIER_ID_EWIPRO = 2884;
const OUT = path.join(__dirname, 'ewi_pro_products.json');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '10.1.20.15',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DB || 'dist',
    user: process.env.MYSQL_USER || 'pbaranai',
    password: process.env.MYSQL_PASSWORD,
  });
  try {
    const [rows] = await conn.execute(
      `SELECT p.id, p.code, p.name,
              COUNT(DISTINCT podl.purchase_orders_deliveries_id) AS times_ordered,
              FROM_UNIXTIME(MAX(pod.invoice_date)) AS last_order
         FROM purchase_orders_deliveries pod
         JOIN purchase_orders_deliveries_lines podl ON podl.purchase_orders_deliveries_id=pod.id
         JOIN kf_products p ON p.id=podl.product_id
        WHERE pod.supplier_id=?
          AND p.usuniety=0
        GROUP BY p.id, p.code, p.name
        ORDER BY p.code`,
      [SUPPLIER_ID_EWIPRO]
    );
    const data = {
      generated_at: new Date().toISOString().slice(0, 10),
      supplier: 'EWI PRO INSULATION SYSTEMS LTD',
      supplier_id_in_dist: SUPPLIER_ID_EWIPRO,
      count: rows.length,
      products: rows.map(r => ({
        code: r.code,
        name: r.name,
        times_ordered: r.times_ordered,
        last_order: r.last_order,
      })),
    };
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
    console.log(`✓ ${rows.length} products snapshot → ${OUT}`);
  } finally {
    await conn.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
