/* ============================================================
   WIPE DEMO CONTRACTS — cancella tutti i clienti e i preventivi
   con flag _demo:true creati da seed-demo-contracts.js.

   Avvio:  node tools/wipe-demo-contracts.js
   ============================================================ */

const BASE = process.env.PREV_BASE || 'http://localhost:4321';

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let json; try { json = t ? JSON.parse(t) : null; } catch { json = { raw: t }; }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' su ' + path + ' — ' + JSON.stringify(json));
  return json;
}

(async () => {
  console.log('▶ Login backend a', BASE);
  const login = await api('POST', '/auth/login', null, { username: 'luigi', password: 'luigi2026' });
  const token = login.token;
  console.log('✓ Loggato come', login.user.username);

  // QUOTES demo
  console.log('\n▶ Cerco preventivi demo…');
  const quotes = await api('GET', '/quotes', token);
  const demoQuotes = quotes.filter(q => q._demo === true);
  console.log('  Trovati', demoQuotes.length, 'preventivi demo.');
  for (const q of demoQuotes) {
    try {
      await api('DELETE', '/quotes/' + encodeURIComponent(q.syncId), token);
      console.log('  ✓ Eliminato preventivo', q.number || q.syncId, '·', q.clientName || '');
    } catch (e) { console.warn('  ⚠️', q.syncId, e.message); }
  }

  // CLIENTS demo
  console.log('\n▶ Cerco clienti demo…');
  const clients = await api('GET', '/clients', token);
  const demoClients = clients.filter(c => c._demo === true);
  console.log('  Trovati', demoClients.length, 'clienti demo.');
  // I clienti sul backend non hanno un endpoint DELETE; uso PUT con _deleted=true
  // (soft delete propagato via sync). I client locali poi li rimuovono al merge.
  for (const c of demoClients) {
    try {
      await api('PUT', '/clients/' + encodeURIComponent(c.syncId), token, Object.assign({}, c, { _deleted: true }));
      console.log('  ✓ Eliminato cliente', c.name);
    } catch (e) { console.warn('  ⚠️', c.syncId, e.message); }
  }

  console.log('\n✅ Wipe completato.');
  console.log('   Apri l\'app → F5 (o aspetta 15s) → Situazione clienti tornerà vuota.');
  console.log('   Anche IndexedDB locale si pulisce al prossimo pull (soft-delete propagato).');
})().catch(e => {
  console.error('\n❌ Errore:', e.message);
  process.exit(1);
});
