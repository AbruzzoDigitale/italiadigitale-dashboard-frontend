/* ============================================================
   PARTE 2 — crea su FiC le voci ancora mancanti del configuratore:
   - 4 family parents (Stories Meta, Reels Meta, Video TikTok, LinkedIn ADS).
     Le varianti del configuratore puntano TUTTE a questo parent
     (stesso modello di META ADS). Il prezzo del parent FiC è quello
     della variante più piccola; ogni variante porta poi il proprio
     unit price nella riga preventivo.
   - 3 SMM Meta (Visibilità/Crescita/Evoluzione) standalone
   - 2 SMM Tik Tok (Start/Up) standalone
   - 2 SMM Linkedin (Base/Pro) standalone
   - 1 Strategia LinkedIn ADS (oneoff)
   - "Locandina eventi Meta" → riusa "Locandina" 85€ già esistente
   - "Multilingua e-commerce" → si rinomina nel config a "Multilingua
     Ecommerce" (già esistente su FiC), nessun POST necessario.

   Esegui da repo root:  node tools/sync-config-to-fic-pt2.js
   ============================================================ */

const BASE = process.env.PREV_BASE || 'http://localhost:4321';

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let json; try { json = t ? JSON.parse(t) : null; } catch { json = { raw: t }; }
  return { ok: res.ok, status: res.status, json };
}

(async () => {
  const login = await api('POST', '/auth/login', null, { username: 'luigi', password: 'luigi2026' });
  if (!login.ok) { console.error('Login backend fallito:', login.json); process.exit(1); }
  const token = login.json.token;

  const azioni = [
    // Family parents (riferimento per le varianti del configuratore)
    { label: 'Stories Meta (family)',     body: { name: 'Stories Meta',     description: 'Stories Meta — varianti × 5 / × 10 / × 15', net_price: 70,  measure: 'Mese', category: 'Social media management' } },
    { label: 'Reels Meta (family)',       body: { name: 'Reels Meta',       description: 'Reels Meta — varianti 1-2 / 2-3 / 3-4 reel',  net_price: 250, measure: 'Mese', category: 'Social media management' } },
    { label: 'Video TikTok (family)',     body: { name: 'Video TikTok',     description: 'Video TikTok — varianti × 1/2/3/4 al mese',    net_price: 150, measure: 'Mese', category: 'Social media management' } },
    { label: 'LinkedIn ADS (family)',     body: { name: 'LinkedIn ADS',     description: 'LinkedIn ADS — varianti × 1/2/3 campagne',    net_price: 250, measure: 'Mese', category: 'Advertising' } },

    // SMM Meta (3 livelli)
    { label: 'SMM Meta Visibilità',       body: { name: 'SMM Meta Visibilità', description: '4-6 post · Facebook + Instagram', net_price: 400, measure: 'Mese', category: 'Social media management' } },
    { label: 'SMM Meta Crescita',         body: { name: 'SMM Meta Crescita',   description: '6-8 post · Facebook + Instagram', net_price: 550, measure: 'Mese', category: 'Social media management' } },
    { label: 'SMM Meta Evoluzione',       body: { name: 'SMM Meta Evoluzione', description: '8-10 post · Facebook + Instagram', net_price: 70, measure: 'Mese', category: 'Social media management' } },

    // SMM Tik Tok (2 livelli)
    { label: 'SMM Tik Tok Start',         body: { name: 'SMM Tik Tok Start', description: '1-2 post/carosello mensili', net_price: 350, measure: 'Mese', category: 'Social media management' } },
    { label: 'SMM Tik Tok Up',            body: { name: 'SMM Tik Tok Up',    description: '2-4 post/carosello mensili', net_price: 500, measure: 'Mese', category: 'Social media management' } },

    // SMM Linkedin (2 livelli)
    { label: 'SMM Linkedin Base',         body: { name: 'SMM Linkedin Base', description: '1-2 post editoriale/carosello mensili', net_price: 350, measure: 'Mese', category: 'Social media management' } },
    { label: 'SMM Linkedin Pro',          body: { name: 'SMM Linkedin Pro',  description: '2-4 post editoriale/carosello mensili', net_price: 500, measure: 'Mese', category: 'Social media management' } },

    // Strategia LinkedIn ADS (oneoff)
    { label: 'Strategia LinkedIn ADS',    body: { name: 'Strategia LinkedIn ADS', description: 'Audit + struttura campagne ADS LinkedIn', net_price: 350, category: 'Advertising' } },
  ];

  const risultati = [];
  for (const az of azioni) {
    const r = await api('POST', '/fic/product', token, az.body);
    const out = { label: az.label, status: r.status };
    if (r.ok && r.json && r.json.id) { out.id = r.json.id; out.name = r.json.name; }
    else out.error = r.json && (r.json.error || JSON.stringify(r.json).slice(0, 200));
    risultati.push(out);
    console.log((r.ok ? '✓' : '✗'), az.label, '→', r.ok ? `id ${r.json.id}` : `HTTP ${r.status}: ${out.error}`);
  }

  const fs = require('fs');
  fs.writeFileSync('tools/last-fic-sync-pt2-result.json', JSON.stringify(risultati, null, 2));
  console.log('\nDettaglio:', 'tools/last-fic-sync-pt2-result.json');
})().catch(e => { console.error('Errore:', e); process.exit(1); });
