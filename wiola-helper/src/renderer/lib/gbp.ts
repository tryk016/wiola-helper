// Client-side mirror of system/math.js so the draft editor can preview GBP
// amounts live as the user types, WITHOUT a round-trip to the main process.
// The authoritative recompute still happens in main on save (queue:editDraft),
// using the same formulas — so preview === saved.

export function roundHalfUp(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9) / f;
}

// Historical-imitation rounding: pallets & samples → 2 dp, everything else → 3 dp.
export function rateDecimalPlaces(line: {
  is_pallet?: boolean;
  is_sample?: boolean;
  unit_pln?: number;
  ewi_sku?: string;
}): number {
  const sku = line.ewi_sku || '';
  if (line.is_pallet || /^Pallet$/i.test(sku) || sku === '__PALLET__') return 2;
  if (line.is_sample === true || line.unit_pln === 1.0 || sku === '__SAMPLE__') return 2;
  return 3;
}

export interface GbpLineInput {
  ewi_sku?: string;
  qty: number;
  total_pln: number;
  is_pallet?: boolean;
  is_sample?: boolean;
}

// qty here is qty_ewi (== qty_kreisel for Polish invoices), total_pln is the line total.
export function lineGbp(line: GbpLineInput, hmrcRate: number): { rate_gbp: number; amount_gbp: number } {
  const qty = Number(line.qty) || 0;
  const total = Number(line.total_pln) || 0;
  if (!qty || !hmrcRate) return { rate_gbp: 0, amount_gbp: 0 };
  const pln_per_ewi = total / qty;
  const dp = rateDecimalPlaces({ ...line, unit_pln: pln_per_ewi });
  const rate_gbp = roundHalfUp(pln_per_ewi / hmrcRate, dp);
  const amount_gbp = roundHalfUp(qty * rate_gbp, 2);
  return { rate_gbp, amount_gbp };
}
