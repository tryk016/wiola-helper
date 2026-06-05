// LLM parser for Kreisel invoices — Anthropic Claude with vision/PDF.
// Drop-in replacement for parse_kreisel_pl.js (same output structure).
//
// Advantages over Tesseract+regex:
//   • Handles multi-line descriptions natively
//   • Understands "BAZA A" vs "BAZA D" semantically
//   • Robust to OCR artifacts (no more "SLBAZAA" debugging)
//   • Maps Kreisel descriptions to canonical EWI Pro Item names with full context
//
// Cost: ~$0.005-0.01 per invoice with Claude 3.5 Sonnet, ~$0.001 with Haiku.
// Speed: ~3-5s per invoice (vs 10-30s for Tesseract).

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { suggest, loadProducts } = require('./sku_mapping');

// pdf-parse v2 exports a class — instantiate with {data: buffer}, then .getText()
let _PDFParseClass;
async function extractPdfText(pdfBytes) {
  if (!_PDFParseClass) _PDFParseClass = require('pdf-parse').PDFParse;
  const p = new _PDFParseClass({ data: pdfBytes });
  const result = await p.getText();
  return (result && result.text) || '';
}

const MODEL = 'claude-sonnet-4-5-20250929'; // default — accurate, ~$3/M input + $15/M output

// Read API key directly from .env (dotenv has issues with $ chars in MYSQL_PASSWORD)
function readApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return null;
  const text = fs.readFileSync(envPath, 'utf8');
  const m = /^ANTHROPIC_API_KEY=(.+)$/m.exec(text);
  if (!m) return null;
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

const _client = () => {
  const apiKey = readApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not found in .env');
  return new Anthropic({ apiKey });
};

// Known EWI Pro Item names — given to LLM as ground truth for sku field.
const KNOWN_ITEM_NAMES = [
  // Basecoaty
  'EWI-212', 'EWI-220 25KG', 'EWI-225 25KG', 'EWI-226 25KG', 'EWI-260', 'EWI-269 25KG',
  // Tynki silikonowe 075 (różne grain, baza A/D)
  'EWI-075-0.5A', 'EWI-075-1A', 'EWI-075-1.5A', 'EWI-075-1D', 'EWI-075-1.5D', 'EWI-075-2A', 'EWI-075-3A',
  // Bio-silicone 076
  'EWI-076-1A', 'EWI-076-1.5A', 'EWI-076-1.5D', 'EWI-076-3A',
  // NanoDrex 077
  'EWI-077 1.5A',
  // Acrylic 010 + Silicone-silicate 040
  'EWI-010-1.5A', 'EWI-010 SB 1A', 'EWI-040-1.5A',
  // Concrete 055
  'EWI-055-A',
  // OCDC 065
  'EWI-065 25KG',
  // Paints
  'EWI-002', 'EWI-005-5A', 'EWI-005-15A', 'EWI-005-15D 15L', 'EWI-006-15A',
  // Primery
  'EWI-301', 'EWI-302', 'EWI-303 Gel primer 5L', 'EWI-310 20KG', 'EWI-330-20', 'EWI-333-7', 'EWI-333-20',
  // Pigmenty (uniform PIGMENT-D-XXX, bez 1L)
  'PIGMENT-D-11', 'PIGMENT-D-100', 'PIGMENT-D-104', 'PIGMENT-D-110', 'PIGMENT-D-113',
  'PIGMENT-D-200', 'PIGMENT-D-204', 'PIGMENT-D-213', 'PIGMENT-D-300', 'PIGMENT-D-305',
  'PIGMENT-D-802', 'PIGMENT-D-900', 'PIGMENT-D-902', 'PIGMENT-D-905', 'PIGMENT-D-907',
  // Mosaic line — Mozatynk-S 051 BAZA II NAT 01..12
  'Mozatynk-S 051 BAZA II NAT 01 2.5kg', 'Mozatynk-S 051 BAZA II NAT 02 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 03 2.5kg', 'Mozatynk-S 051 BAZA II NAT 04 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 05 2.5kg', 'Mozatynk-S 051 BAZA II NAT 06 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 07 2.5kg', 'Mozatynk-S 051 BAZA II NAT 08 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 09 2.5kg', 'Mozatynk-S 051 BAZA II NAT 10 2.5kg',
  'Mozatynk-S 051 BAZA II NAT 11 2.5kg', 'Mozatynk-S 051 BAZA II NAT 12 2.5kg',
  'Mozatynk-S 050 Baza I 6.5KG',
  // EWI-050 mosaic kolorowe + buckets + labels
  'EWI-050-MOZ.CCCC 1,8 MM 25KG', 'EWI-050-MOZ.DDDD 1,8 MM 25KG',
  'BUCKET 3L', 'BUCKET 10L', 'Label EWI-050 25KG',
  // Specials
  '__PALLET__', '__SAMPLE__',
];

