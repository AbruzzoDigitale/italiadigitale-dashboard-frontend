/* ============================================================
   Sincronizza con Fatture in Cloud le voci NUOVE del configuratore
   (le 5 voci Gnammm + Campagna lancio META pro) e rinomina
   l'esistente "Campagna lancio META" → "Campagna lancio META base".

   Si appoggia al backend locale (http://localhost:4321) che fa da
   proxy autenticato (token+companyId in server/.env).

   Esegui dalla root del repo:
     node tools/sync-config-to-fic.js
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

  // Azioni: 1 rinomina + 6 creazioni
  const azioni = [
    // 1) Rinomina su FiC l'esistente "Campagna lancio META" → "Campagna lancio META base"
    {
      label: 'UPDATE Campagna lancio META → Campagna lancio META base',
      body: {
        id: 37294385,
        name: 'Campagna lancio META base',
        description: '6 pubblicazioni (post e/o reel) · ADS Meta opzionale',
        net_price: 900,
        category: 'Advertising',
      },
    },
    // 2) Crea "Campagna lancio META pro" 1300€
    {
      label: 'CREATE Campagna lancio META pro',
      body: {
        name: 'Campagna lancio META pro',
        description: '9-12 pubblicazioni (post e/o reel) · ADS Meta opzionale',
        net_price: 1300,
        category: 'Advertising',
      },
    },
    // 3) Crea Menu Digitale Gnammm 250€/mese
    {
      label: 'CREATE Menu Digitale Gnammm',
      body: {
        name: 'Menu Digitale Gnammm',
        description: 'Menu QR Code + interfaccia digitale (Gnammm)',
        net_price: 250,
        measure: 'Mese',
        category: 'Configurazione web',
      },
    },
    // 4-7) Gnammm piano Marketing/Management semestrale/annuale
    {
      label: 'CREATE Gnammm piano Marketing semestrale',
      body: {
        name: 'Gnammm piano Marketing semestrale',
        description: 'Promozione e visibilità del menu Gnammm — fatturazione semestrale',
        net_price: 45,
        measure: 'Mese',
        category: 'Social media management',
      },
    },
    {
      label: 'CREATE Gnammm piano Marketing annuale',
      body: {
        name: 'Gnammm piano Marketing annuale',
        description: 'Promozione e visibilità del menu Gnammm — fatturazione annuale (sconto)',
        net_price: 35,
        measure: 'Mese',
        category: 'Social media management',
      },
    },
    {
      label: 'CREATE Gnammm piano Management semestrale',
      body: {
        name: 'Gnammm piano Management semestrale',
        description: 'Gestione completa del menu Gnammm (upgrade Marketing) — fatturazione semestrale',
        net_price: 80,
        measure: 'Mese',
        category: 'Social media management',
      },
    },
    {
      label: 'CREATE Gnammm piano Management annuale',
      body: {
        name: 'Gnammm piano Management annuale',
        description: 'Gestione completa del menu Gnammm (upgrade Marketing) — fatturazione annuale (sconto)',
        net_price: 70,
        measure: 'Mese',
        category: 'Social media management',
      },
    },
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
  fs.writeFileSync('tools/last-fic-sync-result.json', JSON.stringify(risultati, null, 2));
  console.log('\nDettaglio salvato in tools/last-fic-sync-result.json');
})().catch(e => { console.error('Errore:', e); process.exit(1); });
