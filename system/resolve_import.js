// Hybrid resolver: Kreisel invoice → HMRC month.
//
// PRIMARY PATH (works without MySQL — for colleague's PC):
//   • Use container number from Kreisel PDF (OCR'd "Kontener: XXX" field)
//   • Look up Magemar Excel → ATA Tilbury → month(ATA)
//
// FALLBACK PATH (Patryk's PC with MySQL):
//   • If PDF has no container (truck shipment), query MySQL purchase_orders_deliveries
//     to find truck_reg_number / delivery_date
//   • If MySQL unavailable → predict via invoice_date + 3d (truck) or +13d (container)
//
// MySQL is OPTIONAL — set MYSQL_PASSWORD in .env to enable.

const path = require('path');
const { lookupContainer, isContainerNumber } = require('./magemar_lookup');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let mysql = null;
function getMysql() {
  if (mysql) return mysql;
  try { mysql = require('mysql2/promise'); }
  catch (e) { mysql = false; }
  return mysql;
}

function mysqlAvailable() {
  return !!(process.env.MYSQL_PASSWORD && getMysql());
}

const SUPPLIER_ID_EWIPRO = 2884;

function pad2(n) { return String(n).padStart(2, '0'); }

// Predict HMRC month from invoice_date + transit days. Includes month-boundary buffer.
function predictFromInvoiceDate(base, invoiceDateIso, transitDays, container, magResult) {
  if (!invoiceDateIso) {
    return { ...base, status: 'no_data', message: 'No invoice date for prediction.' };
  }
  const invDate = new Date(invoiceDateIso + 'T00:00:00Z');
  const eta = new Date(invDate.getTime() + transitDays * 86400 * 1000);
  const provDay = eta.getUTCDate();
  const provMonth = `${eta.getUTCFullYear()}-${pad2(eta.getUTCMonth() + 1)}`;
  const isAmbiguous = provDay <= 3 || provDay >= 28;
  const reason = container ? 'container_not_in_magemar' : 'truck_pending_delivery';
  const predictedAta = `${eta.getUTCFullYear()}-${pad2(eta.getUTCMonth() + 1)}-${pad2(provDay)}`;
  if (isAmbiguous) {
    const altDate = provDay <= 3
      ? new Date(eta.getTime() - 7 * 86400 * 1000)
      : new Date(eta.getTime() + 7 * 86400 * 1000);
    const altMonth = `${altDate.getUTCFullYear()}-${pad2(altDate.getUTCMonth() + 1)}`;
    return {
      ...base, status: 'ambiguous_month', confidence: 'predicted',
      source: `invoice_plus_${transitDays}d`,
      hmrc_month: provMonth, alternative_hmrc_month: altMonth,
      predicted_ata_uk: predictedAta, reason: 'month_boundary_buffer',
      container, eta_uk_magemar: magResult && magResult.eta_uk,
      message: `Predicted ATA day ${provDay} near month boundary — could be ${provMonth} or ${altMonth}.`,
    };
  }
  return {
    ...base, status: 'ok', confidence: 'predicted',
    source: `invoice_plus_${transitDays}d`,
    hmrc_month: provMonth, predicted_ata_uk: predictedAta,
    reason, container, eta_uk_magemar: magResult && magResult.eta_uk,
  };
}

