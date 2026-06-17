/* ============================================================
   Genera AD-voci-configuratore-da-completare.xlsx leggendo
   voci-configuratore.json + categorie-fic.json (dalla root repo).
   Esegui da repo root:  node tools/build-voci-template.js
   ============================================================ */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const voci = JSON.parse(fs.readFileSync(path.join(ROOT, 'voci-configuratore.json'), 'utf8'));
const categorie = JSON.parse(fs.readFileSync(path.join(ROOT, 'categorie-fic.json'), 'utf8'));

const wb = new ExcelJS.Workbook();
wb.creator = 'Abruzzo Digitale — Preventivatore';
wb.created = new Date();

// ---------- Sheet 1: Voci configuratore ----------
const ws = wb.addWorksheet('Voci configuratore', {
  views: [{ state: 'frozen', ySplit: 1 }],
});
ws.columns = [
  { header: 'Tipo',                       key: 'tipo',            width: 14 },
  { header: 'Area',                       key: 'area',            width: 16 },
  { header: 'Sezione',                    key: 'sezione',         width: 28 },
  { header: 'Famiglia',                   key: 'famiglia',        width: 18 },
  { header: 'ID tecnico',                 key: 'id_tecnico',      width: 22 },
  { header: 'Etichetta',                  key: 'etichetta',       width: 40 },
  { header: 'Prezzo (€)',                 key: 'prezzo',          width: 12, style: { numFmt: '#,##0.00' } },
  { header: 'Periodicità',                key: 'period',          width: 13 },
  { header: 'In bundle',                  key: 'bundle',          width: 22 },
  { header: 'Descrizione attuale',        key: 'descrizione_attuale', width: 40 },
  { header: 'DESCRIZIONE (da compilare)', key: 'descrizione_da_compilare', width: 50 },
  { header: 'CATEGORIA FiC (da compilare)', key: 'categoria_fic_da_compilare', width: 26 },
  { header: 'UDM (Mese / cad)',           key: 'udm_da_compilare', width: 14 },
  { header: 'IVA %',                      key: 'iva_da_compilare', width: 8 },
  { header: 'Note interne',               key: 'note_interne',    width: 30 },
];

// Header bold + sfondo grigio chiaro
ws.getRow(1).font = { bold: true };
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
ws.getRow(1).alignment = { vertical: 'middle' };

// Dati
for (const r of voci) ws.addRow(r);

// Sfondo giallo chiaro sulle colonne "da compilare" (K, L, M, N, O = colonne 11..15)
const FILL_YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D0' } };
for (let r = 2; r <= ws.rowCount; r++) {
  for (const col of [11, 12, 13, 14, 15]) ws.getRow(r).getCell(col).fill = FILL_YELLOW;
  ws.getRow(r).getCell(11).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(r).getCell(10).alignment = { wrapText: true, vertical: 'top' };
}

// AutoFilter sulla riga 1
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };

// Data validation: tendina sulla colonna "CATEGORIA FiC (da compilare)" (col 12) — usa lo sheet "Categorie FiC"
for (let r = 2; r <= ws.rowCount; r++) {
  ws.getCell(`L${r}`).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`='Categorie FiC'!$A$2:$A$${categorie.length + 1}`],
    showErrorMessage: false, // non blocca: si può scrivere libero se serve
    promptTitle: 'Categoria FiC',
    prompt: 'Scegli dal menù o scrivi liberamente (la creo io al prossimo sync se manca)',
  };
}

// ---------- Sheet 2: Categorie FiC ----------
const wsCat = wb.addWorksheet('Categorie FiC');
wsCat.columns = [{ header: 'Categoria', key: 'cat', width: 30 }];
wsCat.getRow(1).font = { bold: true };
wsCat.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
for (const c of categorie) wsCat.addRow({ cat: c });

// ---------- Sheet 3: Istruzioni ----------
const wsI = wb.addWorksheet('Istruzioni');
wsI.columns = [{ header: '', key: 't', width: 100 }];
const istr = [
  ['Come compilare questo file', { bold: true, size: 14 }],
  ['', {}],
  ["1. Lavora SOLO sullo sheet «Voci configuratore».", {}],
  ["2. Compila le colonne con sfondo giallo (Descrizione, Categoria FiC, UDM, IVA, Note).", {}],
  ["3. CATEGORIA FiC: usa il menù a tendina. Se manca una categoria, scrivila libera: la creerò io su FiC al prossimo sync.", {}],
  ["4. UDM: «Mese» per i servizi mensili (canoni), «cad» per gli oneoff (una tantum). Lascia vuoto se non rilevante.", {}],
  ["5. IVA: 22 di default. Cambia solo se diversa.", {}],
  ["6. NON modificare le colonne Tipo / Area / Sezione / Famiglia / ID tecnico / Etichetta / Prezzo / Periodicità / In bundle — sono riferimenti tecnici.", {}],
  ["7. Quando hai finito, ridammi il file: lo importo in bulk nel configuratore e creo/aggiorno le voci mancanti su Fatture in Cloud.", {}],
  ['', {}],
  ['Tipi di riga', { bold: true }],
  ["• voce — una voce standalone del configuratore.", {}],
  ["• variante — un'opzione dentro a una famiglia (es. «× 2 campagne» dentro META ADS).", {}],
  ["• bundle-parent — il bundle visibile nel configuratore (es. Sito Web Corporate). Il suo prezzo è la somma delle incluse.", {}],
  ["• bundle-line — singola voce inclusa in uno o più bundle (es. Dominio, Google Analytics).", {}],
];
for (const [text, style] of istr) {
  const row = wsI.addRow({ t: text });
  if (style && Object.keys(style).length) row.getCell(1).font = style;
  row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
}
wsI.getRow(1).alignment = { wrapText: true, vertical: 'top' };

// ---------- Salva ----------
const outPath = path.join(ROOT, 'AD-voci-configuratore-da-completare.xlsx');
wb.xlsx.writeFile(outPath).then(() => {
  const st = fs.statSync(outPath);
  console.log('OK:', outPath);
  console.log('Righe voci configuratore (escluso header):', voci.length);
  console.log('Categorie FiC:', categorie.length);
  console.log('Dimensione file:', (st.size / 1024).toFixed(1), 'KB');
});
