/* ============================================================
   SERVER.JS — Backend Express del Preventivatore Abruzzo Digitale
   Obiettivo 1: sync cross-utente di quotes + clients.
   Obiettivo 2 (proxy Fatture in Cloud): scaffold predisposto.
   Per ora gira SOLO in locale (localhost).
   ============================================================ */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { db, hashPassword, verifyPassword, seedUsers } = require('./db');

// ----- Mini loader .env (niente dipendenza dotenv) -----
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const PORT = process.env.PORT || 4321;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-NON-usare-in-produzione';

seedUsers();

const app = express();
app.use(cors());                       // dev locale: riflette qualsiasi origine (anche file://)
app.use(express.json({ limit: '5mb' }));

// ----- Auth -----
function auth(requiredRole) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token mancante' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      if (requiredRole === 'admin' && payload.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin' });
      }
      next();
    } catch {
      return res.status(401).json({ error: 'Token non valido o scaduto' });
    }
  };
}

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !verifyPassword(password, u.pass_hash, u.pass_salt)) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  const user = { username: u.username, name: u.name, role: u.role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// ----- Helpers store generico (quotes/clients) -----
function rowToObj(row) {
  const o = JSON.parse(row.data);
  o.syncId = row.sync_id;
  o._deleted = !!row.deleted;
  o._updatedAt = row.updated_at;
  return o;
}

function listStore(table, { since, where = '', params = [] } = {}) {
  let sql = `SELECT * FROM ${table} WHERE 1=1`;
  const p = [];
  if (since) { sql += ' AND updated_at > ?'; p.push(since); }
  if (where) { sql += ' AND ' + where; p.push(...params); }
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(...p).map(rowToObj);
}

// ----- QUOTES -----
const upsertQuote = db.prepare(`
  INSERT INTO quotes (sync_id, number, status, created_by, requested_by, client_id, updated_at, deleted, data)
  VALUES (@sync_id, @number, @status, @created_by, @requested_by, @client_id, @updated_at, @deleted, @data)
  ON CONFLICT(sync_id) DO UPDATE SET
    number=@number, status=@status, created_by=@created_by, requested_by=@requested_by,
    client_id=@client_id, updated_at=@updated_at, deleted=@deleted, data=@data
`);

function saveQuote(q) {
  if (!q.syncId) q.syncId = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  q.updatedAt = new Date().toISOString();
  upsertQuote.run({
    sync_id: q.syncId,
    number: q.number || null,
    status: q.status || 'bozza',
    created_by: q.createdBy || null,
    requested_by: q.requestedBy || null,
    client_id: q.clientId != null ? String(q.clientId) : null,
    updated_at: q.updatedAt,
    deleted: q._deleted ? 1 : 0,
    data: JSON.stringify(q),
  });
  return q;
}

app.get('/quotes', auth(), (req, res) => {
  const since = req.query.since;
  // admin vede tutto; operator vede solo i propri
  if (req.user.role === 'admin') {
    return res.json(listStore('quotes', { since }));
  }
  res.json(listStore('quotes', {
    since,
    where: '(created_by = ? OR requested_by = ?)',
    params: [req.user.username, req.user.username],
  }));
});

app.post('/quotes', auth(), (req, res) => res.json(saveQuote(req.body || {})));

app.put('/quotes/:syncId', auth(), (req, res) => {
  const q = req.body || {};
  q.syncId = req.params.syncId;
  res.json(saveQuote(q));
});

app.delete('/quotes/:syncId', auth(), (req, res) => {
  const row = db.prepare('SELECT * FROM quotes WHERE sync_id = ?').get(req.params.syncId);
  if (!row) return res.status(404).json({ error: 'Non trovato' });
  const q = rowToObj(row);
  q._deleted = true;
  saveQuote(q);                          // soft delete: si propaga in sync
  res.json({ ok: true });
});

// ----- RICHIESTE (sono quotes filtrate per stato) -----
const REQUEST_STATES = "status IN ('da_approvare','in_revisione')";

app.get('/requests/pending', auth('admin'), (req, res) => {
  res.json(listStore('quotes', { where: REQUEST_STATES + ' AND deleted = 0' }));
});

app.get('/requests/by-user/:username', auth(), (req, res) => {
  const username = req.params.username;
  if (req.user.role !== 'admin' && req.user.username !== username) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  res.json(listStore('quotes', {
    where: 'requested_by = ? AND ' + REQUEST_STATES + ' AND deleted = 0',
    params: [username],
  }));
});

// ----- CLIENTS -----
const upsertClient = db.prepare(`
  INSERT INTO clients (sync_id, name, updated_at, deleted, data)
  VALUES (@sync_id, @name, @updated_at, @deleted, @data)
  ON CONFLICT(sync_id) DO UPDATE SET
    name=@name, updated_at=@updated_at, deleted=@deleted, data=@data
`);

function saveClient(c) {
  if (!c.syncId) c.syncId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  c.updatedAt = new Date().toISOString();
  upsertClient.run({
    sync_id: c.syncId,
    name: c.name || c.ragioneSociale || null,
    updated_at: c.updatedAt,
    deleted: c._deleted ? 1 : 0,
    data: JSON.stringify(c),
  });
  return c;
}

app.get('/clients', auth(), (req, res) => res.json(listStore('clients', { since: req.query.since })));
app.post('/clients', auth(), (req, res) => res.json(saveClient(req.body || {})));
app.put('/clients/:syncId', auth(), (req, res) => {
  const c = req.body || {};
  c.syncId = req.params.syncId;
  res.json(saveClient(c));
});

// ============================================================
// SETTINGS sincronizzabili (loghi brand, KPI, regole, permessi).
// Whitelist esplicita: MAI token/segreti, MAI chiavi di bookkeeping.
// ============================================================
function settingSyncable(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('brand_')) return true;
  if (key.startsWith('login_')) return true;
  if (key.startsWith('notif_')) return true;
  return ['dashboard_kpis', 'configurator_rules', 'operator_permissions', 'configurator_fic_mapping'].includes(key);
}

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, updated_at, data)
  VALUES (@key, @updated_at, @data)
  ON CONFLICT(key) DO UPDATE SET updated_at=@updated_at, data=@data
