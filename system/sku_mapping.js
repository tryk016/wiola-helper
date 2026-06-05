// Kreisel description → EWI Pro SKU mapping + fuzzy suggestion engine.
//
// Mapping is conservative: known descriptions only. Unknown → ASK, never auto-guess.
// Fuzzy engine reads ewi_pro_products.json (snapshot from dist) to suggest matches.

const fs = require('fs');
const path = require('path');

// === Confirmed mappings (Kreisel raw description → EWI Pro Item name) ===
// Names match EWI Pro production QBO (verified from 16 historical invoices 2026-06-04).
//
// Konwencje (zatwierdzone z Patrykiem):
//   • Pigmenty: PIGMENT-D-XXX (uppercase, BEZ suffix "1L")
//   • EWI-269 zostaje z "25KG" suffix
//   • Warianty grain size (1A, 1.5A, 2A, 3A) i baza (A vs D) to ODDZIELNE produkty
//   • Kreisel "SB" w opisie = ich opakowanie, EWI dash format = EWI-Store opakowanie (mapuje na nasze)
const EXACT_MAP = {
  // Tynki silikonowe EWI-075 (różne grain sizes)
  'EWIPRO NANOTYNK EWI-075 SB 1,0': 'EWI-075-1A',
  'EWIPRO NANOTYNK EWI-075 SB 1,5': 'EWI-075-1.5A',
  'EWIPRO NANOTYNK EWI-075 SB 2,0': 'EWI-075-2A',
  'EWIPRO NANOTYNK EWI-075 SB 3,0': 'EWI-075-3A',
  'EWIPRO NANOTYNK EWI-075 SB 0,5': 'EWI-075-0.5A',
  // Basecoaty
  'EWIPRO STYRLEP-B 225 EWI-225 25KG': 'EWI-225 25KG',
  'EWI-212 25KG': 'EWI-212',
  'EWIPRO TYNK MASZYNOWY LEKKI 502L EWI-269 25KG': 'EWI-269 25KG',
  // Pigmenty — wszystkie WIELKIMI literami, bez suffix
  'PIGMENT-D-11 IL': 'PIGMENT-D-11',
  'PIGMENT-D-11 1L': 'PIGMENT-D-11',
  'Pigment-D-11 1L': 'PIGMENT-D-11',
  'PIGMENT-D-100 IL': 'PIGMENT-D-100',
  'PIGMENT-D-100 1L': 'PIGMENT-D-100',
  'PIGMENT-D-104 IL': 'PIGMENT-D-104',
  'PIGMENT-D-104 1L': 'PIGMENT-D-104',
  'PIGMENT-D-110 IL': 'PIGMENT-D-110',
  'PIGMENT-D-110 1L': 'PIGMENT-D-110',
  'PIGMENT-D-113 IL': 'PIGMENT-D-113',
  'PIGMENT-D-113 1L': 'PIGMENT-D-113',
  'PIGMENT-D-200 IL': 'PIGMENT-D-200',
  'PIGMENT-D-200 1L': 'PIGMENT-D-200',
  'PIGMENT-D-204 IL': 'PIGMENT-D-204',
  'PIGMENT-D-213 IL': 'PIGMENT-D-213',
  'PIGMENT-D-300 IL': 'PIGMENT-D-300',
  'PIGMENT-D-300 1L': 'PIGMENT-D-300',
  'PIGMENT-D-305 IL': 'PIGMENT-D-305',
  'PIGMENT-D-802 IL': 'PIGMENT-D-802',
  'PIGMENT-D-802 1L': 'PIGMENT-D-802',
  'PIGMENT-D-900 IL': 'PIGMENT-D-900',
  'PIGMENT-D-902 IL': 'PIGMENT-D-902',
  'PIGMENT-D-905 IL': 'PIGMENT-D-905',
  'PIGMENT-D-907 IL': 'PIGMENT-D-907',
  // Specjalne — używają wbudowanych Items "Pallet" / "EWI Sample"
  'PALETA EUR.': '__PALLET__',
  'PALETA EUR': '__PALLET__',
  'GOTOWA GŁADŹ POLIMEROWA': '__SAMPLE__',
  'GOTOWA GLADZ POLIMEROWA': '__SAMPLE__',
  'RENO SZPACHLA REMONTOWA 952': '__SAMPLE__',
};

// Tolerant fuzzy fallbacks. Helper: extract baza A/D from end of description.
// "EWIPRO NANOTYNK EWI-075 SB 1,5 BAZA A" → "A"
// "EWIPRO NANOTYNK EWI-075 SB 1,0 BAZAD" → "D" (no-space OCR artifact)
function baza(s) {
  const m = /BAZ\s*A?\s*([AD])\b/i.exec(s);
  return m ? m[1].toUpperCase() : 'A'; // default A if not specified
}

