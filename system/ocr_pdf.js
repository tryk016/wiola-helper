// OCR a scanned PDF (Kreisel) using tesseract.js — pure JS, no external binaries.
//
// Approach:
//   1. Extract embedded page images (PNG/JPEG) from PDF.
//   2. Feed each page image to tesseract.js with Polish + English lang model.
//   3. Return concatenated text.
//
// First run downloads tesseract.wasm + pol.traineddata (~10MB) into eng/pol cache.

const fs = require('fs');
const path = require('path');
const { createWorker } = require(path.join(__dirname, 'node_modules', 'tesseract.js'));
const { extractImages } = require('./extract_pdf_image');

const CACHE_DIR = path.join(__dirname, 'tesseract_cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

let _worker = null;
async function getWorker() {
  if (_worker) return _worker;
  _worker = await createWorker(['pol', 'eng'], 1, {
    cachePath: CACHE_DIR,
    logger: m => {
      if (m.status && (m.status === 'recognizing text' || m.status.includes('loading'))) {
        process.stderr.write(`\r[tesseract] ${m.status} ${(m.progress * 100).toFixed(0)}%   `);
      }
    },
  });
  process.stderr.write('\n');
  return _worker;
}

async function ocrPdf(pdfPath) {
  const imgs = await extractImages(pdfPath);
  if (!imgs.length) throw new Error('No images found in PDF: ' + pdfPath);
  const worker = await getWorker();
  let allText = '';
  for (const img of imgs) {
    const buf = Buffer.from(img.data);
    const res = await worker.recognize(buf);
    allText += `\n--- Page ${img.page} ---\n` + res.data.text;
  }
  return allText;
}

async function terminate() {
  if (_worker) {
    await _worker.terminate();
    _worker = null;
  }
}

module.exports = { ocrPdf, terminate };

if (require.main === module) {
  (async () => {
    const inPath = process.argv[2];
    if (!inPath) { console.error('Usage: node ocr_pdf.js <pdf>'); process.exit(1); }
    const text = await ocrPdf(inPath);
    console.log(text);
    await terminate();
  })().catch(async e => { console.error(e); await terminate(); process.exit(1); });
}