function heuristicHmrcMonth(deliveryDate) {
  // For truck shipments: customs cleared shortly before warehouse receipt.
  // If delivery day ≤ 3 → previous month (customs cleared late prev month).
  if (!(deliveryDate instanceof Date)) return null;
  const day = deliveryDate.getUTCDate();
  let y = deliveryDate.getUTCFullYear();
  let m = deliveryDate.getUTCMonth() + 1;
  if (day <= 3) {
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return `${y}-${pad2(m)}`;
}

async function getPodRow(kreiselInvoiceRef) {
  if (!mysqlAvailable()) return [];
  const ref = kreiselInvoiceRef.replace(/^FSE-/i, '');
  const [nr, year] = ref.split('/');
  // Kreisel invoice numbers in MySQL `purchase_orders_deliveries.invoice_number_supplier`
  // are entered either WITH prefix ("FSE-139/2026/EXP") or WITHOUT ("139/2026/EXP"),
  // depending on which operator typed them. Match both via OR.
  const likeWithFse = `FSE-${nr}/${year}/%`;
  const likeNoFse   = `${nr}/${year}/%`;
  const conn = await getMysql().createConnection({
    host: process.env.MYSQL_HOST || '10.1.20.15',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DB || 'dist',
    user: process.env.MYSQL_USER || 'pbaranai',
    password: process.env.MYSQL_PASSWORD,
  });
  try {
    const [rows] = await conn.execute(
      `SELECT id, branch_id, invoice_number_supplier, invoice_date, delivery_date,
              delivered, delivered_stamp, truck_reg_number,
              FROM_UNIXTIME(invoice_date) AS inv_dt,
              FROM_UNIXTIME(delivery_date) AS deliv_dt
         FROM purchase_orders_deliveries
        WHERE supplier_id=?
          AND (invoice_number_supplier LIKE ? OR invoice_number_supplier LIKE ?)
        ORDER BY invoice_date DESC`,
      [SUPPLIER_ID_EWIPRO, likeWithFse, likeNoFse]
    );
    return rows;
  } finally {
    await conn.end();
  }
}

/**
 * @param {string|Object} kreiselRefOrParsed  Either "201/2026/EXP" string OR parsed Kreisel object
 *                                            { invoice_no, issue_date, container, kreisel_ref }
 * @returns {Object} resolution result
 */
async function resolveImport(kreiselRefOrParsed) {
  const isParsed = typeof kreiselRefOrParsed === 'object';
  const kreiselRef = isParsed
    ? (kreiselRefOrParsed.kreisel_ref || `FSE-${kreiselRefOrParsed.invoice_no}`)
    : kreiselRefOrParsed;
  const pdfContainer = isParsed ? (kreiselRefOrParsed.container || null) : null;
  const pdfIssueDate = isParsed ? (kreiselRefOrParsed.issue_date || null) : null;

  // Try MySQL POD lookup; if MySQL not configured, work with PDF data only
  const rows = await getPodRow(kreiselRef);
  const hasMysql = rows.length > 0;

  // === BRANCH A: No MySQL → use PDF container directly ===
  if (!hasMysql) {
    if (!pdfContainer && !pdfIssueDate) {
      return {
        status: 'no_data',
        kreisel_ref: kreiselRef,
        message: 'No MySQL access AND no container/issue_date in PDF. Cannot resolve.',
      };
    }
    const base = {
      kreisel_ref: kreiselRef,
      truck_reg: pdfContainer || '(truck — no container in PDF)',
      source_data: 'pdf_only',
      invoice_date_pl: pdfIssueDate,
    };

    if (pdfContainer && isContainerNumber(pdfContainer)) {
      const mag = await lookupContainer(pdfContainer);
      if (mag.status === 'ok') {
        return {
          ...base, status: 'ok', confidence: 'confirmed',
          source: 'magemar_ata', hmrc_month: mag.hmrc_month,
          ata_uk: mag.ata_uk, atd_gdansk: mag.atd_gdansk,
          actual_delivery_magemar: mag.actual_delivery, container: pdfContainer,
        };
      }
      // Container not in Magemar → predict via invoice_date + 13d (with month-boundary buffer)
      return predictFromInvoiceDate(base, pdfIssueDate, 12, pdfContainer, mag);
    }
    // No container in PDF AND no MySQL row → truck shipment, can't predict.
    // For trucks we ALWAYS need MySQL delivery_date (hard data, not heuristic).
    // Hold the invoice until the warehouse registers the PO.
    return {
      ...base,
      status: 'ambiguous_month',
      confidence: 'predicted',
      source: 'no_mysql_no_container',
      hmrc_month_options: [],
      pending_message: 'Truck — brak wpisu w MySQL dla tego numeru faktury. Sprawdź czy magazyn zarejestrował przyjęcie towaru, lub czy numer faktury w MySQL jest zgodny (z lub bez prefiksu FSE-).',
      reason: 'no_mysql_pod',
    };
  }

  // === BRANCH B: MySQL data available (original logic) ===
  // Dedupe identical PODs (same truck_reg + delivery_date + invoice_date) — common in dist when entry
  // was made twice. Block only if PODs disagree on critical fields.
  if (rows.length > 1) {
    const fingerprint = r => `${(r.truck_reg_number || '').trim()}|${r.delivery_date}|${r.invoice_date}|${r.branch_id}`;
    const uniq = [...new Map(rows.map(r => [fingerprint(r), r])).values()];
    if (uniq.length === 1) {
      rows.length = 0; rows.push(uniq[0]);  // collapse to single
    } else {
      return {
        status: 'pod_multiple',
        kreisel_ref: kreiselRef,
        candidates: rows.length,
        message: `Found ${rows.length} different PODs for same FSE — check dist for genuine split shipment.`,
        details: uniq.map(r => ({ id: r.id, branch_id: r.branch_id, truck_reg: r.truck_reg_number, delivery_date: r.deliv_dt })),
      };
    }
  }
  const r = rows[0];
  const truckReg = (r.truck_reg_number || '').trim();

  const base = {
    kreisel_ref: kreiselRef,
    pod_id: r.id,
    branch_id: r.branch_id,
    invoice_number_supplier: r.invoice_number_supplier,
    truck_reg: truckReg,
    invoice_date_pl: r.inv_dt,
    delivery_date_uk: r.deliv_dt,
  };

  // Path 1: container — Magemar ATA (hard data, preferred)
  if (isContainerNumber(truckReg)) {
    const mag = await lookupContainer(truckReg);
    if (mag.status === 'ok') {
      return {
        ...base,
        status: 'ok',
        confidence: 'confirmed',
        source: 'magemar_ata',
        hmrc_month: mag.hmrc_month,
        ata_uk: mag.ata_uk,
        atd_gdansk: mag.atd_gdansk,
        actual_delivery_magemar: mag.actual_delivery,
      };
    }
    // Path 1b: container known but not in Magemar yet (or ATA pending).
    // Provisional: assume arrival = invoice_date + 12 days (typical Kreisel→UK transit).
    // Empirically derived from 612 historical containers (median 14d, but +12d gives
    // best "same month" HMRC coverage at 88%, vs 85% at +13d/+14d).
    //
    // MONTH BOUNDARY HANDLING:
    //   Predicted ATA day ≤ 3 OR day ≥ 28 → "ambiguous_month" — could be M or M±1.
    //   Such drafts go to "wstrzymane" (held) — operator must wait for Magemar update.
    const provisionalEta = new Date(r.invoice_date * 1000 + 12 * 86400 * 1000);
    const provDay = provisionalEta.getUTCDate();
    const provMonth = `${provisionalEta.getUTCFullYear()}-${pad2(provisionalEta.getUTCMonth() + 1)}`;
    const reason = mag.status === 'not_found' ? 'container_not_in_magemar'
                 : mag.status === 'no_ata'   ? 'container_no_ata_yet'
                 : `magemar_${mag.status}`;
    const isAmbiguous = provDay <= 3 || provDay >= 28;
    if (isAmbiguous) {
      // Compute both possible months for operator to see
      const altDate = provDay <= 3
        ? new Date(provisionalEta.getTime() - 7 * 86400 * 1000)  // could have arrived end of prev month
        : new Date(provisionalEta.getTime() + 7 * 86400 * 1000); // could arrive start of next month
      const altMonth = `${altDate.getUTCFullYear()}-${pad2(altDate.getUTCMonth() + 1)}`;
      return {
        ...base,
        status: 'ambiguous_month',
        confidence: 'predicted',
        source: 'invoice_plus_13d',
        hmrc_month: provMonth,
        alternative_hmrc_month: altMonth,
        predicted_ata_uk: `${provisionalEta.getUTCFullYear()}-${pad2(provisionalEta.getUTCMonth() + 1)}-${pad2(provDay)}`,
        reason: 'month_boundary_buffer',
        eta_uk_magemar: mag.eta_uk || null,
        container: truckReg,
        message: `Predicted ATA day ${provDay} is near month boundary — could be ${provMonth} or ${altMonth}. Wait for Magemar update.`,
      };
    }
    return {
      ...base,
      status: 'ok',
      confidence: 'predicted',
      source: 'invoice_plus_13d',
      hmrc_month: provMonth,
      predicted_ata_uk: `${provisionalEta.getUTCFullYear()}-${pad2(provisionalEta.getUTCMonth() + 1)}-${pad2(provDay)}`,
      reason,
      eta_uk_magemar: mag.eta_uk || null,
      container: truckReg,
    };
  }

  // Path 2: truck — MySQL delivery_date heuristic (or invoice_date + 3 for trucks)
  if (r.delivery_date) {
    const deliveryDate = new Date(r.delivery_date * 1000);
    return {
      ...base,
      status: 'ok',
      confidence: 'confirmed',
      source: 'mysql_delivery_date',
      hmrc_month: heuristicHmrcMonth(deliveryDate),
      notes: 'Truck shipment — month(delivery_date), day≤3 → prev month.',
    };
  }
  // Truck not yet delivered — DO NOT predict +3d. For trucks the HMRC month
  // must come from MySQL delivery_date (hard data), not heuristic. Hold the
  // invoice until the warehouse marks it as delivered.
  return {
    ...base,
    status: 'ambiguous_month',
    confidence: 'predicted',
    source: 'mysql_pending_delivery',
    hmrc_month: undefined,
    hmrc_month_options: [],
    pending_message: `Truck ${truckReg || '(brak rej.)'} — nie ma jeszcze daty dostawy w MySQL (POD #${r.id}). Czeka aż truck dotrze do magazynu i ktoś go zaewidencjonuje.`,
    reason: 'truck_pending_delivery',
    truck_reg: truckReg,
  };
}

module.exports = { resolveImport, heuristicHmrcMonth };

if (require.main === module) {
  (async () => {
    const ref = process.argv[2];
    if (ref) {
      console.log(JSON.stringify(await resolveImport(ref), null, 2));
      return;
    }
    // batch test on all 5 fixtures
    const tests = ['11/2026/EXP', '38/2026/EXP', '55/2026/EXP', '82/2026/EXP', '201/2026/EXP'];
    for (const t of tests) {
      const r = await resolveImport(t);
      console.log(`${t.padEnd(16)} status=${r.status.padEnd(28)} hmrc=${r.hmrc_month || '-'}  via=${r.source || '-'}  truck/cont=${r.truck_reg || '-'}`);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