const PATTERN_MAP = [
  // EWI-075 silikonowe — grain size × baza (A/D) — różne SKU per kombinacja
  { test: /^EWIPRO NANOTYNK EWI-075 SB 0,5/i,  sku: s => `EWI-075-0.5${baza(s)}` },
  { test: /^EWIPRO NANOTYNK EWI-075 SB 1,0/i,  sku: s => `EWI-075-1${baza(s)}` },
  { test: /^EWIPRO NANOTYNK EWI-075 SB 1,5/i,  sku: s => `EWI-075-1.5${baza(s)}` },
  { test: /^EWIPRO NANOTYNK EWI-075 SB 2,0/i,  sku: s => `EWI-075-2${baza(s)}` },
  { test: /^EWIPRO NANOTYNK EWI-075 SB 3,0/i,  sku: s => `EWI-075-3${baza(s)}` },
  // EWI-076 bio-silikonowe
  { test: /^EWIPRO PREMIUM BIO SILICONE RENDER EWI-076 SB 1,0/i,  sku: s => `EWI-076-1${baza(s)}` },
  { test: /^EWIPRO PREMIUM BIO SILICONE RENDER EWI-076 SB 1,5/i,  sku: s => `EWI-076-1.5${baza(s)}` },
  { test: /^EWIPRO PREMIUM BIO SILICONE RENDER EWI-076 SB 2,0/i,  sku: s => `EWI-076-2${baza(s)}` },
  { test: /^EWIPRO PREMIUM BIO SILICONE RENDER EWI-076 SB 3,0/i,  sku: s => `EWI-076-3${baza(s)}` },
  // EWI-077 NanoDrex
  { test: /^EWIPRO.*EWI-077.*SB 1,0/i,         sku: s => `EWI-077-1${baza(s)}` },
  { test: /^EWIPRO.*EWI-077.*SB 1,5/i,         sku: s => `EWI-077-1.5${baza(s)}` },
  // EWI-010 acrylic
  { test: /^EWIPRO.*EWI-010.*SB 1,0/i,         sku: s => `EWI-010-1${baza(s)}` },
  { test: /^EWIPRO.*EWI-010.*SB 1,5/i,         sku: s => `EWI-010-1.5${baza(s)}` },
  // EWI-040 silikonowo-silikatowe
  { test: /^EWIPRO.*EWI-040.*SB 1,5/i,         sku: s => `EWI-040-1.5${baza(s)}` },
  // Paints
  // Paint EWI-005 — OCR sometimes gluesz "5L" with "BAZA" → "SLBAZAA". Tolerate both forms.
  { test: /^EWIPRO FARBA SILIKONOWA EWI-005.*1\s*5L/i, sku: (s) => `EWI-005-15${baza(s)} 15L` },
  { test: /^EWIPRO FARBA SILIKONOWA EWI-005.*S?L?\s*BAZA?\s*([AD])/i, sku: (s, m) => `EWI-005-5${(m[1] || baza(s)).toUpperCase()}` },
  { test: /^EWIPRO PREMIUM BIO SILICONE PAINT EWI-006.*15L/i, sku: (s) => `EWI-006-15${baza(s)}` },
  { test: /^EWIPRO.*FARBA SILIKATOWA EWI-002/i,      sku: 'EWI-002' },
  // Basecoaty
  { test: /^EWIPRO STYRLEP-B 225 EWI-225/i,    sku: 'EWI-225 25KG' },
  { test: /^EWIPRO TYNK MASZYNOWY.*EWI-269/i,  sku: 'EWI-269 25KG' },
  { test: /^EWI-212/i,                          sku: 'EWI-212' },
  { test: /^EWIPRO.*EWI-220/i,                  sku: 'EWI-220 25KG' },
  { test: /^EWIPRO.*EWI-260/i,                  sku: 'EWI-260' },
  { test: /^EWIPRO.*EWI-065/i,                  sku: 'EWI-065 25KG' },
  // Primery
  { test: /^EWIPRO TOPCOAT PRIMER EWI-333.*20\s*KG/i, sku: 'EWI-333-20' },
  { test: /^EWIPRO TOPCOAT PRIMER EWI-333.*7\s*KG/i,  sku: 'EWI-333-7' },
  { test: /^EWIPRO.*EWI-310/i,                  sku: 'EWI-310 20KG' },
  { test: /^EWIPRO.*EWI-301/i,                  sku: 'EWI-301' },
  { test: /^EWIPRO.*EWI-302/i,                  sku: 'EWI-302' },
  { test: /^EWIPRO.*EWI-303/i,                  sku: 'EWI-303 Gel primer 5L' },
  { test: /^EWIPRO.*EWI-330/i,                  sku: 'EWI-330-20' },
  // Mosaic line — MOZATYNK-S 051 BAZA II NATURAL NAT XX 2,5KG → Mozatynk-S 051 BAZA II NAT XX 2.5kg
  { test: /^MOZATYNK-S\s*051\s*BAZA\s*II\s*NATURAL\s*NAT\s*0?(\d{1,2})/i,
    sku: (s, m) => `Mozatynk-S 051 BAZA II NAT ${String(parseInt(m[1])).padStart(2, '0')} 2.5kg` },
  { test: /^MOZATYNK-S\s*050\s*BAZA\s*I\b/i,           sku: 'Mozatynk-S 050 Baza I 6.5KG' },
  // EWI-050 mosaic renders (kolorowe)
  { test: /^EWI-050.*CCCC/i,                    sku: 'EWI-050-MOZ.CCCC 1,8 MM 25KG' },
  { test: /^EWI-050.*DDDD/i,                    sku: 'EWI-050-MOZ.DDDD 1,8 MM 25KG' },
  // Etykiety / labels
  { test: /^ETYKIETA EWI\s*050/i,               sku: 'Label EWI-050 25KG' },
  // Wiaderka / buckets (12L → BUCKET 10L jako najbliższe, lub osobny SKU?)
  { test: /^WIADERKO\s*12L/i,                   sku: 'BUCKET 10L' },     // 12L = bucket family (sprawdź z księgową)
  { test: /^WIADERKO\s*10L/i,                   sku: 'BUCKET 10L' },
  { test: /^WIADERKO\s*3L/i,                    sku: 'BUCKET 3L' },
  // Pigmenty — uniform PIGMENT-D-XXX
  { test: /^PIGMENT-D-?(\d+)/i,                 sku: (s, m) => `PIGMENT-D-${m[1]}` },
  { test: /^D-(\d+)\b/i,                        sku: (s, m) => `PIGMENT-D-${m[1]}` },
  // Specials
  { test: /^PALETA/i,                           sku: '__PALLET__' },
  { test: /^GOTOWA G[ŁL]AD[ZŹ]/i,               sku: '__SAMPLE__' },
  { test: /^RENO SZPACHLA/i,                    sku: '__SAMPLE__' },
];

