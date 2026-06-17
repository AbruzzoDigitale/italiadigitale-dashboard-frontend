/* Legge AD-voci-configuratore-da-completare.xlsx compilato e dump JSON. */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

(async () => {
  const ROOT = path.join(__dirname, '..');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(ROOT, 'AD-voci-configuratore-da-completare.xlsx'));
  const ws = wb.getWorksheet('Voci configuratore');
  if (!ws) { console.error('Sheet "Voci configuratore" non trovato'); process.exit(1); }

  // Mappa l'header → chiave
  const header = {};
  ws.getRow(1).eachCell((cell, col) => { header[col] = String(cell.value || '').trim(); });

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const k = header[col];
      if (!k) return;
      let v = cell.value;
      if (v && typeof v === 'object' && 'result' in v) v = v.result;
      if (v && typeof v === 'object' && 'text' in v) v = v.text;
      obj[k] = (v === null || v === undefined) ? '' : v;
    });
    // Salto righe vuote
    if (!obj['ID tecnico']) continue;
    rows.push(obj);
  }

  fs.writeFileSync(path.join(ROOT, 'voci-compilate.json'), JSON.stringify(rows, null, 2));
  // Statistiche
  const conNote = rows.filter(r => String(r['Note interne'] || '').trim()).length;
  const conCat = rows.filter(r => String(r['CATEGORIA FiC (da compilare)'] || '').trim()).length;
  const conDesc = rows.filter(r => String(r['DESCRIZIONE (da compilare)'] || '').trim()).length;
  console.log('Righe totali:', rows.length);
  console.log('Con DESCRIZIONE compilata:', conDesc);
  console.log('Con CATEGORIA FiC compilata:', conCat);
  console.log('Con Note interne:', conNote);
  console.log('\n— NOTE INTERNE (tutte) —');
  for (const r of rows) {
    const n = String(r['Note interne'] || '').trim();
    if (n) console.log(`• [${r['ID tecnico']}] ${r['Etichetta']} → ${n}`);
  }
})();
