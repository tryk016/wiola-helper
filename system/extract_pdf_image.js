// Extract embedded JPEG image from scanned Kreisel PDF (each page = 1 DCTDecode XObject).
// Saves PNG/JPEG buffer for OCR pipeline.
// No external deps — uses pdf-parse's pdfjs underneath.
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function extractImages(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const res = await parser.getImage();
  // res.pages: array of pages with .images: [{ data: Uint8Array, kind, format, width, height }]
  const out = [];
  for (let p = 0; p < (res.pages || []).length; p++) {
    const page = res.pages[p];
    for (let i = 0; i < (page.images || []).length; i++) {
      const img = page.images[i];
      out.push({ page: p + 1, idx: i, ...img });
    }
  }
  return out;
}

module.exports = { extractImages };

if (require.main === module) {
  (async () => {
    const inPath = process.argv[2];
    const outDir = process.argv[3] || path.join(__dirname, 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const imgs = await extractImages(inPath);
    console.log(`Found ${imgs.length} image(s)`);
    for (const img of imgs) {
      const ext = (img.format || '').toLowerCase().includes('jp') ? 'jpg'
                : (img.format || '').toLowerCase().includes('png') ? 'png'
                : 'bin';
      const fn = path.join(outDir, `${path.basename(inPath, '.pdf')}.p${img.page}.${img.idx}.${ext}`);
      fs.writeFileSync(fn, Buffer.from(img.data));
      console.log(`Page ${img.page} #${img.idx}: ${img.width}x${img.height} ${img.format} → ${fn}`);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
