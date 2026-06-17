/* ============================================================
   Static server per servire la PWA in rete locale.
   - Binda 0.0.0.0:8000 → accessibile sia da localhost sia da iPad
     dello stesso Wi-Fi via http://<IP-del-PC>:8000
   - Cache-Control: no-store, così gli aggiornamenti del codice
     arrivano sempre freschi durante lo sviluppo.
   - All'avvio stampa il tuo IP locale.

   Avvio:  node tools/static.js     (oppure usa AVVIA-WINDOWS.bat)
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8000', 10);
const ROOT = path.join(__dirname, '..');                 // = preventivatore-abruzzo-digitale/

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = path.join(ROOT, u);
  // protezione path traversal
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404 — ' + u); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(d);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  console.log('================================================================');
  console.log('Preventivatore Abruzzo Digitale — Frontend statico');
  console.log('================================================================');
  console.log('  Dal PC:        http://localhost:' + PORT);
  for (const ip of ips) console.log('  Dall\'iPad/LAN: http://' + ip + ':' + PORT);
  console.log('================================================================');
  console.log('Chiudi con Ctrl+C');
});
