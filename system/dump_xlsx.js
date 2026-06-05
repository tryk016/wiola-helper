// Inspect Magemar xlsx — headers + sample rows + lookup of our 4 fixture containers
const path = require('path');
const ExcelJS = require('exceljs');

const FIXTURE_CONTAINERS = ['ECMU5405966', 'CGMU8514020', 'FFAU5409519', 'CMAU6487821'];

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, 'external', 'magemar.xlsx'));

  for (const ws of wb.worksheets) {
    console.log(`\n═══ Sheet: "${ws.name}"  rows=${ws.rowCount}  cols=${ws.columnCount} ═══`);

    // headers (row 1)
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, n) => {
      headers[n] = (c.value && c.value.text ? c.value.text : c.value) || '';
    });
    console.log('HEADERS:');
    headers.forEach((h, i) => i && console.log(`  col ${i} (${ws.getColumn(i).letter}): ${JSON.stringify(h)}`));

    // find container column (look for "Container number" or similar)
    let containerCol = headers.findIndex(h => /container.*number/i.test(String(h)));
    if (containerCol < 0) containerCol = headers.findIndex(h => /container/i.test(String(h)));
    let ataCol = headers.findIndex(h => /^ATA/i.test(String(h)));
    let atdCol = headers.findIndex(h => /^ATD/i.test(String(h)));
    let etaCol = headers.findIndex(h => /^ETA/i.test(String(h)));
    let actualDeliveryCol = headers.findIndex(h => /actual.*delivery/i.test(String(h)));
    let plannedDeliveryCol = headers.findIndex(h => /planned.*delivery/i.test(String(h)));
    console.log(`\nContainer col: ${containerCol} (${containerCol > 0 ? ws.getColumn(containerCol).letter : '-'})`);
    console.log(`ATD col      : ${atdCol} (${atdCol > 0 ? ws.getColumn(atdCol).letter : '-'})`);
    console.log(`ETA col      : ${etaCol} (${etaCol > 0 ? ws.getColumn(etaCol).letter : '-'})`);
    console.log(`ATA col      : ${ataCol} (${ataCol > 0 ? ws.getColumn(ataCol).letter : '-'})`);
    console.log(`Planned dlv  : ${plannedDeliveryCol} (${plannedDeliveryCol > 0 ? ws.getColumn(plannedDeliveryCol).letter : '-'})`);
    console.log(`Actual dlv   : ${actualDeliveryCol} (${actualDeliveryCol > 0 ? ws.getColumn(actualDeliveryCol).letter : '-'})`);

    if (containerCol < 0) continue;

    // sample row 2
    const sampleRow = ws.getRow(2);
    const sample = [];
    sampleRow.eachCell({ includeEmpty: true }, (c, n) => { sample[n] = c.value; });
    console.log('\nSample row 2 values (interesting cols):');
    [containerCol, atdCol, etaCol, ataCol, plannedDeliveryCol, actualDeliveryCol].filter(i => i > 0).forEach(i => {
      const v = sample[i];
      console.log(`  ${headers[i]}: ${JSON.stringify(v)}`);
    });

    // look for fixture containers
    console.log('\n=== Lookup of 4 fixture containers ===');
    for (const target of FIXTURE_CONTAINERS) {
      let found = null;
      for (let r = 2; r <= ws.rowCount; r++) {
        const v = ws.getCell(r, containerCol).value;
        const cellStr = String(v ? (v.text || v) : '').trim();
        if (cellStr === target) {
          found = { row: r };
          break;
        }
      }
      if (!found) {
        console.log(`  ${target}: NOT FOUND`);
        continue;
      }
      const row = ws.getRow(found.row);
      const cells = {};
      [containerCol, atdCol, etaCol, ataCol, plannedDeliveryCol, actualDeliveryCol].filter(i => i > 0).forEach(i => {
        const v = row.getCell(i).value;
        cells[headers[i]] = v;
      });
      console.log(`  ${target} (row ${found.row}):`, JSON.stringify(cells));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