const SYSTEM_PROMPT = `Jesteś ekspertem od ekstrakcji danych z polskich faktur eksportowych Kreisla.
Z dostarczonego PDF wyciągasz strukturowane dane.

WAŻNE REGUŁY:
1. Faktura ma format "Faktura eksportowa VAT nr (S)FSE-XXX/YYYY/EXP". Wyciągnij invoice_no jako "XXX/YYYY/EXP".
2. Pole "Kontener" zawiera numer kontenera (4 wielkie litery + 7 cyfr, np. CMAU6487821). Jeśli brak, container=null (to truck shipment).
3. Daty w formacie YYYY/MM/DD.
4. Każda linia produktowa ma: numer kolejny, opis, PKWiU (np "20.30.12"), PCN/CN (np "32091000"), ilość, jednostka (SZT/KG), cena netto PLN, wartość netto PLN.
5. Opisy MOGĄ łamać się na wiele linii — sklejaj je w jeden raw_desc.

CO NIE JEST LINIĄ PRODUKTOWĄ (NIE wciągaj do lines[]):
   • "Forma płatności" / "Termin płatności" / "Sposób zapłaty" — np. "Przelew-90 2026-08-20" to termin płatności (90 dni, due date)
   • "Razem", "Suma", "Do zapłaty", "Razem do zapłaty", "Wartość netto", "VAT", "Wartość brutto" — to podsumowania na dole faktury
   • "INCOTERMS", "EXW", "FCA", "CIF" — warunki dostawy
   • Linie BEZ kodu PKWiU lub BEZ kodu PCN/CN — nie są pozycjami towarowymi
   • Komentarze, notatki, "Kontener:", "Magazyn:", "Spedytor:", numery referencyjne
   • Dane bankowe (IBAN, SWIFT, nazwa banku, numer konta)
   • Adresy nadawcy/odbiorcy
   • Stopka faktury (osoba wystawiająca, podpisy)

Linia produktowa Kreisla ZAWSZE ma kod PKWiU i kod PCN. Jeśli ich brak — to NIE jest produkt, NIE wciągaj do lines[].

MAPOWANIE SKU — Kreisel description → ewi_sku.
Korzystaj z KNOWN_ITEM_NAMES jako jedynego źródła prawdy dla pola ewi_sku.

POLSKIE NAZWY = ANGIELSKIE ITEMS:
   • ETYKIETA / WYKIETA (OCR literówka) = Label (etykieta)
   • WIADERKO / WIADRERKO (literówka) = BUCKET (pojemnik)
   • PALETA / PALETKA = Pallet

REGUŁY MAPOWANIA:
   • EWIPRO NANOTYNK EWI-075 SB 1,0 BAZA A → "EWI-075-1A"
   • EWIPRO NANOTYNK EWI-075 SB 1,0 BAZA D → "EWI-075-1D" (UWAGA: D=osobny SKU)
   • EWIPRO NANOTYNK EWI-075 SB 1,5 BAZA A → "EWI-075-1.5A"
   • EWIPRO PREMIUM BIO SILICONE RENDER EWI-076 SB X,Y BAZA Z → "EWI-076-{X.Y}{Z}"
   • EWIPRO FARBA SILIKONOWA EWI-005 15L BAZA A → "EWI-005-15A 15L"
   • EWIPRO FARBA SILIKONOWA EWI-005 5L BAZA A → "EWI-005-5A" (uwaga: OCR czasem zlepia "5L BAZA" w "SLBAZA")
   • EWIPRO PREMIUM BIO SILICONE PAINT EWI-006 BAZA A 15L → "EWI-006-15A"
   • EWIPRO TOPCOAT PRIMER EWI-333 20KG → "EWI-333-20"
   • EWIPRO TOPCOAT PRIMER EWI-333 7KG → "EWI-333-7"
   • EWIPRO TYNK MASZYNOWY LEKKI 502L EWI-269 25KG → "EWI-269 25KG"
   • EWIPRO STYRLEP-B 225 EWI-225 25KG → "EWI-225 25KG"
   • EWI-212 25KG → "EWI-212"
   • PIGMENT-D-XXX (z lub bez "1L"/"IL") → "PIGMENT-D-XXX" (uppercase, bez suffix)
   • D-XXX bez prefiksu (literówka) → "PIGMENT-D-XXX"
   • MOZATYNK-S 051 BAZA II NATURAL NAT XX 2,5KG → "Mozatynk-S 051 BAZA II NAT XX 2.5kg" (z zerem wiodącym jeśli XX < 10)
   • MOZATYNK-S 050 BAZA I 6,5 KG → "Mozatynk-S 050 Baza I 6.5KG"
   • ETYKIETA EWI 050 MOSAIC RENDER 25KG → "Label EWI-050 25KG"
   • WIADERKO 12L EWIPRO CZARNE → "BUCKET 10L" (12L mapuje się na najbliższy BUCKET 10L)
   • WIADERKO 3L → "BUCKET 3L"
   • PALETA EUR → "__PALLET__"
   • GOTOWA GŁADŹ POLIMEROWA, RENO SZPACHLA, lub inne 1.00 PLN → "__SAMPLE__"

FLAGI:
   • is_pigment: true gdy ewi_sku zaczyna od "PIGMENT-D-"
   • is_pallet: true gdy ewi_sku == "__PALLET__"
   • is_sample: true gdy unit_pln == 1.00 lub ewi_sku == "__SAMPLE__"

Jeśli nie potrafisz zmapować linii do żadnej znanej nazwy, ustaw ewi_sku=null i zapisz raw_desc.
NIE wymyślaj SKU.

LISTA ZNANYCH EWI Pro ITEM NAMES (jedyne dozwolone wartości dla ewi_sku):
` + KNOWN_ITEM_NAMES.map(n => `  - "${n}"`).join('\n');

