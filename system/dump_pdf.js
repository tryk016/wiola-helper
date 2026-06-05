// Dump raw text from PDF for parser development
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const path = process.argv[2];
if (!path) {
  console.error('Usage: node dump_pdf.js <path>');
  process.exit(1);
}

(async () => {
  const buf = fs.readFileSync(path);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  console.log('=== PAGES ===', result.pages?.length || '?');
  console.log('=== TEXT ===');
  console.log(result.text);
})();