`);

// Endpoint PUBBLICO: loghi brand + testi della schermata di login.
// Serve al login PRIMA dell'auth: nessun dato sensibile.
app.get('/brand', (req, res) => {
  const rows = db.prepare(
    "SELECT key, data FROM settings WHERE key LIKE 'brand_%' OR key LIKE 'login_%'"
  ).all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.data); } catch {} }
  res.json(out);
});

app.get('/settings', auth(), (req, res) => {
  const since = req.query.since;
  let sql = 'SELECT key, updated_at, data FROM settings WHERE 1=1';
  const p = [];
  if (since) { sql += ' AND updated_at > ?'; p.push(since); }
  const rows = db.prepare(sql).all(...p)
    .filter(r => settingSyncable(r.key))
    .map(r => ({ key: r.key, updatedAt: r.updated_at, value: safeParse(r.data) }));
  res.json(rows);
});

app.post('/settings', auth(), (req, res) => {
  const { key, value } = req.body || {};
  if (!settingSyncable(key)) {
    return res.status(403).json({ error: 'Chiave non sincronizzabile: ' + key });
  }
  const updated_at = new Date().toISOString();
  upsertSetting.run({ key, updated_at, data: JSON.stringify(value != null ? value : null) });
  res.json({ key, updatedAt: updated_at });
});

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// ============================================================
// PROFILO utente (avatar, info, firma) — campi non sensibili.
// La password NON passa mai di qui.
// ============================================================
app.get('/profile/me', auth(), (req, res) => {
  const u = db.prepare('SELECT profile, profile_updated_at FROM users WHERE username = ?')
    .get(req.user.username);
  res.json({
    profile: u && u.profile ? safeParse(u.profile) : null,
    updatedAt: u ? u.profile_updated_at : null,
  });
});

app.put('/profile/me', auth(), (req, res) => {
  const incoming = req.body && req.body.profile ? req.body.profile : {};
  // Solo campi consentiti
  const allowed = {};
  for (const k of ['name', 'role', 'avatar', 'signature', 'signatureImage', 'phone', 'title']) {
    if (incoming[k] !== undefined) allowed[k] = incoming[k];
  }
  const updated_at = new Date().toISOString();
  const r = db.prepare('UPDATE users SET profile = ?, profile_updated_at = ? WHERE username = ?')
    .run(JSON.stringify(allowed), updated_at, req.user.username);
  if (r.changes === 0) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ profile: allowed, updatedAt: updated_at });
});

// ============================================================
// Fatture in Cloud (obiettivo 2) — proxy CORS lato server.
// Token + Company ID stanno SOLO in server/.env, mai nel client.
// Tutti gli endpoint richiedono il JWT dell'app (auth()).
// ============================================================
const FIC_BASE = 'https://api-v2.fattureincloud.it';

function ficConfigured() {
  return !!(process.env.FIC_ACCESS_TOKEN && process.env.FIC_COMPANY_ID);
}

async function ficFetch(method, path, body) {
  const res = await fetch(FIC_BASE + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + process.env.FIC_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

// Stato/health della connessione FiC (non espone il token)
app.get('/fic/status', auth(), async (req, res) => {
  if (!ficConfigured()) return res.json({ configured: false });
  try {
    const r = await ficFetch('GET', '/user/info');
    res.json({ configured: true, ok: r.ok, status: r.status, user: r.ok ? (r.json && r.json.data) : undefined });
  } catch (e) {
    res.status(502).json({ configured: true, ok: false, error: String(e.message || e) });
  }
});

// Lista prodotti FiC (servirà per il listino unico, obiettivo 3)
app.get('/fic/products', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  const r = await ficFetch('GET', `/c/${company}/products?per_page=100`);
  res.status(r.ok ? 200 : r.status).json(r.ok ? (r.json.data || []) : r.json);
});

// Crea o aggiorna un PRODOTTO su FiC (usato dal bulk import).
// Body: { name, code?, description?, net_price, gross_price?, category?, measure?, vat? (0..1), id? (per update) }
app.post('/fic/product', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const p = req.body || {};
  const company = process.env.FIC_COMPANY_ID;
  const body = { data: {
    name: p.name || '',
    code: p.code || '',
    description: p.description || '',
    net_price: p.net_price != null ? Number(p.net_price) : 0,
    gross_price: p.gross_price != null ? Number(p.gross_price) : undefined,
    measure: p.measure || '',
    category: p.category || '',
    vat: { id: 0, value: (p.vat != null ? p.vat : 0.22) * 100 },
  }};
  const isUpdate = p.id != null;
  const r = isUpdate
    ? await ficFetch('PUT',  `/c/${company}/products/${p.id}`, body)
    : await ficFetch('POST', `/c/${company}/products`,        body);
  res.status(r.ok ? 200 : r.status).json(r.ok ? r.json.data : r.json);
});

// Crea cliente su FiC
app.post('/fic/client', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const c = req.body || {};
  const company = process.env.FIC_COMPANY_ID;
  const body = { data: {
    type: 'company',
    name: c.name || '',
    vat_number: c.vat || '',
    tax_code: c.cf || '',
    address_street: c.addr || '',
    address_postal_code: c.zip || '',
    address_city: c.city || '',
    address_province: c.prov || '',
    country: 'Italia',
    email: c.email || '',
    certified_email: c.pec || '',
    ei_code: c.sdi || '',
    phone: c.phone || '',
  }};
  const r = await ficFetch('POST', `/c/${company}/entities/clients`, body);
  res.status(r.ok ? 200 : r.status).json(r.ok ? r.json.data : r.json);
});

// Compone l'oggetto della bozza FiC in base alle aree dei servizi.
// Es. lines tutte "social" + cliente "Bar Centrale" →
// "Social Media Marketing — Bar Centrale".
function buildFicSubject(quote, client) {
  const AREA_LABEL = {
    social: 'Social Media Marketing',
    web:    'Sito Web & E-commerce',
    menu:   'Menu Digitale',
  };
  const counts = { social: 0, web: 0, menu: 0 };
  for (const l of (quote.lines || [])) {
    if (l && l.area && counts[l.area] != null) counts[l.area]++;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const usedAreas = Object.entries(counts).filter(([, n]) => n > 0).map(([a]) => a);
  const clientName = (client && client.name) ? String(client.name).trim() : '';
  let titoloArea;
  if (usedAreas.length === 0) titoloArea = 'Servizi Marketing';
  else if (usedAreas.length === 1) titoloArea = AREA_LABEL[usedAreas[0]] || 'Servizi Marketing';
  else if (dominant && dominant[1] > 0) titoloArea = AREA_LABEL[dominant[0]] || 'Servizi Marketing';
  else titoloArea = 'Servizi Marketing';
  return clientName ? `${titoloArea} — ${clientName}` : titoloArea;
}

// Lista bozze preventivo (per fare pulizia / vedere cosa c'è su FiC)
app.get('/fic/quote-drafts', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  const sort = req.query.sort ? `&sort=${encodeURIComponent(req.query.sort)}` : '';
  const r = await ficFetch('GET', `/c/${company}/issued_documents?type=quote&per_page=100${sort}`);
  if (!r.ok) return res.status(r.status).json(r.json);
  const list = (r.json && r.json.data) || [];
  res.json(list.map(d => ({ id: d.id, number: d.number, subject: d.subject, date: d.date, amount_net: d.amount_net, entity: d.entity && d.entity.name })));
});

// Elimina una bozza preventivo per id (DELETE su FiC)
app.delete('/fic/quote/:id', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  const r = await ficFetch('DELETE', `/c/${company}/issued_documents/${req.params.id}`);
  res.status(r.ok ? 200 : r.status).json(r.ok ? { ok: true, id: req.params.id } : r.json);
});

// Crea BOZZA preventivo (issued_documents type=quote) — priorità Luigi
app.post('/fic/quote-draft', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const { quote = {}, client = {} } = req.body || {};
  const company = process.env.FIC_COMPANY_ID;
  const items = (quote.lines || []).map(l => ({
    product_id: l.ficProductId || null,
    code: l.code || '',
    name: l.name || '',
    description: l.desc || '',
    qty: l.quantity || 1,
    measure: l.udm || '',
    net_price: l.net || 0,
    vat: { id: 0, value: (l.vat != null ? l.vat : 0.22) * 100 },
    discount: l.discountPct || 0,
    discount_highlight: false,
    apply_withholding_taxes: false,
  }));
  const body = { data: {
    type: 'quote',
    entity: {
      id: client && client.ficId ? client.ficId : null,
      name: client.name || 'Cliente',
      vat_number: client.vat || '',
      tax_code: client.cf || '',
      address_street: client.addr || '',
      address_postal_code: client.zip || '',
      address_city: client.city || '',
      address_province: client.prov || '',
      email: client.email || '',
      certified_email: client.pec || '',
      ei_code: client.sdi || '',
    },
    date: quote.date || new Date().toISOString().slice(0, 10),
    // 'number' OMESSO: FiC lo assegna in automatico alla bozza.
    numeration: '',
    subject: buildFicSubject(quote, client),
    visible_subject: '',
    notes: quote.notes || '',
    items_list: items,
    currency: { id: 'EUR' },
    language: { code: 'it', name: 'Italiano' },
    show_payment_method: false,
    show_payments: false,
    show_totals: 'all',
    e_invoice: false,
  }};
  const r = await ficFetch('POST', `/c/${company}/issued_documents`, body);
  if (!r.ok) return res.status(r.status).json(r.json);
  res.json(r.json.data);
});

// Bind 0.0.0.0 esplicito: accessibile sia da localhost sia dalla LAN
// (necessario per l'uso da iPad/iPhone sullo stesso Wi-Fi del PC).
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const ips = [];
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  console.log('================================================================');
  console.log('Preventivatore Abruzzo Digitale — Backend');
  console.log('================================================================');
  console.log('  Dal PC:        http://localhost:' + PORT);
  for (const ip of ips) console.log('  Dall\'iPad/LAN: http://' + ip + ':' + PORT);
  console.log('================================================================');
});