// Tool definition — forces structured output
const PARSER_TOOL = {
  name: 'submit_kreisel_invoice',
  description: 'Submit the extracted invoice data in canonical format.',
  input_schema: {
    type: 'object',
    required: ['invoice_no', 'issue_date', 'lines'],
    properties: {
      invoice_no: { type: 'string', description: 'e.g. "201/2026/EXP"' },
      kreisel_ref: { type: 'string', description: 'e.g. "FSE-201/2026/EXP"' },
      issue_date: { type: 'string', description: 'YYYY-MM-DD' },
      sale_date: { type: 'string', description: 'YYYY-MM-DD' },
      container: { type: ['string', 'null'], description: '4 letters + 7 digits, or null for truck' },
      total_pln: { type: 'number' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          required: ['nr', 'raw_desc', 'qty', 'unit_pln', 'total_pln'],
          properties: {
            nr: { type: 'integer' },
            raw_desc: { type: 'string', description: 'full description from invoice, multi-line glued' },
            ewi_sku: { type: ['string', 'null'], description: 'canonical EWI Pro Item name, or null if unmappable' },
            pkwiu: { type: 'string' },
            pcn: { type: 'string' },
            qty: { type: 'number' },
            unit_measure: { type: 'string', enum: ['SZT', 'KG'] },
            unit_pln: { type: 'number' },
            total_pln: { type: 'number' },
            is_pigment: { type: 'boolean' },
            is_pallet: { type: 'boolean' },
            is_sample: { type: 'boolean' },
          },
        },
      },
    },
  },
};

