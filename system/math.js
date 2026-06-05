// Core math: convert Kreisel PLN lines → EWI Pro GBP lines using HMRC rate.
//
// Per spec sec 2.1:
//   rate_GBP   = round(pln_unit_per_ewi_unit / hmrc_rate, 3)
//   amount_GBP = round(qty_ewi * rate_GBP, 2)
//
// Pigments: qty changes between Kreisel and EWI Pro, so we compute
//   pln_unit_per_ewi_unit = (qty_kreisel * unit_pln) / qty_ewi
// which collapses to `unit_pln` for non-pigment lines (qty_kreisel == qty_ewi).

function roundHalfUp(n, dp) {
  // FP-precision-safe rounding: add tiny epsilon to handle cases like
  //   4005.375 * 100 = 400537.499... (should be 400537.5)
  // which would otherwise round to 4005.37 instead of 4005.38.
  const factor = Math.pow(10, dp);
  return Math.sign(n) * Math.round(Math.abs(n) * factor + 1e-9) / factor;
}

// Historical-imitation rounding rule (matches EWI Pro past practice):
//   • Pallet rates → 2 decimal places (e.g. 17.56 not 17.563)
//   • Sample items (unit_pln == 1.00 PLN) → 2 dp (e.g. 0.21 not 0.207)
//   • Everything else (EWI-XXX, Pigments) → 3 dp (precision matters at large qty)
function rateDecimalPlaces(line) {
  if (line.is_pallet || /^Pallet$/i.test(line.ewi_sku) || line.ewi_sku === '__PALLET__') return 2;
  if (line.is_sample === true || line.unit_pln === 1.00 || line.ewi_sku === '__SAMPLE__') return 2;
  return 3;
}

function buildSaleLines(kreiselInput, hmrcRate) {
  return kreiselInput.lines.map(l => {
    const total_pln_line = l.qty_kreisel * l.unit_pln;
    const pln_unit_per_ewi = total_pln_line / l.qty_ewi;
    const dp = rateDecimalPlaces(l);
    const rate_gbp = roundHalfUp(pln_unit_per_ewi / hmrcRate, dp);
    const amount_gbp = roundHalfUp(l.qty_ewi * rate_gbp, 2);
    return {
      ewi_sku: l.ewi_sku,
      qty: l.qty_ewi,
      rate_gbp,
      amount_gbp,
      total_pln_line,
      is_pigment: !!l.is_pigment,
      is_sample: !!l.is_sample,
    };
  });
}

function buildEwiproInvoice(kreiselInput, hmrcRate, vatRate = 0.20) {
  const lines = buildSaleLines(kreiselInput, hmrcRate);
  const subtotal = roundHalfUp(lines.reduce((s, l) => s + l.amount_gbp, 0), 2);
  const vat_total = roundHalfUp(subtotal * vatRate, 2);
  const total = roundHalfUp(subtotal + vat_total, 2);
  const total_pln_kreisel = kreiselInput.lines.reduce(
    (s, l) => s + l.qty_kreisel * l.unit_pln,
    0
  );
  return {
    kreisel_ref: `FSE-${kreiselInput.kreisel_invoice}`,
    hmrc_rate: hmrcRate,
    pln_to_gbp_inverse: roundHalfUp(1 / hmrcRate, 7),
    lines,
    subtotal,
    vat_total,
    total,
    total_pln_kreisel: roundHalfUp(total_pln_kreisel, 2),
  };
}

module.exports = { roundHalfUp, rateDecimalPlaces, buildSaleLines, buildEwiproInvoice };