function mapSku(rawDesc) {
  const s = String(rawDesc || '').trim();
  if (EXACT_MAP[s]) return EXACT_MAP[s];
  for (const { test, sku } of PATTERN_MAP) {
    const m = test.exec(s);
    if (m) {
      // Pass BOTH the raw description string and the regex match — sku function can use either
      return typeof sku === 'function' ? sku(s, m) : sku;
    }
  }
  return null;
}

// === Fuzzy suggestions from ewi_pro_products.json ===

let _productsCache = null;
function loadProducts() {
  if (_productsCache) return _productsCache;
  const p = path.join(__dirname, 'ewi_pro_products.json');
  if (!fs.existsSync(p)) return [];
  _productsCache = JSON.parse(fs.readFileSync(p, 'utf8')).products || [];
  return _productsCache;
}

function tokenize(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[ŁĄĆĘŃÓŚŻŹ]/g, c => ({ Ł:'L', Ą:'A', Ć:'C', Ę:'E', Ń:'N', Ó:'O', Ś:'S', Ż:'Z', Ź:'Z' }[c] || c))
    .split(/[\s\-_,;:/.()]+/)
    .filter(t => t.length >= 2 && !/^\d{1,2}$/.test(t));
}

function score(rawDesc, product) {
  const a = new Set(tokenize(rawDesc));
  const b = new Set([...tokenize(product.code), ...tokenize(product.name)]);
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  // also reward direct substring of code in raw
  const code = product.code.toUpperCase();
  const raw = String(rawDesc).toUpperCase();
  let bonus = raw.includes(code) ? 5 : 0;
  // EWI-XXX number match: pull "EWI-XXX" from raw, compare with code
  const m = /EWI-?(\d{2,4})/i.exec(rawDesc);
  if (m && code.includes(`EWI-${m[1]}`)) bonus += 8;
  return common + bonus;
}

function suggest(rawDesc, n = 5) {
  const products = loadProducts();
  if (!products.length) return [];
  return products
    .map(p => ({ ...p, _score: score(rawDesc, p) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, n);
}

module.exports = { mapSku, suggest, loadProducts, EXACT_MAP };

if (require.main === module) {
  const desc = process.argv.slice(2).join(' ');
  if (!desc) { console.log('Usage: node sku_mapping.js <Kreisel description>'); process.exit(1); }
  const direct = mapSku(desc);
  console.log(`Description: "${desc}"`);
  console.log(`Direct match: ${direct || '(none)'}`);
  console.log(`\nFuzzy suggestions:`);
  suggest(desc).forEach(s => console.log(`  ${s.code.padEnd(20)}  ${s.name.padEnd(50)}  (used ${s.times_ordered}× score=${s._score})`));
}