/**
 * Detect whether a PDF has a usable text layer (i.e. is a real PDF from Kreisel,
 * not a scanned image). Returns the extracted text if usable, otherwise null.
 *
 * Criteria for "usable":
 *   • At least 200 characters of meaningful text
 *   • Contains "Faktura eksportowa" (case-insensitive) — Kreisel's standard header
 *
 * For scanned PDFs (image-only), pdf-parse returns either empty or a few stray
 * characters from form widgets, so the check naturally falls back to vision.
 */
async function detectPdfTextLayer(pdfBytes) {
  try {
    const text = await extractPdfText(pdfBytes);
    if (text.trim().length < 200) return null;
    if (!/Faktura\s+eksportowa/i.test(text)) return null;
    return text;
  } catch (e) {
    // pdf-parse occasionally throws on malformed PDFs — fall back to vision
    console.warn('[parse_kreisel_llm] pdf-parse failed:', e.message);
    return null;
  }
}

async function parseKreiselWithLlm(pdfPath) {
  const client = _client();
  const pdfBytes = fs.readFileSync(pdfPath);

  // FAST PATH — text-based PDF: send extracted text only.
  // Anthropic input tokens for text are ~5x cheaper than PDF document tokens,
  // and there's no vision processing overhead. ~3s vs ~38s observed.
  const extractedText = await detectPdfTextLayer(pdfBytes);

  let userContent;
  let parserMode;
  if (extractedText) {
    parserMode = 'text';
    userContent = [
      {
        type: 'text',
        text: 'Poniżej raw text wyciągnięty z PDF faktury Kreisla. Wyciągnij dane strukturalnie. Użyj narzędzia submit_kreisel_invoice.\n\n--- TEKST FAKTURY ---\n' + extractedText,
      },
    ];
  } else {
    parserMode = 'vision';
    const pdfBase64 = pdfBytes.toString('base64');
    userContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: 'Wyciągnij dane z tej faktury Kreisla. Użyj narzędzia submit_kreisel_invoice.' },
    ];
  }

  const t0 = Date.now();
  // Hard 2-minute timeout — beyond this the request is almost certainly hung.
  const LLM_TIMEOUT_MS = 120_000;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    // System prompt + SKU list cached — 90% cheaper on cache hit (after 1st call within 5 min)
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    // Tool definition also cached
    tools: [
      { ...PARSER_TOOL, cache_control: { type: 'ephemeral' } },
    ],
    tool_choice: { type: 'tool', name: 'submit_kreisel_invoice' },
    messages: [
      { role: 'user', content: userContent },
    ],
  }, {
    timeout: LLM_TIMEOUT_MS,
  });
  const ms = Date.now() - t0;

  // Find tool_use block
  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use in LLM response');
  const data = toolUse.input;

  // Safety filter — drop non-product lines that slipped past the prompt.
  // Real Kreisel product lines ALWAYS have PKWiU + PCN codes.
  // Common false positives: payment terms (Przelew-90), totals (Razem do zapłaty), INCOTERMS.
  const PAYMENT_KEYWORDS = /^(przelew|forma\s+p[lł]atno|termin\s+p[lł]atno|razem|suma|do\s+zap[lł]aty|warto[sś][cć]|netto|brutto|vat|incoterms|exw|fca|cif|kontener|magazyn|spedytor|iban|swift)/i;
  const rejected = [];
  if (Array.isArray(data.lines)) {
    data.lines = data.lines.filter(l => {
      const hasPkwiu = l.pkwiu && String(l.pkwiu).trim().length > 2;
      const hasPcn   = l.pcn   && String(l.pcn).trim().length > 2;
      const looksLikePayment = l.raw_desc && PAYMENT_KEYWORDS.test(String(l.raw_desc).trim());
      if (!hasPkwiu || !hasPcn || looksLikePayment) {
        rejected.push({ nr: l.nr, raw_desc: l.raw_desc, reason: looksLikePayment ? 'payment-term-or-summary' : 'no-pkwiu-or-pcn' });
        return false;
      }
      return true;
    });
  }
  if (rejected.length) {
    console.error('[parse_kreisel_llm] Rejected non-product lines:', JSON.stringify(rejected));
  }

  // Compute lines into our canonical shape (same as parse_kreisel_pl.js output)
  const lines = (data.lines || []).filter(l => l.ewi_sku !== null).map(l => ({
    ewi_sku: l.ewi_sku,
    qty_kreisel: l.qty,
    qty_ewi: l.qty,  // Polish invoice — qty aligned
    unit_pln: l.unit_pln,
    total_pln: l.total_pln,
    raw_desc: l.raw_desc,
    pkwiu: l.pkwiu || '',
    pcn: l.pcn || '',
    unit_measure: l.unit_measure || 'SZT',
    is_sample: !!l.is_sample,
    is_pigment: !!l.is_pigment,
    is_pallet: !!l.is_pallet,
  }));

  const unmapped_lines = (data.lines || []).filter(l => l.ewi_sku === null).map(l => ({
    nr: l.nr,
    raw_desc: l.raw_desc,
    qty: l.qty,
    unit_pln: l.unit_pln,
    total_pln: l.total_pln,
    pkwiu: l.pkwiu,
    pcn: l.pcn,
    suggestions: suggest(l.raw_desc, 5).map(s => ({
      code: s.code, name: s.name, score: s._score, times_ordered: s.times_ordered,
    })),
  }));

  // Warnings for line-level qty*unit ≠ total
  const warnings = [];
  for (const l of (data.lines || [])) {
    if (Math.abs(l.qty * l.unit_pln - l.total_pln) > 0.05) {
      warnings.push(`Line ${l.nr}: qty*unit=${(l.qty * l.unit_pln).toFixed(2)} ≠ total=${l.total_pln.toFixed(2)}`);
    }
  }

  return {
    pdf: pdfPath,
    invoice_no: data.invoice_no,
    kreisel_ref: data.kreisel_ref || `FSE-${data.invoice_no}`,
    issue_date: data.issue_date,
    sale_date: data.sale_date,
    container: data.container || null,
    lines,
    total_pln: data.total_pln,
    unmapped_lines,
    warnings,
    _meta: {
      model: MODEL,
      parser_mode: parserMode,   // 'text' (fast) or 'vision' (scanned PDF fallback)
      latency_ms: ms,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens || 0,
      stop_reason: response.stop_reason,
    },
  };
}

