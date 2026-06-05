# Kreisel → EWI Pro → EWI Store Automation

## Sandbox setup
- Intuit Developer app: **single app**, two sandbox companies under same dev account.
- Sandbox company IDs (realm IDs):
  - **EWI Pro Sandbox** = `9341457208649326`
  - **EWI Store Sandbox** = `9341457208672947`
- User cannot rename sandbox companies in Intuit UI (limitation noted).
- Refresh tokens pending — Intuit auth had issues during initial attempt; will retry via `qbo_oauth_helper.js`.

## Decisions (locked)
- Mapping table SKU: scope = SKUs present in 5 fixtures only (sandbox phase). STOP if new SKU encountered.
- Pigments: not needed for test fixtures (user confirmed).
- 1,00 PLN positions: samples — convert normally.
- Rounding: rate 3 dp, amount 2 dp, half-up (default).
- PVA Import VAT: each Kreisel Bill line uses tax code `PVA Import 20.0%`. QBO auto-generates +/- 20% VAT pair netting to zero. Total = subtotal.
- Bill ExchangeRate field = `1 / hmrc_rate` (confirmed from screenshot: `0.2034877 = 1/4.9143` for June 2026).

## Test fixtures (from spec section 7)
| EWI Pro inv | Kreisel inv | Container | Issued | HMRC month | Rate |
|-------------|-------------|-----------|--------|------------|------|
| 4703 | 11/2026/EXP | ECMU5405966 | 2026-01-26 | Feb 2026 | 4.8397 |
| 4745 | 38/2026/EXP | CGMU8514020 | 2026-02-16 | Feb 2026 | 4.8397 |
| 4785 | 55/2026/EXP | (unknown) | 2026-03-10 | Mar 2026 | 4.8371 |
| 4817 | 82/2026/EXP | FFAU5409519 | 2026-04-02 | Apr 2026 | 4.9305 |
| 4993 | 201/2026/EXP | CMAU6487821 | 2026-05-29 | Jun 2026 | 4.9143 |