/**
 * Cheap text-only extraction of just the Kreisel invoice reference.
 * Used by the GUI's discovery phase to sort the batch by FSE number
 * BEFORE running the full LLM pipeline, so we don't pay 2x LLM calls
 * per invoice (one for sort, one for full parse).
 *
 * Returns `FSE-NNN/YYYY/EXP` on hit, null on miss (scanned PDF
 * without a text layer, or unusual format). Caller can fall back to
 * the LLM if null is returned.
 */
async function quickKreiselRef(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const text = await extractPdfText(pdfBytes);
    if (!text || text.length < 100) return null;
    // Header form: "Faktura eksportowa VAT nr (S)FSE-123/2026/EXP"
    let m = /Faktura\s+eksportowa[^a-z]*?VAT[^\d]*?\(?S?\)?FSE-?(\d+\/\d{4}\/EXP)/i.exec(text);
    if (m) return `FSE-${m[1]}`;
    // Looser fallback anywhere in the text
    m = /FSE-?(\d+\/\d{4}\/EXP)/i.exec(text);
    if (m) return `FSE-${m[1]}`;
    return null;
  } catch (e) {
    console.warn('[parse_kreisel_llm] quickKreiselRef failed:', e.message);
    return null;
  }
}

module.exports = { parseKreiselWithLlm, quickKreiselRef };

if (require.main === module) {
  (async () => {
    const inPath = process.argv[2];
    if (!inPath) { console.error('Usage: node parse_kreisel_llm.js <pdf>'); process.exit(1); }
    loadProducts(); // warm cache
    const r = await parseKreiselWithLlm(inPath);
    console.log(JSON.stringify(r, null, 2));
  })().catch(e => { console.error('ERR:', e.message); process.exit(1); });
}
