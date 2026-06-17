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
function isAdminish(role) { return role === 'admin' || role === 'super_admin'; }
function auth(requiredRole) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token mancante' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      if (requiredRole === 'admin' && !isAdminish(payload.role)) {
        return res.status(403).json({ error: 'Solo admin' });
      }
      if (requiredRole === 'super_admin' && payload.role !== 'super_admin') {
        return res.status(403).json({ error: 'Solo super admin' });
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
  if (u.suspended) {
    return res.status(403).json({ error: 'Utente sospeso. Contatta un amministratore.' });
  }
  const user = { username: u.username, name: u.name, role: u.role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// ============================================================
// Gestione utenti (admin / super_admin)
// ============================================================
app.get('/users', auth('admin'), (req, res) => {
  const rows = db.prepare('SELECT username, name, role, suspended, profile FROM users ORDER BY username').all();
  res.json(rows.map(r => ({
    username: r.username, name: r.name, role: r.role,
    suspended: !!r.suspended,
  })));
});

app.post('/users', auth('admin'), (req, res) => {
  const me = req.user;
  const { username, name, role, password } = req.body || {};
  const u = String(username || '').trim().toLowerCase();
  const n = String(name || '').trim();
  const r = String(role || 'operator');
  const p = String(password || '');
  if (!u || !n || !p) return res.status(400).json({ error: 'username, name e password sono obbligatori' });
  if (!['operator', 'admin', 'super_admin'].includes(r)) return res.status(400).json({ error: 'Ruolo non valido' });
  // Solo super_admin può creare altri super_admin / admin
  if ((r === 'super_admin' || r === 'admin') && me.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super admin può creare admin' });
  }
  const exists = db.prepare('SELECT username FROM users WHERE username = ?').get(u);
  if (exists) return res.status(409).json({ error: 'Username già in uso' });
  const { hash, salt } = hashPassword(p);
  db.prepare('INSERT INTO users (username, name, role, pass_hash, pass_salt) VALUES (?, ?, ?, ?, ?)').run(u, n, r, hash, salt);
  res.json({ ok: true, username: u });
});

app.put('/users/:username', auth('admin'), (req, res) => {
  const me = req.user;
  const target = String(req.params.username || '').toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(target);
  if (!u) return res.status(404).json({ error: 'Utente non trovato' });

  // Regole di sicurezza:
  // - Solo super_admin può modificare un super_admin (e nessuno può degradare luigi a operator)
  // - Solo super_admin può cambiare ruolo
  const wantsRoleChange = req.body.role && req.body.role !== u.role;
  const wantsSuspend    = req.body.suspended != null && !!req.body.suspended !== !!u.suspended;
  if (u.role === 'super_admin' && me.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo un altro super admin può modificare un super admin' });
  }
  if (wantsRoleChange && me.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super admin può cambiare ruolo' });
  }
  if (wantsRoleChange && req.body.role === 'super_admin' && me.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super admin può promuovere a super admin' });
  }
  if (target === 'luigi' && wantsRoleChange && req.body.role !== 'super_admin') {
    return res.status(403).json({ error: 'L\'utente luigi non può essere degradato (super admin fondatore)' });
  }
  if (target === me.username && wantsSuspend) {
    return res.status(400).json({ error: 'Non puoi sospendere te stesso' });
  }

  const updates = {};
  if (req.body.name != null)      updates.name = String(req.body.name).trim() || u.name;
  if (wantsRoleChange)            updates.role = req.body.role;
  if (req.body.suspended != null) updates.suspended = req.body.suspended ? 1 : 0;
  if (req.body.password)          {
    const { hash, salt } = hashPassword(String(req.body.password));
    updates.pass_hash = hash;
    updates.pass_salt = salt;
  }
  if (!Object.keys(updates).length) return res.json({ ok: true, noop: true });

  const setSql = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${setSql} WHERE username = @target`).run(Object.assign({ target }, updates));
  res.json({ ok: true });
});

app.delete('/users/:username', auth('admin'), (req, res) => {
  const me = req.user;
  const target = String(req.params.username || '').toLowerCase();
  if (target === me.username) return res.status(400).json({ error: 'Non puoi cancellare te stesso' });
  if (target === 'luigi')      return res.status(403).json({ error: 'L\'utente luigi non può essere cancellato (super admin fondatore)' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(target);
  if (!u) return res.status(404).json({ error: 'Utente non trovato' });
  if (u.role === 'super_admin' && me.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super admin può cancellare un super admin' });
  }
  db.prepare('DELETE FROM users WHERE username = ?').run(target);
  res.json({ ok: true });
});

// ----- Helpers store generico (quotes/clients) -----
function rowToObj(row) {
  const o = JSON.parse(row.data);
  o.syncId = row.sync_id;
  o._deleted = !!row.deleted;
  o._updatedAt = row.updated_at;
  return o;
}

// ----- Activity log -----
// Campi "watchable" per entità. Solo questi sono diffati e loggati: evita
// rumore (es. updatedAt) e protegge campi che non sono effettivamente
// modificati dall'utente.
const CLIENT_WATCH = [
  'name', 'brand', 'aliases', 'contact', 'email', 'phone', 'addr', 'city', 'prov', 'vat', 'cf', 'notes',
  'socialType', 'operativeArea', 'operativeSubtype', 'socialSubtype', 'webSubtype', 'graficaSubtype', 'consulenzaSubtype',
  'operativeAreasOverride', 'defaultAssignee', 'operativeStatus',
  // Cadenza social per Generatore PED
  'pubblicazioniMensili', 'nPostMese', 'nCaroselliMese', 'nReelMese', 'nStoriesMese', 'toneOfVoice',
  // Brand Kit Canva associato al cliente (per personalizzare il design generato).
  // canvaBrandKitId è l'ID logico Brand Kit (deriva da brand_id Canva o surrogato).
  // canvaBrandId è il brand_id Canva reale (null se Canva non lo ha ritornato).
  // canvaBrandTemplateIds è la lista dei template legati a quel brand.
  // I 2 campi `canvaBrandTemplate*` sono legacy (back-compat con record salvati).
  'canvaBrandKitId', 'canvaBrandKitName', 'canvaBrandId', 'canvaBrandTemplateIds',
  'canvaBrandTemplateId', 'canvaBrandTemplateName',
];
const QUOTE_WATCH  = ['tag', 'notes', 'appuntiCommerciali', 'briefOperativo', 'signedAt', 'expectedStartDate', 'expectedEndDate', 'pipelineStage', 'status', 'clientName', 'contractType'];
const LINE_WATCH   = ['name', 'net', 'quantity', 'discountPct', 'udm', 'area'];

// Etichette human-readable mostrate nel feed Attività
const FIELD_LABEL = {
  name: 'Ragione sociale', brand: 'Brand', aliases: 'Brand secondari',
  contact: 'Referente', email: 'Email', phone: 'Telefono',
  addr: 'Indirizzo', city: 'Città', prov: 'Provincia', vat: 'P.IVA', cf: 'Codice fiscale',
  notes: 'Note',
  tag: 'Titolo contratto', signedAt: 'Data firma',
  appuntiCommerciali: 'Appunti commerciali', briefOperativo: 'Brief operativo',
  expectedStartDate: 'Data inizio', expectedEndDate: 'Data fine',
  pipelineStage: 'Stato pipeline', status: 'Stato',
  clientName: 'Nome cliente sul contratto',
  contractType: 'Tipo contratto',
  // Piano editoriale social
  assigned_to: 'Operatore', due_date: 'Scadenza',
  tags: 'Tag', attachments: 'Allegati',
  deleted: 'Task eliminato',
  socialType: 'Tipo piano (legacy)',
  operativeArea: 'Area operativa (legacy)',
  operativeSubtype: 'Sotto-categoria (legacy)',
  socialSubtype: 'Sotto-categoria Social',
  webSubtype: 'Sotto-categoria Web',
  graficaSubtype: 'Sotto-categoria Grafica',
  consulenzaSubtype: 'Sotto-categoria Consulenza',
  operativeAreasOverride: 'Override aree operative',
  defaultAssignee: 'Operatore predefinito',
};
// Sotto-etichette per i campi delle voci (lines)
const LINE_FIELD_LABEL = {
  name: 'Nome voce',
  net: 'Prezzo netto',
  quantity: 'Quantità',
  discountPct: 'Sconto %',
  udm: 'Unità di misura',
  area: 'Area',
};

function _norm(v) {
  // null/undefined/'' considerati equivalenti per il diff
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v.length ? v : null;
  return v;
}

// Per i campi numerici, equipariamo 0 a null/undefined: nei record creati prima
// che esistesse un campo (es. discountPct), il valore è undefined. L'input number
// del form lo legge come 0 (default). Senza questa normalizzazione il diff
// segnalerebbe "vuoto → 0" come modifica, ma di fatto non lo è.
function _normNum(v) {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n === 0 ? null : n;
}

function _equal(a, b) {
  const na = _norm(a), nb = _norm(b);
  if (na === nb) return true;
  if (Array.isArray(na) && Array.isArray(nb)) {
    if (na.length !== nb.length) return false;
    return na.every((x, i) => _equal(x, nb[i]));
  }
  return false;
}

// Equal per campi numerici "morbidi": 0 == null == undefined == ''
function _equalNum(a, b) {
  return _normNum(a) === _normNum(b);
}

// Confronto speciale per signedAt: ISO completo (con ore/secondi) vs input
// type=date che è "YYYY-MM-DD". Se il giorno coincide consideriamo invariato:
// evita rumore quando l'utente non tocca il campo ma il client lo riscrive.
function _equalDay(a, b) {
  if (_equal(a, b)) return true;
  const day = v => {
    if (!v) return null;
    try { return new Date(v).toISOString().slice(0, 10); } catch { return null; }
  };
  const da = day(a), db_ = day(b);
  return !!da && da === db_;
}

// Ritorna array di diff fra oldObj/newObj, limitati alla watchList.
// Per le voci (lines), fa il match per INDICE (le linee del progetto non
// hanno id stabili). I diff line-level includono lineName (presa dalla
// versione new se esiste, altrimenti dalla old) per il render umano.
function diffObjects(oldObj, newObj, watchList, lineWatch = null) {
  const out = [];
  const o = oldObj || {};
  const n = newObj || {};
  for (const k of watchList) {
    // Campi data: confronta solo il giorno (lato server e client lavorano
    // su YYYY-MM-DD; preserviamo ore originali ma non logghiamo se day uguale).
    const dayField = (k === 'signedAt' || k === 'expectedStartDate' || k === 'expectedEndDate');
    if (dayField ? _equalDay(o[k], n[k]) : _equal(o[k], n[k])) continue;
    out.push({ field: k, oldValue: o[k] ?? null, newValue: n[k] ?? null });
  }
  if (lineWatch && (Array.isArray(o.lines) || Array.isArray(n.lines))) {
    const oldLines = o.lines || [];
    const newLines = n.lines || [];
    const max = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < max; i++) {
      const ol = oldLines[i];
      const nl = newLines[i];
      // Aggiunta nuova riga
      if (!ol && nl) {
        out.push({
          field: 'line.added',
          lineIndex: i,
          lineName: nl.name || '(senza nome)',
          oldValue: null,
          newValue: { name: nl.name, net: nl.net, quantity: nl.quantity },
        });
        continue;
      }
      // Rimozione riga
      if (ol && !nl) {
        out.push({
          field: 'line.removed',
          lineIndex: i,
          lineName: ol.name || '(senza nome)',
          oldValue: { name: ol.name, net: ol.net, quantity: ol.quantity },
          newValue: null,
        });
        continue;
      }
      // Diff campo per campo sulla stessa riga
      for (const k of lineWatch) {
        // Campi numerici "morbidi": equiparo 0/null/'' per evitare diff fasulli
        // quando l'input form ha default 0 e il record originale aveva undefined.
        const isNumField = (k === 'discountPct' || k === 'net' || k === 'quantity');
        const equal = isNumField ? _equalNum(ol[k], nl[k]) : _equal(ol[k], nl[k]);
        if (equal) continue;
        out.push({
          field: 'line.' + k,
          lineIndex: i,
          // Nome di riferimento: nuovo se c'è (per il caso in cui sia stato rinominato),
          // altrimenti vecchio.
          lineName: nl.name || ol.name || '(senza nome)',
          oldValue: ol[k] ?? null,
          newValue: nl[k] ?? null,
        });
      }
    }
  }
  return out;
}

const insertActivity = db.prepare(`
  INSERT INTO activity_log (entity_type, entity_id, field, line_index, line_name, old_value, new_value, user_id, user_name, ts)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function logActivity(entityType, entityId, diffs, actor) {
  if (!diffs || !diffs.length) return;
  const ts = new Date().toISOString();
  const userId = (actor && actor.username) || null;
  const userName = (actor && actor.name) || userId || null;
  // node:sqlite non espone db.transaction() (è API di better-sqlite3).
  // Uso BEGIN/COMMIT espliciti per atomicità su batch multipli.
  db.exec('BEGIN');
  try {
    for (const d of diffs) {
      insertActivity.run(
        entityType, String(entityId), d.field,
        d.lineIndex != null ? d.lineIndex : null,
        d.lineName || null,
        JSON.stringify(d.oldValue ?? null),
        JSON.stringify(d.newValue ?? null),
        userId, userName, ts
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[activity] fallito log diff:', e.message);
  }
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

function saveQuote(q, actor) {
  if (!q.syncId) q.syncId = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  // Recupera versione precedente per il diff (solo se l'utente è loggato)
  let prev = null;
  if (actor) {
    const row = db.prepare('SELECT data FROM quotes WHERE sync_id = ?').get(q.syncId);
    if (row) { try { prev = JSON.parse(row.data); } catch {} }
  }
  // Enrichment cliente: se il quote ha clientId locale o clientSyncId ma manca
  // il clientName, lo recuperiamo. Cruciale per le viste cross-modulo
  // (Situazione operativa, Oracolo, fatturazione) che agganciano per name/syncId.
  if (!q.clientName && (q.clientSyncId || q.clientId != null)) {
    let clientRow = null;
    if (q.clientSyncId) {
      clientRow = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(q.clientSyncId);
    }
    // Se non lo troviamo via syncId, proviamo a cercare un cliente con quel clientId locale
    if (!clientRow && q.clientId != null) {
      const all = db.prepare('SELECT data, sync_id FROM clients WHERE deleted = 0').all();
      for (const r of all) {
        try {
          const c = JSON.parse(r.data);
          if (c.id === q.clientId) { clientRow = r; q.clientSyncId = q.clientSyncId || r.sync_id; break; }
        } catch {}
      }
    }
    if (clientRow) {
      try {
        const c = JSON.parse(clientRow.data);
        q.clientName = c.name || c.ragioneSociale || '';
      } catch {}
    }
  }
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
  // Logga solo se c'era già una versione precedente: la prima creazione
  // non genera entry "Modificato da null → X" che sarebbero rumore.
  if (prev && actor) {
    logActivity('quote', q.syncId, diffObjects(prev, q, QUOTE_WATCH, LINE_WATCH), actor);
  }
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

app.post('/quotes', auth(), (req, res) => res.json(saveQuote(req.body || {}, req.user)));

app.put('/quotes/:syncId', auth(), (req, res) => {
  const q = req.body || {};
  q.syncId = req.params.syncId;
  res.json(saveQuote(q, req.user));
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

function saveClient(c, actor) {
  if (!c.syncId) c.syncId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  let prev = null;
  if (actor) {
    const row = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(c.syncId);
    if (row) { try { prev = JSON.parse(row.data); } catch {} }
  }
  c.updatedAt = new Date().toISOString();
  upsertClient.run({
    sync_id: c.syncId,
    name: c.name || c.ragioneSociale || null,
    updated_at: c.updatedAt,
    deleted: c._deleted ? 1 : 0,
    data: JSON.stringify(c),
  });
  if (prev && actor) {
    logActivity('client', c.syncId, diffObjects(prev, c, CLIENT_WATCH), actor);
  }
  return c;
}

app.get('/clients', auth(), (req, res) => res.json(listStore('clients', { since: req.query.since })));
app.post('/clients', auth(), (req, res) => res.json(saveClient(req.body || {}, req.user)));
app.put('/clients/:syncId', auth(), (req, res) => {
  const c = req.body || {};
  c.syncId = req.params.syncId;
  res.json(saveClient(c, req.user));
});

// ============================================================
// PIANO EDITORIALE SOCIAL — matrice cliente × mese × anno
// ============================================================
// Stati ammessi (allineati al foglio Excel di Mattia).
const SOCIAL_STATUSES = [
  'da_fare', 'pronto', 'in_approvazione', 'revisione',
  'approvato', 'programmato', 'stand_by', 'lancio', 'finito',
];
// Etichette human-readable per UI e activity log.
const SOCIAL_STATUS_LABEL = {
  da_fare: 'Da fare', pronto: 'Pronto', in_approvazione: 'In approvazione',
  revisione: 'Revisione', approvato: 'Approvato', programmato: 'Programmato',
  stand_by: 'Stand by', lancio: 'Lancio', finito: 'Finito',
};
const SOCIAL_TASK_WATCH = ['status', 'assigned_to', 'due_date', 'notes', 'tags', 'attachments'];

function socialRowToObj(r) {
  if (!r) return null;
  return {
    id: r.id,
    clientSyncId: r.client_sync_id,
    quoteSyncId: r.quote_sync_id || null,
    year: r.year,
    month: r.month,
    status: r.status,
    statusLabel: SOCIAL_STATUS_LABEL[r.status] || r.status,
    assignedTo: r.assigned_to,
    dueDate: r.due_date,
    notes: r.notes,
    tags: safeJsonParse(r.tags) || [],
    attachments: safeJsonParse(r.attachments) || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// UPSERT con quote_sync_id come parte della chiave (gestita via COALESCE per
// il caso NULL). Lo statement è preparato dinamicamente in saveSocialTask.

function saveSocialTask(t, actor) {
  if (!t.clientSyncId) throw new Error('clientSyncId richiesto');
  if (!Number.isInteger(t.year) || !Number.isInteger(t.month)) throw new Error('year/month richiesti');
  if (t.status && !SOCIAL_STATUSES.includes(t.status)) throw new Error('status non valido: ' + t.status);
  const quoteSyncId = t.quoteSyncId || null;

  // Recupera versione precedente per il diff. Lookup per la tripla logica
  // (clientSyncId, quoteSyncId, year, month) usando IS per gestire NULL.
  let prev = null;
  if (actor) {
    const row = db.prepare(`
      SELECT * FROM social_tasks
      WHERE client_sync_id = ? AND year = ? AND month = ?
        AND (quote_sync_id IS ? OR (quote_sync_id IS NULL AND ? IS NULL))
    `).get(t.clientSyncId, t.year, t.month, quoteSyncId, quoteSyncId);
    if (row) prev = socialRowToObj(row);
  }

  const now = new Date().toISOString();
  // Se esiste già il record (stessa quadrupla logica) lo UPDATE, altrimenti INSERT.
  // SQLite supporta `INSERT ... ON CONFLICT(<index>) DO UPDATE` solo se l'index
  // è UNIQUE. Il nostro indice `uniq_social_task` lo è.
  if (prev) {
    db.prepare(`
      UPDATE social_tasks
        SET status=?, assigned_to=?, due_date=?, notes=?, tags=?, attachments=?, updated_at=?
      WHERE id=?
    `).run(
      t.status || 'da_fare',
      t.assignedTo || null,
      t.dueDate || null,
      t.notes || null,
      t.tags ? JSON.stringify(t.tags) : null,
      t.attachments ? JSON.stringify(t.attachments) : null,
      now,
      prev.id
    );
  } else {
    db.prepare(`
      INSERT INTO social_tasks (client_sync_id, quote_sync_id, year, month, status, assigned_to, due_date, notes, tags, attachments, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      t.clientSyncId,
      quoteSyncId,
      t.year,
      t.month,
      t.status || 'da_fare',
      t.assignedTo || null,
      t.dueDate || null,
      t.notes || null,
      t.tags ? JSON.stringify(t.tags) : null,
      t.attachments ? JSON.stringify(t.attachments) : null,
      now,
      now,
    );
  }

  // Rileggo per ritornare la versione fresca
  const row = db.prepare(`
    SELECT * FROM social_tasks
    WHERE client_sync_id = ? AND year = ? AND month = ?
      AND (quote_sync_id IS ? OR (quote_sync_id IS NULL AND ? IS NULL))
  `).get(t.clientSyncId, t.year, t.month, quoteSyncId, quoteSyncId);
  const updated = socialRowToObj(row);

  // Log delle modifiche (solo se c'era una versione precedente)
  if (prev && actor) {
    const diffs = diffObjects(
      // Mappo a snake_case per allineare ai watch names del log
      { status: prev.status, assigned_to: prev.assignedTo, due_date: prev.dueDate, notes: prev.notes, tags: prev.tags, attachments: prev.attachments },
      { status: updated.status, assigned_to: updated.assignedTo, due_date: updated.dueDate, notes: updated.notes, tags: updated.tags, attachments: updated.attachments },
      SOCIAL_TASK_WATCH
    );
    if (diffs.length) logActivity('social_task', String(updated.id), diffs, actor);
  }
  return updated;
}

// GET /social/tasks?year=&month=&assignedTo=&status=&clientSyncId=&quoteSyncId=
// Tutti opzionali. Filtra in AND.
app.get('/social/tasks', auth(), (req, res) => {
  const { year, month, assignedTo, status, clientSyncId, quoteSyncId } = req.query;
  let sql = 'SELECT * FROM social_tasks WHERE 1=1';
  const p = [];
  if (year)         { sql += ' AND year = ?';           p.push(parseInt(year, 10)); }
  if (month)        { sql += ' AND month = ?';          p.push(parseInt(month, 10)); }
  if (assignedTo)   { sql += ' AND assigned_to = ?';    p.push(assignedTo); }
  if (status)       { sql += ' AND status = ?';         p.push(status); }
  if (clientSyncId) { sql += ' AND client_sync_id = ?'; p.push(clientSyncId); }
  if (quoteSyncId)  { sql += ' AND quote_sync_id = ?';  p.push(quoteSyncId); }
  // Se operator, vede solo i suoi (salvo abbia esplicitamente filtrato)
  if (req.user.role === 'operator' && !assignedTo) {
    sql += ' AND assigned_to = ?'; p.push(req.user.username);
  }
  sql += ' ORDER BY year, month, client_sync_id';
  const rows = db.prepare(sql).all(...p).map(socialRowToObj);
  res.json(rows);
});

app.post('/social/tasks', auth(), (req, res) => {
  try { res.json(saveSocialTask(req.body || {}, req.user)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/social/tasks/:id', auth(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM social_tasks WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Task non trovato' });
  // Il body deve contenere clientSyncId/quoteSyncId/year/month (immutabili) — li forzo da DB
  const body = req.body || {};
  body.clientSyncId = row.client_sync_id;
  body.quoteSyncId  = row.quote_sync_id;
  body.year = row.year;
  body.month = row.month;
  try { res.json(saveSocialTask(body, req.user)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/social/tasks/:id', auth(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = db.prepare('DELETE FROM social_tasks WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Task non trovato' });
  // Logga la rimozione su activity_log
  logActivity('social_task', String(id), [{ field: 'deleted', oldValue: true, newValue: null }], req.user);
  res.json({ ok: true });
});

// Import wizard: parsing del file Excel di Mattia.
// Accetta il file raw via body application/octet-stream (no multer/multipart).
// Ritorna { ricorsivi: [{name, prefix}], stagionali: [...] } pronti per
// la fase di abbinamento UI.
app.post('/social/import/parse', auth(), express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.body);
    const out = {};
    for (const ws of wb.worksheets) {
      const names = [];
      ws.eachRow({ includeEmpty: false }, (row, rIdx) => {
        if (rIdx === 1) return;
        const v = row.getCell(1).value;
        if (!v || typeof v !== 'string') return;
        const raw = v.trim();
        const m = raw.match(/^\[(\w+)\]\s*(.+)$/);
        names.push({
          name: m ? m[2].trim() : raw,
          prefix: m ? m[1] : null, // 'V', 'J', etc.
          raw,
        });
      });
      const key = ws.name.toLowerCase().includes('stag') ? 'stagionali' : 'ricorsivi';
      out[key] = names;
    }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: 'Parsing fallito: ' + (e.message || e) });
  }
});

// Applica gli abbinamenti scelti dall'utente nell'Import Wizard.
// Body: { items: [{ clientSyncId? | ficId?, brand?, socialType, defaultAssignee? }] }
// Per ogni item:
//   - se clientSyncId: aggiorna il cliente locale esistente
//   - se ficId (e non esiste locale con quel ficId): chiama FiC per i dati,
//     crea un cliente locale placeholder, poi applica i campi piano editoriale
async function applySocialImportItem(it, actor) {
  let row;
  if (it.clientSyncId) {
    row = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(it.clientSyncId);
    if (!row) throw new Error('cliente locale non trovato: ' + it.clientSyncId);
  } else if (it.ficId) {
    // Cerca prima un locale che ha già questo ficId
    const all = db.prepare('SELECT data FROM clients WHERE deleted = 0').all();
    for (const r of all) {
      try {
        const c = JSON.parse(r.data);
        if (c.ficId === it.ficId) { row = r; break; }
      } catch {}
    }
    if (!row) {
      // Non esiste: lo creo dai dati FiC
      if (!ficConfigured()) throw new Error('FiC non configurato, impossibile creare cliente da ficId');
      const co = process.env.FIC_COMPANY_ID;
      const r = await ficFetch('GET', `/c/${co}/entities/clients/${it.ficId}`);
      if (!r.ok) throw new Error('Lettura cliente FiC fallita: HTTP ' + r.status);
      const f = (r.json && r.json.data) || {};
      const placeholder = {
        name: f.name || '(senza nome)',
        vat: f.vat_number || '',
        cf: f.tax_code || '',
        addr: f.address_street || '',
        city: f.address_city || '',
        prov: f.address_province || '',
        email: f.email || '',
        phone: f.phone || '',
        contact: f.contact_person || '',
        ficId: f.id || it.ficId,
        fromFic: true,
      };
      saveClient(placeholder, actor); // questo gli assegna un syncId nuovo
      // Rileggo subito il record fresco
      row = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(placeholder.syncId);
    }
  } else {
    throw new Error('item senza clientSyncId né ficId');
  }
  const c = JSON.parse(row.data);
  // Nuovo schema: operativeArea + operativeSubtype.
  // Backward compat: se il client manda socialType legacy lo mappiamo.
  if (it.operativeArea)    c.operativeArea = it.operativeArea;
  if (it.operativeSubtype) c.operativeSubtype = it.operativeSubtype;
  if (it.socialType && !it.operativeArea) {
    c.socialType = it.socialType;
    c.operativeArea = 'social';
    c.operativeSubtype = it.socialType === 'ricorsivo' ? 'mensili' : (it.socialType === 'stagionale' ? 'stagionali' : null);
  }
  if (it.defaultAssignee) c.defaultAssignee = it.defaultAssignee;
  if (it.brand && !c.brand) c.brand = it.brand;
  saveClient(c, actor);
}

app.post('/social/import/apply', auth(), async (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve essere array' });
  const results = { applied: 0, skipped: 0, errors: [] };
  for (const it of items) {
    if (!it.clientSyncId && !it.ficId) { results.skipped++; continue; }
    try {
      await applySocialImportItem(it, req.user);
      results.applied++;
    } catch (e) {
      results.errors.push({ ref: it.clientSyncId || it.ficId, error: e.message });
    }
  }
  res.json(results);
});

// Mappa il legacy socialType (ricorsivo/stagionale) ai nuovi campi area+subtype.
// Lazy: viene applicata al volo durante le letture, non scrive in DB.
function deriveOperativeFields(c) {
  let area = c.operativeArea;
  let subtype = c.operativeSubtype;
  if (!area && c.socialType) {
    area = 'social';
    subtype = c.socialType === 'ricorsivo' ? 'mensili'
            : c.socialType === 'stagionale' ? 'stagionali'
            : null;
  }
  return { area, subtype };
}

// ----- Situazione operativa: deriva le aree del cliente dai contratti attivi -----
// Un cliente è "attivo" se ha almeno un quote con pipelineStage in
// ['firmato', 'in_produzione']. Le sue AREE operative sono l'unione
// delle line.area dei suoi contratti attivi, più eventuali override
// manuali in operativeAreasOverride. Se l'override è valorizzato, vince
// sul dedotto.
const ACTIVE_PIPELINE_STAGES = ['firmato', 'in_produzione'];
// Aree operative riconosciute. 'consulenza' aggiunta su richiesta del 2026-05-22.
// 'menu' e 'altro' restano per compat con il configuratore esistente, ma non
// hanno tab dedicate nel piano operativo.
const KNOWN_OPERATIVE_AREAS = ['social', 'web', 'grafica', 'consulenza', 'menu', 'altro'];

function getClientActiveQuotes(clientSyncId, clientName, allQuotes) {
  // Match per clientSyncId (preferito) o per clientName (fallback)
  return allQuotes.filter(q => {
    if (!q || q._deleted) return false;
    if (!ACTIVE_PIPELINE_STAGES.includes(q.pipelineStage)) return false;
    if (q.clientSyncId && q.clientSyncId === clientSyncId) return true;
    if (q.clientName && clientName &&
        String(q.clientName).trim().toLowerCase() === String(clientName).trim().toLowerCase()) return true;
    return false;
  });
}

// Un cliente è "scaduto" se ha avuto contratti ma TUTTI sono completati/cancellati
// (= zero contratti in stato firmato/in_produzione). Distinto dal cliente
// "needsContract" che invece non ha MAI avuto contratti.
function isClientExpired(clientSyncId, clientName, allQuotes) {
  const allClientQuotes = allQuotes.filter(q => {
    if (!q || q._deleted) return false;
    if (q.clientSyncId && q.clientSyncId === clientSyncId) return true;
    if (q.clientName && clientName &&
        String(q.clientName).trim().toLowerCase() === String(clientName).trim().toLowerCase()) return true;
    return false;
  });
  if (!allClientQuotes.length) return false; // mai avuto contratti → "needsContract", non scaduto
  const active = allClientQuotes.filter(q => ACTIVE_PIPELINE_STAGES.includes(q.pipelineStage));
  return active.length === 0; // tutti i contratti chiusi/completati
}

// Deduce l'area da una voce: prima usa l.area se valida, altrimenti
// cerca pattern nel nome (fallback per quote creati con area vuota).
function inferLineArea(l) {
  if (!l) return null;
  if (l.area && KNOWN_OPERATIVE_AREAS.includes(l.area)) return l.area;
  const n = String(l.name || '').toLowerCase();
  if (/\b(social|smm|meta\s*ads|instagram|tiktok|linkedin|facebook|reel|stor(y|ies))\b/.test(n)) return 'social';
  if (/\b(sito|website|web\s*design|landing|e-?commerce|wordpress|hosting|dominio|manutenzione\s+(web|sito))\b/.test(n)) return 'web';
  if (/\b(grafica|logo|brand\s*identity|menu\s+(digitale|cartaceo)|flyer|locandina|brochure|packaging|cover)\b/.test(n)) return 'grafica';
  if (/\b(consulenza|consult|strateg(ia|ic)|audit|analisi|coaching|formazione)\b/.test(n)) return 'consulenza';
  return null;
}

function getClientOperativeAreas(client, activeQuotes) {
  // Override manuale ha precedenza assoluta
  if (Array.isArray(client.operativeAreasOverride) && client.operativeAreasOverride.length) {
    return client.operativeAreasOverride.filter(a => KNOWN_OPERATIVE_AREAS.includes(a));
  }
  // Dedotto dalle voci dei contratti attivi: usa area esplicita oppure inferenza dal nome
  const set = new Set();
  for (const q of activeQuotes) {
    for (const l of (q.lines || [])) {
      const area = inferLineArea(l);
      if (area && KNOWN_OPERATIVE_AREAS.includes(area)) set.add(area);
    }
  }
  // Fallback legacy: se nessuna area dedotta MA il cliente ha flag manuali
  // (socialSubtype/webSubtype) o legacy operativeArea, mappa
  if (!set.size) {
    if (client.socialSubtype) set.add('social');
    if (client.webSubtype)    set.add('web');
    if (!set.size) {
      const { area } = deriveOperativeFields(client);
      if (area) set.add(area);
    }
  }
  return Array.from(set);
}

// Metadati: lista stati + clienti del piano operativo derivati da
// Situazione clienti. Un cliente entra qui se ha almeno un contratto
// firmato/in_produzione, oppure (per backward compat con l'import iniziale)
// se ha flag operativi manuali (socialSubtype/webSubtype/legacy operativeArea).
// Per ogni cliente: array areas (deduce da contratti + override) + i
// subtypes per ogni area + flag needsContract se mancano contratti.
app.get('/social/meta', auth(), (req, res) => {
  const clientRows = db.prepare(`SELECT * FROM clients WHERE deleted = 0`).all();
  const quoteRows = db.prepare(`SELECT data FROM quotes WHERE deleted = 0`).all();
  const allQuotes = quoteRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

  const piano = [];
  for (const r of clientRows) {
    let c;
    try { c = JSON.parse(r.data); } catch { continue; }
    const activeQuotes = getClientActiveQuotes(r.sync_id, c.name, allQuotes);
    const hasActive = activeQuotes.length > 0;
    const expired = isClientExpired(r.sync_id, c.name, allQuotes);
    // Backward compat: il cliente ha flag manuali settati anche se non ha contratti?
    const hasLegacyFlag = !!(c.socialSubtype || c.webSubtype || c.graficaSubtype || c.consulenzaSubtype || c.operativeArea || c.socialType);
    if (!hasActive && !expired && !hasLegacyFlag) continue;
    // Per gli scaduti, le aree sono "storiche" (prese dai contratti completati)
    let areas;
    if (expired) {
      const allClientQuotes = allQuotes.filter(q => {
        if (!q || q._deleted) return false;
        if (q.clientSyncId === r.sync_id) return true;
        if (q.clientName && c.name && String(q.clientName).trim().toLowerCase() === String(c.name).trim().toLowerCase()) return true;
        return false;
      });
      areas = getClientOperativeAreas(c, allClientQuotes);
    } else {
      areas = getClientOperativeAreas(c, activeQuotes);
    }
    if (!areas.length) continue;
    // Sintesi contratti per la matrice: tag + stage di ogni quote attivo del cliente.
    // L'UI mostra il primo nella colonna "Contratto" e il dettaglio completo nel popup.
    const todayMs = Date.now();
    const contractsSummary = (expired ? [] : activeQuotes).map(q => {
      // Stato operativo PER LAVORAZIONE (richiesta Luigi 2026-05-25):
      //   sospeso    = flag manuale sul quote (operativeStatus='sospeso') o stage 'sospeso'
      //   terminato  = expectedEndDate passata o stage 'terminato'
      //   attivo     = altrimenti (firmato / in_produzione)
      let qOpStatus = 'attivo';
      const qOverride = q.operativeStatus || null;
      if (qOverride === 'sospeso' || q.pipelineStage === 'sospeso') qOpStatus = 'sospeso';
      else if (q.pipelineStage === 'terminato') qOpStatus = 'terminato';
      else if (q.expectedEndDate && new Date(q.expectedEndDate).getTime() < todayMs) qOpStatus = 'terminato';
      return {
        syncId: q.syncId,
        number: q.number || null,
        tag: q.tag || '(senza titolo)',
        pipelineStage: q.pipelineStage,
        operativeStatus: qOpStatus,
        signedAt: q.signedAt || null,
        expectedStartDate: q.expectedStartDate || null,
        expectedEndDate: q.expectedEndDate || null,
        contractType: q.contractType || null,
        monthly: (q.lines || []).reduce((sum, l) => {
          const u = String(l && l.udm || '').toLowerCase();
          const p = String(l && l.period || '').toLowerCase();
          if (p === 'monthly' || ['mese','mesi','mensile'].includes(u)) {
            const gross = (l.net || 0) * (l.quantity || 1);
            return sum + gross * (1 - (l.discountPct || 0) / 100) / (l.quantity || 1);
          }
          return sum;
        }, 0),
        net: (q.lines || []).reduce((sum, l) => {
          const gross = (l.net || 0) * (l.quantity || 1);
          return sum + gross * (1 - (l.discountPct || 0) / 100);
        }, 0),
        linesCount: (q.lines || []).length,
      };
    });
    // Stato operativo del cliente:
    //   attivo     = ha contratti firmato/in_produzione
    //   sospeso    = flag manuale c.operativeStatus === 'sospeso'
    //   terminato  = expired (tutti contratti chiusi)
    let operativeStatus = 'attivo';
    if (c.operativeStatus === 'sospeso') operativeStatus = 'sospeso';
    else if (expired) operativeStatus = 'terminato';
    else if (!hasActive) operativeStatus = 'sospeso'; // ha flag legacy ma no contratti attivi

    piano.push({
      syncId: r.sync_id,
      name: c.name,
      brand: c.brand || '',
      areas,
      socialSubtype:     c.socialSubtype     || (areas.includes('social')     ? 'mensili'      : null),
      webSubtype:        c.webSubtype        || (areas.includes('web')        ? 'manutenzione' : null),
      graficaSubtype:    c.graficaSubtype    || null,
      consulenzaSubtype: c.consulenzaSubtype || null,
      defaultAssignee: c.defaultAssignee || null,
      needsContract: !hasActive && !expired, // mai avuto contratti
      isExpired: expired,                    // aveva contratti, ora tutti chiusi
      activeContractsCount: activeQuotes.length,
      contracts: contractsSummary,
      operativeStatus,
    });
  }
  res.json({
    statuses: SOCIAL_STATUSES.map(s => ({ key: s, label: SOCIAL_STATUS_LABEL[s] })),
    areas: [
      // 'Tutti' è gestito come tab speciale lato frontend (no sub-tab)
      { key: 'social', label: 'Social', subtypes: [
        { key: 'all',         label: 'Tutti',      isDefault: true },
        { key: 'mensili',     label: 'Mensili' },
        { key: 'stagionali',  label: 'Stagionali' },
      ]},
      { key: 'web', label: 'Web', subtypes: [
        { key: 'all',          label: 'Tutti',      isDefault: true },
        { key: 'manutenzione', label: 'Manutenzione e aggiornamento' },
        { key: 'sito',         label: 'Siti web' },
      ]},
      { key: 'grafica', label: 'Grafica', subtypes: [
        { key: 'all',  label: 'Tutti',  isDefault: true },
      ]},
      { key: 'consulenza', label: 'Consulenza', subtypes: [
        { key: 'all',  label: 'Tutti',  isDefault: true },
      ]},
      // 'Scaduti' è tab speciale lato frontend (mostra solo isExpired=true)
    ],
    clients: piano.sort((a, b) => (a.brand || a.name).localeCompare(b.brand || b.name, 'it')),
  });
});

// Bootstrap dei contratti placeholder per clienti del piano senza contratti attivi.
// Usato una tantum dopo l'import iniziale dall'Excel di Mattia.
// Body: { syncIds?: string[] } — se omesso, processa TUTTI quelli senza contratto.
app.post('/social/bootstrap-contracts', auth('admin'), (req, res) => {
  const targetSyncIds = (req.body && Array.isArray(req.body.syncIds)) ? req.body.syncIds : null;
  const clientRows = db.prepare(`SELECT * FROM clients WHERE deleted = 0`).all();
  const quoteRows = db.prepare(`SELECT data FROM quotes WHERE deleted = 0`).all();
  const allQuotes = quoteRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

  const created = [];
  const skipped = [];
  for (const r of clientRows) {
    if (targetSyncIds && !targetSyncIds.includes(r.sync_id)) continue;
    let c;
    try { c = JSON.parse(r.data); } catch { continue; }
    const hasLegacyFlag = !!(c.socialSubtype || c.webSubtype || c.operativeArea || c.socialType);
    if (!hasLegacyFlag) { skipped.push({ syncId: r.sync_id, reason: 'no_flag' }); continue; }
    const activeQuotes = getClientActiveQuotes(r.sync_id, c.name, allQuotes);
    if (activeQuotes.length) { skipped.push({ syncId: r.sync_id, reason: 'already_active' }); continue; }
    // Determina l'area del placeholder: social se ha socialSubtype, web se webSubtype, altrimenti dal legacy
    let area = 'social';
    if (c.webSubtype) area = 'web';
    else if (c.operativeArea === 'web') area = 'web';

    const today = new Date();
    const todayIso = today.toISOString();
    const placeholder = {
      clientName: c.name,
      clientSyncId: r.sync_id,
      clientId: c.id || null,
      tag: `Contratto bootstrap ${area}`,
      pipelineStage: 'firmato',
      status: 'firmato',
      signedAt: todayIso,
      expectedStartDate: today.toISOString().slice(0, 10),
      contractType: area === 'social' ? 'continuativo' : 'una_tantum',
      lines: [{
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: area === 'social' ? 'Servizi social media (da rivedere)' : 'Servizi web (da rivedere)',
        net: 0,
        quantity: 1,
        discountPct: 0,
        udm: area === 'social' ? 'mese' : 'una tantum',
        area: area,
        period: area === 'social' ? 'monthly' : 'oneoff',
      }],
      notes: 'Contratto generato automaticamente dal bootstrap del piano operativo. Aggiorna voci e dati reali.',
      createdAt: todayIso,
      createdBy: (req.user && req.user.username) || 'system',
      _bootstrap: true,
    };
    const saved = saveQuote(placeholder, req.user);
    created.push({ syncId: r.sync_id, name: c.name, quoteSyncId: saved.syncId, area });
  }
  res.json({ created: created.length, skipped: skipped.length, details: { created, skipped } });
});

// ============================================================
// LLM — astrazione provider AI (Gemini per ora)
// ============================================================
const llm = require('./llm/provider');

// Endpoint di test: chiamato dalla card Integrazioni → Google AI per
// verificare che la chiave funzioni e il modello risponda.
app.post('/llm/test', auth('admin'), async (req, res) => {
  try {
    const result = await llm.testConnection(db);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ============================================================
// PED — Generatore Piani Editoriali Social
// ------------------------------------------------------------
// Per ora le integrazioni Canva/Drive sono stubbate: ritornano
// mock realistici finché Luigi non configura i token nelle
// Integrazioni. Lo schema in DB è già reale (ped_briefs,
// ped_memory, ped_assets) così quando i token arrivano basta
// sostituire i mock con le chiamate vere.
// ============================================================

// Stato collegamento provider (Canva / Google Drive). Legge dalla tabella
// `integrations` se la riga è marcata configured=1 e ritorna l'account
// associato (nome account loggato via OAuth). Finché OAuth non è
// completato, ritorna `connected: false` con nessun account.
app.get('/ped/integrations/status', auth(), (req, res) => {
  const provider = String(req.query.provider || 'canva');
  // L'integrazione Google copre sia Gmail sia Drive (Google Doc va su Drive).
  // Canva è una integrazione separata.
  const map = { canva: 'canva', google_drive: 'google', google_doc: 'google', drive: 'google' };
  const name = map[provider] || provider;
  const row = db.prepare('SELECT configured, config, last_status FROM integrations WHERE name = ?').get(name);
  if (!row || !row.configured) {
    return res.json({ provider: name, connected: false, account: null, configRoute: name });
  }
  let cfg = {};
  try { cfg = JSON.parse(row.config || '{}'); } catch {}
  // OAuth-only providers: 'connected' è true SOLO se il flow OAuth è
  // stato completato (refresh_token presente). Le sole credenziali statiche
  // (client_id/client_secret) non bastano per chiamare le API.
  let connected = false;
  if (name === 'google') connected = !!(cfg.oauth_complete || cfg.refresh_token);
  else if (name === 'canva') connected = !!(cfg.oauth_complete || cfg.refresh_token);
  else connected = !!row.configured;
  // Stato intermedio: credenziali salvate ma OAuth da fare → ritorniamo
  // `credsOnly: true` così il frontend può mostrare un messaggio diverso.
  const credsOnly = !connected && !!(cfg.client_id && cfg.client_secret);
  res.json({
    provider: name,
    connected,
    credsOnly,
    account: cfg.connected_email || cfg.connected_account || cfg.account_email || cfg.account_name || cfg.workspace || (connected ? 'collegato' : null),
    lastStatus: row.last_status,
    configRoute: name,
  });
});

// Lista risorse del cliente per il provider scelto. `kind`:
//   'strategy'      → progetti contenenti la strategia approvata
//   'media_folder'  → cartelle contenenti media (foto/reel)
//   'template'      → template PED (Brand Templates)
// Per Canva: chiama davvero l'API se OAuth completato, altrimenti _notConfigured.
app.post('/ped/resources/list', auth(), async (req, res) => {
  const { provider, clientSyncId, kind, query, parentId, driveId, navigate } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider richiesto' });
  // clientSyncId è opzionale: in fase 1 navighiamo l'intero account.
  const map = { canva: 'canva', drive_pdf: 'google', google_doc: 'google', drive: 'google' };
  const integName = map[provider] || provider;

  // ============ CANVA ============
  if (integName === 'canva') {
    const cfg = getCanvaConfig();
    if (!cfg || !cfg.refresh_token) {
      return res.json({ items: [], _notConfigured: true, provider: integName, kind, reason: 'Canva non collegato (OAuth non completato)' });
    }
    try {
      // kind=strategy/template → design; kind=media_folder → folder
      if (kind === 'media_folder') {
        // ===== NAVIGATE MODE: dentro una specifica folder, no BFS =====
        // Quando l'utente clicca una cartella per entrarci, vogliamo solo
        // i figli diretti di quella folder (rapido, niente esplorazione
        // ricorsiva). parentId='root' o specifico.
        if (navigate && parentId) {
          const out = [];
          let continuation = null;
          for (let i = 0; i < 5; i++) {
            let path = `/folders/${parentId}/items?item_types=folder&limit=100`;
            if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`;
            const r = await canvaFetch('GET', path);
            if (!r.ok) {
              if (i === 0) return res.json({ items: [], _apiError: true, status: r.status, message: (r.json && r.json.message) || 'Canva API error' });
              break;
            }
            const items = (r.json && r.json.items) || [];
            for (const it of items) {
              const f = it.folder || it;
              out.push({
                id: f.id,
                name: f.name || 'cartella',
                icon: '📁',
                subtitle: 'Sotto-cartella',
                modified: f.updated_at ? new Date(f.updated_at * 1000).toLocaleDateString('it-IT') : null,
                _hasChildren: true, // assume sì, lo scopriremo aprendola
              });
            }
            continuation = r.json && r.json.continuation;
            if (!continuation) break;
          }
          return res.json({
            items: out,
            provider: integName,
            kind,
            parentId,
            _navigate: true,
            _account: cfg.connected_email || cfg.connected_account || null,
            _live: true,
          });
        }

        // ===== INITIAL LOAD: BFS profondità 2 dal root =====
        // BFS profondità 2: prendiamo TUTTE le top-level (paginate), poi per
        // ognuna scendiamo nei figli e nei nipoti. I team workspace Canva
        // tipicamente organizzano "Team Abruzzo Digitale" › "Clienti" › "X cliente".
        // Limiti: 500 cartelle totali, 100 per parent, 2 livelli sub.
        const MAX_TOTAL = 500;
        const MAX_PER_PARENT = 100;
        const allFolders = []; // { id, name, parentName, fullPath, depth, updated_at }
        const seenIds = new Set();

        // Helper: paginazione + accumulo in `outArr`
        const fetchFolderItems = async (parentId, maxPerParent) => {
          const out = [];
          let continuation = null;
          for (let i = 0; i < 3; i++) { // max 3 pagine = 300 item per parent
            let path = `/folders/${parentId}/items?item_types=folder&limit=${maxPerParent}`;
            if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`;
            const r = await canvaFetch('GET', path);
            if (!r.ok) break;
            const items = (r.json && r.json.items) || [];
            for (const it of items) out.push(it.folder || it);
            continuation = r.json && r.json.continuation;
            if (!continuation) break;
          }
          return out;
        };

        // Livello 0 (root)
        const rootFolders = await fetchFolderItems('root', MAX_PER_PARENT);
        for (const f of rootFolders) {
          if (allFolders.length >= MAX_TOTAL) break;
          if (seenIds.has(f.id)) continue;
          seenIds.add(f.id);
          allFolders.push({ id: f.id, name: f.name || 'cartella', parentName: null, fullPath: f.name, depth: 0, updated_at: f.updated_at });
        }

        // Livello 1 (figli delle root)
        const level1Parents = [...rootFolders];
        for (const parent of level1Parents) {
          if (allFolders.length >= MAX_TOTAL) break;
          try {
            const children = await fetchFolderItems(parent.id, 50);
            for (const cf of children) {
              if (allFolders.length >= MAX_TOTAL) break;
              if (seenIds.has(cf.id)) continue;
              seenIds.add(cf.id);
              allFolders.push({
                id: cf.id,
                name: cf.name || 'cartella',
                parentName: parent.name || null,
                fullPath: `${parent.name} › ${cf.name}`,
                depth: 1,
                updated_at: cf.updated_at,
                _grandparent: parent.id,
              });
            }
            // Livello 2 (nipoti): naviga ogni figlio per pescare sub-cartelle
            for (const child of children.slice(0, 20)) {
              if (allFolders.length >= MAX_TOTAL) break;
              try {
                const grandChildren = await fetchFolderItems(child.id, 30);
                for (const gc of grandChildren) {
                  if (allFolders.length >= MAX_TOTAL) break;
                  if (seenIds.has(gc.id)) continue;
                  seenIds.add(gc.id);
                  allFolders.push({
                    id: gc.id,
                    name: gc.name || 'cartella',
                    parentName: child.name || null,
                    fullPath: `${parent.name} › ${child.name} › ${gc.name}`,
                    depth: 2,
                    updated_at: gc.updated_at,
                  });
                }
              } catch {}
            }
          } catch {}
        }

        // Filtro per query lato server (Canva non lo supporta su /folders/items)
        const filtered = query
          ? allFolders.filter(f =>
              (f.name + ' ' + (f.fullPath || '')).toLowerCase().includes(String(query).toLowerCase()))
          : allFolders;

        const items = filtered.map(f => ({
          id: f.id,
          name: f.name,
          icon: f.depth === 0 ? '📁' : (f.depth === 1 ? '📂' : '📑'),
          subtitle: f.fullPath !== f.name ? f.fullPath : (f.depth === 0 ? 'Cartella Canva' : 'Sub-cartella'),
          modified: f.updated_at ? new Date(f.updated_at * 1000).toLocaleDateString('it-IT') : null,
          _depth: f.depth,
          _hasChildren: true,  // ogni folder Canva potenzialmente ha figli
        }));

        return res.json({
          items,
          provider: integName,
          kind,
          _account: cfg.connected_email || cfg.connected_account || null,
          _totalFound: items.length,
          _live: true,
          _depths: { d0: items.filter(x => x._depth === 0).length, d1: items.filter(x => x._depth === 1).length, d2: items.filter(x => x._depth === 2).length },
        });
      }
      // kind = 'strategy' o default: lista design filtrabili per nome
      const q = query ? `&query=${encodeURIComponent(query)}` : '';
      const r = await canvaFetch('GET', `/designs?ownership=any&limit=30${q}`);
      if (!r.ok) return res.json({ items: [], _apiError: true, status: r.status, message: r.json.message || 'Canva API error' });
      const items = ((r.json && r.json.items) || []).map(d => ({
        id: d.id,
        name: d.title || `Design ${d.id.slice(0, 6)}`,
        icon: '🎨',
        subtitle: 'Canva design',
        ref: (d.urls && d.urls.edit_url) || d.id,
        modified: d.updated_at ? new Date(d.updated_at * 1000).toLocaleDateString('it-IT') : null,
        thumbnail: d.thumbnail && d.thumbnail.url,
      }));
      return res.json({ items, provider: integName, kind, _live: true });
    } catch (e) {
      return res.json({ items: [], _apiError: true, message: String(e.message || e) });
    }
  }

  // ============ GOOGLE (Drive) ============
  if (integName === 'google') {
    const cfg = getGoogleConfig();
    if (!cfg || !cfg.refresh_token) {
      return res.json({ items: [], _notConfigured: true, provider: integName, kind, reason: 'Google non collegato (OAuth non completato)' });
    }
    try {
      // Per kind=media_folder: ritorno la lista combinata di
      //   - Shared Drives (Workspace) di cui l'utente è membro
      //   - Folder al primo livello di "My Drive"
      // Quando l'utente naviga DENTRO una cartella, navigate=true e
      // parentId è l'id della folder (o del Shared Drive se è il root di un Drive).
      if (kind === 'media_folder') {
        // ===== NAVIGATE MODE: dentro folder/drive specifico =====
        if (navigate && parentId) {
          // Se driveId è passato siamo dentro un Shared Drive (parentId potrebbe
          // essere il driveId stesso al primo livello, o una sub-folder dentro).
          const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
          const params = new URLSearchParams({
            q: '',
            pageSize: '200',
            fields: 'files(id,name,modifiedTime,parents,driveId,mimeType)',
            orderBy: 'name',
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
          });
          // Quando navighiamo dentro uno Shared Drive specifico, restringi a quel drive
          if (driveId) {
            params.set('corpora', 'drive');
            params.set('driveId', driveId);
          } else {
            params.set('corpora', 'allDrives');
          }
          // (q non può essere passato con set perché già encodato — uso URLSearchParams: ricostruisco)
          const finalUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&${params.toString().replace(/^q=&/, '')}`;
          const r = await googleFetch('GET', finalUrl);
          if (!r.ok) {
            return res.json({ items: [], _apiError: true, status: r.status, message: (r.json.error && r.json.error.message) || 'Drive API error' });
          }
          const items = (r.json.files || []).map(f => ({
            id: f.id,
            name: f.name,
            icon: '📁',
            subtitle: 'Sotto-cartella Drive',
            modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('it-IT') : null,
            _driveId: f.driveId || driveId || null,
            _hasChildren: true,
          }));
          return res.json({ items, provider: integName, kind, parentId, driveId: driveId || null, _navigate: true, _live: true });
        }

        // ===== INITIAL LOAD: Shared Drives + My Drive root =====
        const items = [];

        // 1. Lista Shared Drives
        const drivesRes = await googleFetch('GET', 'https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name,createdTime)');
        if (drivesRes.ok && drivesRes.json.drives) {
          for (const d of drivesRes.json.drives) {
            items.push({
              id: d.id,
              name: d.name,
              icon: '👥',
              subtitle: 'Drive condiviso (Workspace)',
              modified: d.createdTime ? new Date(d.createdTime).toLocaleDateString('it-IT') : null,
              _kind: 'shared_drive',
              _driveId: d.id,        // per Shared Drives, l'id del drive = l'id stesso
              _hasChildren: true,    // gli Shared Drive sono navigabili dentro
            });
          }
        }

        // 2. Folder al primo livello di My Drive (escludendo Shared)
        const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false");
        const myFolders = await googleFetch('GET',
          `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&fields=files(id,name,modifiedTime,parents)&orderBy=name`);
        if (myFolders.ok && myFolders.json.files) {
          for (const f of myFolders.json.files) {
            items.push({
              id: f.id,
              name: f.name,
              icon: '📁',
              subtitle: 'Cartella in My Drive',
              modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('it-IT') : null,
              _kind: 'my_drive_folder',
              _driveId: null,        // My Drive: niente driveId
              _hasChildren: true,
            });
          }
        }

        // Filtro per query se passata
        const filtered = query
          ? items.filter(it => it.name.toLowerCase().includes(String(query).toLowerCase()))
          : items;

        return res.json({ items: filtered, provider: integName, kind, _live: true,
          counts: { sharedDrives: items.filter(x => x._kind === 'shared_drive').length,
                    myDriveFolders: items.filter(x => x._kind === 'my_drive_folder').length } });
      }

      // kind=strategy o default: file (Doc, PDF, ecc.) filtrabili per nome
      const params = new URLSearchParams({
        pageSize: '50',
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink)',
        orderBy: 'modifiedByMeTime desc',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        corpora: 'allDrives',
      });
      // Filtro: documenti Google Docs/PDF, esclude folder e file in cestino
      let qFilter = `(mimeType='application/vnd.google-apps.document' or mimeType='application/pdf') and trashed=false`;
      if (query) qFilter += ` and name contains '${String(query).replace(/'/g, "\\'")}'`;
      params.set('q', qFilter);
      const r = await googleFetch('GET', `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      if (!r.ok) return res.json({ items: [], _apiError: true, status: r.status, message: r.json.error && r.json.error.message });
      const items = (r.json.files || []).map(f => ({
        id: f.id,
        name: f.name,
        icon: f.mimeType === 'application/pdf' ? '📄' : '📝',
        subtitle: f.mimeType === 'application/pdf' ? 'PDF Drive' : 'Google Doc',
        ref: f.webViewLink || f.id,
        modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('it-IT') : null,
      }));
      return res.json({ items, provider: integName, kind, _live: true });
    } catch (e) {
      return res.json({ items: [], _apiError: true, message: String(e.message || e) });
    }
  }

  return res.json({ items: [], _notConfigured: true, provider: integName, kind });
});

// Lettura strategia: dato source + ref, ritorna i punti chiave estratti.
// In futuro: fetch Canva project, parse PDF Drive, scan Google Doc.
app.post('/ped/strategy/parse', auth(), (req, res) => {
  const { source, ref, clientSyncId } = req.body || {};
  if (!source) return res.status(400).json({ error: 'source required' });
  // STUB: mock realistico basato su source. Da rimpiazzare con parser veri.
  const integ = db.prepare('SELECT configured FROM integrations WHERE name = ?').get(source === 'canva' ? 'canva' : 'google_drive');
  const live = integ && integ.configured ? true : false;
  const mock = {
    tone: 'Caldo, professionale, ispirazionale',
    pillars: ['Behind the scenes', 'Prodotti & servizi', 'Testimonianze', 'Lifestyle locale'],
    target: '25–45 anni, area Abruzzo, interessi lifestyle e qualità della vita',
    frequency: '3 post a settimana + 2 reel + 1 carosello',
    warnings: ref ? [] : ['Nessun riferimento risorsa fornito: serve URL/ID della strategia'],
    source,
    _mock: !live,
  };
  res.json(mock);
});

// Lista asset disponibili per (cliente, mese): Canva folder + indice Drive.
// Marca ogni asset come usedBefore se appare già in ped_memory per quel cliente.
app.post('/ped/assets/list', auth(), (req, res) => {
  const { clientSyncId, mode } = req.body || {};
  if (!clientSyncId) return res.status(400).json({ error: 'clientSyncId required' });
  // Asset già marcati come "usati" in memoria PED (qualsiasi mese passato)
  const usedRows = db.prepare(`
    SELECT asset_key, last_used_at, variant FROM ped_assets WHERE client_sync_id = ?
  `).all(clientSyncId);
  const usedMap = new Map(usedRows.map(r => [r.asset_key, { date: r.last_used_at, variant: r.variant }]));
  // STUB: in futuro qui si chiamano le API Canva (Brand Kit folder) e Drive
  // (cartella media del cliente). Asset divisi per mediaType:
  //   foto      → selezionabili (Brand Kit / Drive)
  //   reel      → selezionabili (Brand Kit / Drive)
  //   carosello → PLACEHOLDER, non selezionabili (creati in fase 2)
  const stubs = [
    { id: 'canva-photo-01', name: 'Shooting interno locale',     mediaType: 'foto',      variant: 'originale',            driveMatch: true,  source: 'canva' },
    { id: 'canva-photo-02', name: 'Dettaglio piatto signature',  mediaType: 'foto',      variant: 'originale',            driveMatch: true,  source: 'canva' },
    { id: 'canva-photo-03', name: 'Vista esterna sera',          mediaType: 'foto',      variant: 'parzialmente modificata', driveMatch: true,  source: 'canva' },
    { id: 'drive-photo-04', name: 'Persone al tavolo',           mediaType: 'foto',      variant: 'originale',            driveMatch: false, source: 'drive' },
    { id: 'canva-photo-05', name: 'Logo + claim',                mediaType: 'foto',      variant: 'con testi/logo',       driveMatch: true,  source: 'canva' },
    { id: 'drive-photo-06', name: 'BTS staff cucina',            mediaType: 'foto',      variant: 'originale',            driveMatch: true,  source: 'drive' },
    { id: 'canva-reel-01',  name: 'Reel preparazione signature',  mediaType: 'reel',      variant: 'originale',            driveMatch: true,  source: 'canva' },
    { id: 'drive-reel-02',  name: 'Reel apertura locale',         mediaType: 'reel',      variant: 'originale',            driveMatch: false, source: 'drive' },
    { id: 'carousel-ph-01', name: 'Carosello "Collezione Estate"', mediaType: 'carosello', variant: 'carosello',           driveMatch: false, source: 'canva' },
    { id: 'carousel-ph-02', name: 'Carosello "Tutorial signature"', mediaType: 'carosello', variant: 'carosello',          driveMatch: false, source: 'canva' },
  ].map(a => ({ ...a, usedBefore: usedMap.get(a.id) || null }));
  res.json({ assets: stubs, mode: mode || 'auto', _mock: true });
});

// Genera/salva il brief PED per (cliente, mese). Persistenza reale: scrive
// ped_briefs + aggiorna ped_assets con le immagini "usate" e logga in ped_memory.
// Canva/Trello restano placeholder.
// ============================================================
// /ped/sources/scan — legge gli asset reali (foto, video) dalle cartelle
// scelte dall'operatore nello step Fonti. Ritorna lista unificata + counter.
// Input: { sources: [{ provider, folderId, folderName, driveId? }] }
// Output: { assets: [{ id, name, type, thumbUrl, source, sourceFolder, ... }], counts: { foto, reel, totale }, errors }
// ============================================================
app.post('/ped/sources/scan', auth(), async (req, res) => {
  const { sources, clientSyncId } = req.body || {};
  if (!Array.isArray(sources) || !sources.length) {
    return res.status(400).json({ error: 'Nessuna fonte selezionata' });
  }
  const assets = [];
  const errors = [];
  const seenIds = new Set();

  // Helper: classifica un asset come foto/reel/altro
  const classify = (mimeOrExt) => {
    const s = String(mimeOrExt || '').toLowerCase();
    if (s.includes('image/') || /\.(jpe?g|png|webp|heic|gif|tiff?)$/.test(s)) return 'foto';
    if (s.includes('video/') || /\.(mp4|mov|avi|webm|mkv)$/.test(s)) return 'reel';
    return 'altro';
  };

  for (const src of sources) {
    try {
      if (src.provider === 'canva') {
        // Canva: list items in folder (item_types=image,video)
        // Paginazione fino a 5 pagine (max ~500 asset per folder).
        let continuation = null;
        for (let i = 0; i < 5; i++) {
          let path = `/folders/${src.folderId}/items?item_types=image,video&limit=100`;
          if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`;
          const r = await canvaFetch('GET', path);
          if (!r.ok) {
            if (i === 0) errors.push({ source: src, error: 'Canva HTTP ' + r.status });
            break;
          }
          const items = (r.json && r.json.items) || [];
          for (const it of items) {
            // item può essere image, video, design — riconosciamoli dal tipo
            const obj = it.image || it.video || it.asset || it;
            const id = obj.id || it.id;
            if (!id || seenIds.has('canva:' + id)) continue;
            seenIds.add('canva:' + id);
            const isVideo = !!it.video;
            const type = isVideo ? 'reel' : 'foto';
            assets.push({
              id: 'canva:' + id,
              nativeId: id,
              source: 'canva',
              sourceFolder: src.folderName || src.folderId,
              sourceFolderId: src.folderId,
              name: obj.name || obj.title || ('Asset ' + id.slice(0, 6)),
              type,
              thumbUrl: (obj.thumbnail && obj.thumbnail.url) || (obj.url) || null,
              modified: obj.updated_at ? new Date(obj.updated_at * 1000).toISOString() : null,
            });
          }
          continuation = r.json && r.json.continuation;
          if (!continuation) break;
        }
      } else if (src.provider === 'drive' || src.provider === 'google' || src.provider === 'google_drive') {
        // Drive: list image+video files in folder
        const qFilter = `'${src.folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed=false`;
        const params = new URLSearchParams({
          q: qFilter,
          pageSize: '500',
          fields: 'files(id,name,mimeType,modifiedTime,thumbnailLink,webContentLink,iconLink,driveId)',
          orderBy: 'modifiedTime desc',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });
        if (src.driveId) {
          params.set('corpora', 'drive');
          params.set('driveId', src.driveId);
        } else {
          params.set('corpora', 'allDrives');
        }
        const r = await googleFetch('GET', `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        if (!r.ok) {
          errors.push({ source: src, error: 'Drive HTTP ' + r.status + ': ' + ((r.json.error && r.json.error.message) || '') });
          continue;
        }
        for (const f of (r.json.files || [])) {
          if (seenIds.has('drive:' + f.id)) continue;
          seenIds.add('drive:' + f.id);
          assets.push({
            id: 'drive:' + f.id,
            nativeId: f.id,
            source: 'drive',
            sourceFolder: src.folderName || src.folderId,
            sourceFolderId: src.folderId,
            driveId: f.driveId || src.driveId || null,
            name: f.name,
            type: classify(f.mimeType),
            thumbUrl: f.thumbnailLink || null,
            mimeType: f.mimeType,
            modified: f.modifiedTime || null,
          });
        }
      } else {
        errors.push({ source: src, error: 'Provider sconosciuto: ' + src.provider });
      }
    } catch (e) {
      errors.push({ source: src, error: String(e.message || e) });
    }
  }

  // Anti-ripetizione: marca asset già usati in PED precedenti del cliente
  let usedKeys = new Set();
  if (clientSyncId) {
    const usedRows = db.prepare(`SELECT asset_key FROM ped_assets WHERE client_sync_id = ?`).all(clientSyncId);
    usedKeys = new Set(usedRows.map(r => r.asset_key));
  }
  for (const a of assets) {
    a.usedBefore = usedKeys.has(a.id);
  }

  const counts = {
    foto:  assets.filter(a => a.type === 'foto').length,
    reel:  assets.filter(a => a.type === 'reel').length,
    totale: assets.length,
    usedBefore: assets.filter(a => a.usedBefore).length,
  };

  res.json({ ok: true, assets, counts, errors });
});

// Helper: calcola la cadenza target del cliente.
// Priorità: campi specifici → totale + distribuzione 50/20/30 → default 6/2/4.
function _computeCadenza(client) {
  const c = client || {};
  const hasSpecific = c.nPostMese != null || c.nReelMese != null || c.nCaroselliMese != null;
  if (hasSpecific) {
    return {
      foto:      Math.max(0, Number(c.nPostMese      || 0)),
      reel:      Math.max(0, Number(c.nReelMese      || 0)),
      carosello: Math.max(0, Number(c.nCaroselliMese || 0)),
      stories:   Math.max(0, Number(c.nStoriesMese   || 0)),
      source: 'specific',
    };
  }
  const tot = Math.max(0, Number(c.pubblicazioniMensili || 0));
  if (tot > 0) {
    return {
      foto:      Math.round(tot * 0.5),
      reel:      Math.round(tot * 0.2),
      carosello: tot - Math.round(tot * 0.5) - Math.round(tot * 0.2),
      stories:   0,
      source: '50/20/30 da totale',
    };
  }
  return { foto: 6, reel: 2, carosello: 4, stories: 0, source: 'default 12/mese' };
}

// Helper: shuffle deterministico (Fisher-Yates con seed dal client+mese)
function _shuffleSeeded(arr, seed) {
  const out = arr.slice();
  let s = (seed || 1) % 2147483647;
  const next = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

app.post('/ped/briefs/generate', auth(), async (req, res) => {
  const { clientSyncId, year, month, strategySource, strategyRef, mode, assets: rawAssets, brief, sources, regeneratePostIndex } = req.body || {};
  if (!clientSyncId || !year || !month) return res.status(400).json({ error: 'clientSyncId, year, month richiesti' });
  const nowIso = new Date().toISOString();

  // ===== Step 1: leggi cliente per cadenza + tone of voice =====
  const clientRow = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(clientSyncId);
  let client = null;
  try { client = clientRow ? JSON.parse(clientRow.data) : null; } catch {}
  const clientName = (client && (client.brand || client.name)) || 'Cliente';
  const cadenza = _computeCadenza(client);
  const toneOfVoice = (client && client.toneOfVoice) || '';
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  // ===== Step 2: pool media disponibili =====
  // Se mode=auto e non ci sono assets pre-selezionati ma ci sono sources,
  // scansiona le fonti e seleziona automaticamente.
  // Se mode=guided/manual e arrivano assets, usali così come sono.
  let pool = Array.isArray(rawAssets) ? rawAssets : [];
  // Report diagnostico per ogni fonte scansionata (mostrato in UI per debug).
  const scanReport = [];
  if ((!pool.length) && Array.isArray(sources) && sources.length) {
    for (const src of sources) {
      const entry = {
        provider: src.provider,
        folderName: src.folderName || src.folderId,
        folderId: src.folderId,
        found: 0,
        foto: 0,
        reel: 0,
        error: null,
      };
      try {
        if (src.provider === 'canva') {
          // Canva Connect API: /folders/{id}/items accetta SOLO item_types
          // tra: design, folder, image. NON 'video'. I video Canva si
          // gestiscono via altri endpoint (TODO fase futura).
          let continuation = null;
          let pagesFetched = 0;
          for (let i = 0; i < 5; i++) {
            let path = `/folders/${src.folderId}/items?item_types=image&limit=100`;
            if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`;
            const r = await canvaFetch('GET', path);
            if (!r.ok) {
              entry.error = `Canva HTTP ${r.status}: ${(r.json && r.json.message) || ''}`;
              break;
            }
            pagesFetched++;
            const items = (r.json && r.json.items) || [];
            for (const it of items) {
              const obj = it.image || it.asset || it;
              const id = obj.id || it.id;
              if (!id) continue;
              const asset = {
                id: 'canva:' + id,
                source: 'canva', type: 'foto',
                name: obj.name || obj.title || ('Asset ' + id.slice(0, 6)),
                thumbUrl: (obj.thumbnail && obj.thumbnail.url) || null,
                sourceFolder: src.folderName,
              };
              pool.push(asset);
              entry.found++;
              entry.foto++;
            }
            continuation = r.json && r.json.continuation;
            if (!continuation) break;
          }
          entry.pages = pagesFetched;
        } else if (src.provider === 'drive' || src.provider === 'google' || src.provider === 'google_drive') {
          // Helper Drive: scan 1 cartella restituendo files + subfolders.
          // Filtro mimeType allargato: image/*, video/*, e google-apps.photo
          // (foto provenienti da Google Photos integrato in Drive).
          const fetchFolderContents = async (folderId, driveId) => {
            const params = new URLSearchParams({
              q: `'${folderId}' in parents and trashed=false`,
              pageSize: '1000',
              fields: 'files(id,name,mimeType,thumbnailLink,modifiedTime,driveId)',
              supportsAllDrives: 'true',
              includeItemsFromAllDrives: 'true',
            });
            if (driveId) { params.set('corpora', 'drive'); params.set('driveId', driveId); }
            else { params.set('corpora', 'allDrives'); }
            const r = await googleFetch('GET', `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
            if (!r.ok) {
              return { ok: false, error: `Drive HTTP ${r.status}: ${(r.json.error && r.json.error.message) || ''}` };
            }
            const all = r.json.files || [];
            const media = [];
            const subfolders = [];
            for (const f of all) {
              const mt = f.mimeType || '';
              if (mt === 'application/vnd.google-apps.folder') {
                subfolders.push(f);
              } else if (
                mt.indexOf('image/') === 0 ||
                mt.indexOf('video/') === 0 ||
                mt === 'application/vnd.google-apps.photo'
              ) {
                media.push(f);
              }
              // Ignora altri tipi (doc, sheet, pdf, ecc.)
            }
            return { ok: true, media, subfolders, total: all.length };
          };

          const addMediaToPool = (files, fromSubfolder) => {
            for (const f of files) {
              const isReel = (f.mimeType || '').indexOf('video/') === 0;
              pool.push({
                id: 'drive:' + f.id,
                source: 'drive',
                type: isReel ? 'reel' : 'foto',
                name: f.name,
                thumbUrl: f.thumbnailLink || null,
                mimeType: f.mimeType,
                sourceFolder: src.folderName + (fromSubfolder ? ' › ' + fromSubfolder : ''),
              });
              entry.found++;
              if (isReel) entry.reel++; else entry.foto++;
            }
          };

          // Step 1: scan diretto della cartella selezionata
          const first = await fetchFolderContents(src.folderId, src.driveId);
          if (!first.ok) {
            entry.error = first.error;
          } else {
            addMediaToPool(first.media, null);
            entry.subfoldersScanned = 0;
            entry.subfoldersFound = first.subfolders.length;
            // Step 2: se cartella diretta ha 0 file ma ha N sotto-cartelle,
            // scendi automaticamente nelle sub-folder (1 livello, max 20).
            if (first.media.length === 0 && first.subfolders.length > 0) {
              const subs = first.subfolders.slice(0, 20);
              for (const sf of subs) {
                const second = await fetchFolderContents(sf.id, sf.driveId || src.driveId);
                if (second.ok) {
                  addMediaToPool(second.media, sf.name);
                  entry.subfoldersScanned++;
                }
              }
              entry.recursedAuto = true;
            }
          }
        } else {
          entry.error = 'Provider sconosciuto: ' + src.provider;
        }
      } catch (e) {
        entry.error = String(e.message || e);
      }
      console.log(`[ped/generate] scan source: ${entry.provider} "${entry.folderName}" → ${entry.found} asset${entry.error ? ' · ERROR: ' + entry.error : ''}`);
      scanReport.push(entry);
    }
  }

  // Filtra anti-ripetizione: escludi asset già usati in PED precedenti del cliente
  const usedRows = db.prepare(`SELECT asset_key FROM ped_assets WHERE client_sync_id = ?`).all(clientSyncId);
  const usedKeys = new Set(usedRows.map(r => r.asset_key));
  const freshPool = pool.filter(a => !usedKeys.has(a.id));
  // Se TUTTI sono già usati, riusiamo i meno recenti (graceful degradation)
  const effectivePool = freshPool.length ? freshPool : pool;

  // ===== Step 3: pipeline AI con Gemini — PIANIFICAZIONE poi COPY =====
  // Provider check
  let aiAvailable = true;
  let aiReason = null;
  try {
    const p = llm.getActiveProvider(db);
    if (!p.available) { aiAvailable = false; aiReason = p.reason; }
  } catch (e) { aiAvailable = false; aiReason = String(e.message || e); }

  // Strategy text: per ora costruito da metadati. In fase 5 parseremo
  // il contenuto vero dalla risorsa Canva/PDF/Doc indicata in strategyRef.
  const strategyText = `Strategia ${strategySource || 'da approvata'} per ${clientName}, mese ${monthLabel}.${strategyRef ? ' Risorsa: ' + strategyRef + '.' : ''}${toneOfVoice ? ' Tone of voice: ' + toneOfVoice + '.' : ''}${brief ? ' Note operatore: ' + brief : ''}`;

  // Style baseline (in futuro estratto da slide reference)
  const style = {
    toneOfVoice: toneOfVoice || 'caldo, professionale, italiano',
    copyLength: 'medium',
    structurePattern: 'hook → claim → CTA',
    emojiUsage: 'light',
  };

  // STEP 3a: estrai strategia in forma strutturata (pillar, target, tone)
  let strategy = { tone: style.toneOfVoice, pillars: [], target: '', frequency: '', warnings: [] };
  if (aiAvailable) {
    try {
      strategy = await llm.extractStrategy(db, strategyText);
      console.log(`[ped/generate] strategy extracted: pillars=[${strategy.pillars.join(', ')}]`);
    } catch (e) {
      console.error(`[ped/generate] extractStrategy fallita:`, e.message);
    }
  }
  // Fallback se Gemini ritorna 0 pillars
  if (!strategy.pillars || !strategy.pillars.length) {
    strategy.pillars = ['Behind the scenes', 'Prodotti & servizi', 'Testimonianze', 'Lifestyle / valori'];
  }

  // STEP 3b: pianifica il calendario editoriale (1 chiamata Gemini)
  let plan = { slots: [] };
  if (aiAvailable) {
    try {
      plan = await llm.planEditorialCalendar(db, {
        strategy, cadenza, monthLabel, clientName,
      });
      console.log(`[ped/generate] plan generato: ${plan.slots.length} slot`);
    } catch (e) {
      console.error(`[ped/generate] planEditorialCalendar fallita:`, e.message);
    }
  }
  // Fallback piano: genera slot round-robin sui pillar
  if (!plan.slots || !plan.slots.length) {
    plan.slots = [];
    const types = [];
    for (let i = 0; i < cadenza.foto; i++) types.push('foto');
    for (let i = 0; i < cadenza.reel; i++) types.push('reel');
    for (let i = 0; i < cadenza.carosello; i++) types.push('carosello');
    types.forEach((t, idx) => {
      const pillar = strategy.pillars[idx % strategy.pillars.length];
      plan.slots.push({
        slotIndex: idx + 1,
        type: t,
        pillar,
        theme: pillar,
        weekIndex: (idx % 4) + 1,
        suggestedSubject: pillar,
        reasoning: 'Distribuzione round-robin sui pillar (fallback senza AI plan)',
      });
    });
  }

  // STEP 3c: per ogni slot, matcha un media reale e genera il copy
  const fotoPoolAll = effectivePool.filter(a => a.type === 'foto');
  const reelPoolAll = effectivePool.filter(a => a.type === 'reel');
  // Tracciamo media già usati in questo PED per non riusarli tra slot
  const usedInThisRun = new Set();
  const pickMedia = (pool, slot) => {
    const available = pool.filter(m => !usedInThisRun.has(m.id));
    const picked = llm.matchMediaToSlot(slot, available);
    if (picked) usedInThisRun.add(picked.id);
    return picked;
  };

  const posts = [];
  const aiErrors = [];
  const slotPromises = plan.slots.map((slot, idx) => {
    if (slot.type === 'carosello') {
      return Promise.resolve({
        type: 'carosello',
        index: idx + 1,
        placeholder: true,
        slot,
        pillar: slot.pillar,
        theme: slot.theme,
        weekIndex: slot.weekIndex,
        reasoning: slot.reasoning,
        headline: `Carosello — ${slot.theme || slot.pillar || 'tema'}`,
        body: `Qui andrà il carosello a tema "${slot.theme || slot.pillar}". Da creare in fase 2 dedicata.`,
        media: null,
      });
    }
    const media = slot.type === 'foto'
      ? pickMedia(fotoPoolAll, slot)
      : pickMedia(reelPoolAll, slot);
    if (!media) {
      // Pool esaurito per quel tipo
      return Promise.resolve({
        type: slot.type,
        index: idx + 1,
        slot,
        pillar: slot.pillar,
        theme: slot.theme,
        weekIndex: slot.weekIndex,
        reasoning: slot.reasoning,
        copy: {
          headline: `[Media mancante] ${slot.theme || slot.pillar}`,
          body: `Pool ${slot.type} esaurito. Carica più ${slot.type === 'foto' ? 'foto' : 'video'} nelle fonti.`,
          hashtags: [], cta: '',
        },
        media: null,
      });
    }
    const genFn = slot.type === 'foto' ? llm.generatePostCopy : llm.generateReelCaption;
    if (!aiAvailable) {
      return Promise.resolve({
        ...media,
        type: slot.type,
        index: idx + 1,
        slot,
        pillar: slot.pillar,
        theme: slot.theme,
        weekIndex: slot.weekIndex,
        reasoning: slot.reasoning,
        copy: slot.type === 'foto'
          ? { headline: `[${slot.pillar}] AI non configurata`, body: '(configura Gemini in Integrazioni)', hashtags: [], cta: '' }
          : { concept: `[${slot.pillar}] AI non configurata`, hook: '', caption: '(configura Gemini)', hashtags: [], soundtype: '' },
      });
    }
    return genFn(db, { strategy, style, slot, media, monthLabel, clientName })
      .then(copy => ({
        ...media,
        type: slot.type,
        index: idx + 1,
        slot,
        pillar: slot.pillar,
        theme: slot.theme,
        weekIndex: slot.weekIndex,
        reasoning: slot.reasoning,
        copy,
      }))
      .catch(err => {
        const errMsg = String(err && err.message ? err.message : err);
        console.error(`[ped/generate] copy gen FAIL slot=${idx + 1} media="${media.name}": ${errMsg}`);
        aiErrors.push({ slot: idx + 1, media: media.name, error: errMsg });
        // Marca esplicitamente il post come failed: la UI mostra banner errore
        // invece di un copy che SEMBRA reale.
        return {
          ...media, type: slot.type, index: idx + 1, slot,
          pillar: slot.pillar, theme: slot.theme, weekIndex: slot.weekIndex, reasoning: slot.reasoning,
          aiFailed: true,
          aiError: errMsg,
          copy: slot.type === 'foto'
            ? { headline: `⚠ Errore Gemini`, body: errMsg, hashtags: [], cta: '' }
            : { concept: `⚠ Errore Gemini`, hook: '', caption: errMsg, hashtags: [], soundtype: '' },
        };
      });
  });
  const allPosts = await Promise.all(slotPromises);
  posts.push(...allPosts);

  // Mock selectedFoto/selectedReel per compatibilità con codice sotto
  const selectedFoto = allPosts.filter(p => p.type === 'foto' && p.media !== null);
  const selectedReel = allPosts.filter(p => p.type === 'reel' && p.media !== null);
  const fotoPool = fotoPoolAll, reelPool = reelPoolAll;

  // ===== Step 5: persistenza brief =====
  const socialTaskId = (db.prepare(`SELECT id FROM social_tasks WHERE client_sync_id = ? AND year = ? AND month = ?`).get(clientSyncId, year, month) || {}).id || null;
  const distribution = {
    foto: selectedFoto.length,
    reel: selectedReel.length,
    carosello: cadenza.carosello,
  };
  const payloadObj = {
    brief: brief || '',
    strategyRef, strategySource,
    mode,
    cadenza,
    style,
    strategy,                // <-- pillar/tone/target estratti
    plan,                    // <-- calendario pianificato
    sources,
    posts,                   // <-- output finale con copy + pillar + reasoning
    poolStats: { total: pool.length, fresh: freshPool.length, foto: fotoPool.length, reel: reelPool.length },
    aiErrors,
  };

  // INSERT/UPDATE: se esiste già un brief in bozza per (client, year, month) lo aggiorniamo
  const existing = db.prepare(`SELECT id FROM ped_briefs WHERE client_sync_id=? AND year=? AND month=? AND status='bozza' ORDER BY id DESC LIMIT 1`).get(clientSyncId, year, month);
  let briefId;
  if (existing) {
    db.prepare(`
      UPDATE ped_briefs SET strategy_source=?, strategy_ref=?, mode=?, asset_ids=?, payload=?, updated_at=?
      WHERE id=?
    `).run(strategySource || null, strategyRef || null, mode || null, JSON.stringify(posts.map(p => p.id || null)), JSON.stringify(payloadObj), nowIso, existing.id);
    briefId = existing.id;
  } else {
    const r = db.prepare(`
      INSERT INTO ped_briefs (client_sync_id, year, month, social_task_id, status, strategy_source, strategy_ref, mode, asset_ids, payload, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(clientSyncId, year, month, socialTaskId, strategySource || null, strategyRef || null, mode || null,
        JSON.stringify(posts.map(p => p.id || null)), JSON.stringify(payloadObj), (req.user && req.user.username) || null, nowIso, nowIso);
    briefId = Number(r.lastInsertRowid);
  }

  // Aggiorna ped_assets: marca ogni media (non placeholder) come usato
  const allUsedMedia = [...selectedFoto, ...selectedReel];
  const upsertAsset = db.prepare(`
    INSERT INTO ped_assets (client_sync_id, asset_key, name, thumb_url, source, variant, used_in_briefs, last_used_at)
    VALUES (?, ?, ?, ?, ?, 'originale', json_array(?), ?)
    ON CONFLICT(client_sync_id, asset_key) DO UPDATE SET
      used_in_briefs = json_insert(used_in_briefs, '$[#]', ?),
      last_used_at   = excluded.last_used_at
  `);
  for (const m of allUsedMedia) {
    try { upsertAsset.run(clientSyncId, m.id, m.name || null, m.thumbUrl || null, m.source || 'canva', briefId, nowIso, briefId); } catch {}
  }

  // Stato integrazioni esterne (per la review UI)
  const canvaOn   = !!((db.prepare('SELECT configured FROM integrations WHERE name = ?').get('canva') || {}).configured);
  const trelloOn  = !!((db.prepare('SELECT configured FROM integrations WHERE name = ?').get('trello') || {}).configured);

  res.json({
    ok: true,
    briefId,
    cadenza,
    distribution,
    poolStats: payloadObj.poolStats,
    scanReport,                       // <-- diagnostica per fonte: count, errori
    strategy,                         // <-- pillar, tone, target estratti
    plan,                             // <-- piano editoriale (slot con pillar+tema+reasoning)
    posts,                            // <-- chiave: la review legge qui (post + copy + pillar)
    aiAvailable, aiReason,
    aiErrors,
    canvaWriteAvailable: false,       // Round 2: scrittura su Canva. Per ora false.
    canvaUrl: null,
    trelloMoved: trelloOn,
    mock: !aiAvailable,
    steps: {
      pool:     { status: 'ok', note: `${pool.length} media trovati, ${effectivePool.length} disponibili (esclusi già usati)` },
      select:   { status: 'ok', note: `selezione: ${distribution.foto} foto + ${distribution.reel} reel + ${distribution.carosello} caroselli placeholder` },
      ai:       { status: aiAvailable ? (aiErrors.length ? 'warn' : 'ok') : 'skipped',
                  note: aiAvailable ? `${posts.filter(p => !p.placeholder).length} copy generati con Gemini${aiErrors.length ? `, ${aiErrors.length} errori` : ''}` : 'Gemini non configurato' },
      memory:   { status: 'ok', note: `${allUsedMedia.length} media marcati "usati" per il cliente` },
      canva:    { status: canvaOn ? 'pending' : 'skipped',
                  note: canvaOn ? 'scrittura Canva: prossima fase' : 'integrazione Canva non configurata' },
      save:     { status: 'ok', note: `brief #${briefId} ${existing ? 'aggiornato' : 'salvato'} in DB` },
    },
  });
});

// Middleware speciale per endpoint usati da <img src>: accetta JWT via query
// (?tok=...) oltre che via header Authorization. Necessario perché <img>
// non può inviare custom headers, ma il sistema serve immagini autenticate.
function authImgTag(req, res, next) {
  const h = req.headers.authorization || '';
  let token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) token = String(req.query.tok || '');
  if (!token) return res.status(401).end('Token mancante');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).end('Token non valido o scaduto');
  }
}

// Proxy thumbnail Drive: il client carica /ped/drive/thumb?id=FILE_ID e
// noi facciamo GET drive con Authorization Bearer poi pipiamo il binary.
// Necessario perché `thumbnailLink` di Drive è un URL temporaneo che non
// funziona da <img src> nel browser (richiede header Authorization).
app.get('/ped/drive/thumb', authImgTag, async (req, res) => {
  const fileId = String(req.query.id || '');
  const size = String(req.query.sz || 'w400');
  if (!fileId) return res.status(400).end('id required');
  try {
    const cfg = getGoogleConfig();
    if (!cfg || !cfg.access_token) return res.status(503).end('Google non collegato');
    // Token refresh proattivo (sfrutta googleFetch refresh logic indirettamente)
    if (!cfg.expires_at || cfg.expires_at < Date.now() + 60 * 1000) {
      // forza refresh facendo una chiamata leggera
      try { await googleFetch('GET', 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'); } catch {}
    }
    const tok = (getGoogleConfig() || {}).access_token;
    // Endpoint thumbnail v3 Drive (richiede bearer)
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) return res.status(r.status).end('drive thumb error');
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(500).end(String(e.message || e));
  }
});

// Rigenera il copy di UN singolo post (chiamato dalla review quando l'op
// clicca "↻ Rigenera" su una card). Più veloce della rigenerazione totale.
app.post('/ped/posts/regenerate', auth(), async (req, res) => {
  try {
    const { media, strategy, style, monthLabel, clientName } = req.body || {};
    if (!media || !media.type) return res.status(400).json({ error: 'media.type richiesto (foto|reel)' });
    const ctx = {
      strategy: strategy || {},
      style: style || { toneOfVoice: 'professionale italiano', copyLength: 'medium', structurePattern: 'hook → claim → CTA', emojiUsage: 'light' },
      mediaDescription: `${media.type === 'foto' ? 'Foto' : 'Reel'} "${media.name}" dalla cartella ${media.sourceFolder || ''}`,
      monthLabel: monthLabel || '',
      clientName: clientName || 'Cliente',
      postIndex: 1, reelIndex: 1,
    };
    const copy = media.type === 'foto'
      ? await llm.generatePostCopy(db, ctx)
      : await llm.generateReelCaption(db, ctx);
    res.json({ ok: true, copy });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Lista Brand Kit dell'account Canva — separati dalle cartelle media.
// Servono per personalizzare il design del cliente (logo, colori, font).
// Brand Kit Canva — fonte di logo/colori/font/foto/grafica per il cliente.
// NOTA importante: Canva Connect API NON espone direttamente l'entità "Brand
// Kit" (la sezione "Brand" che vedi nel menu laterale Canva). Però i Brand
// Templates portano con sé un `brand_id` che identifica il Brand Kit di
// appartenenza. Quindi raggruppiamo i template per brand_id e ritorniamo
// 1 entry per ogni Brand Kit distinto, mostrando quanti template ha.
// Salvando il `brand_id` sul cliente, in fase 2 di scrittura su Canva
// possiamo filtrare i template per brand_id e applicare lo styling corretto.
app.get('/ped/canva/brand-kits', auth(), async (req, res) => {
  const cfg = getCanvaConfig();
  if (!cfg || !cfg.refresh_token) {
    return res.json({ items: [], _notConfigured: true });
  }
  try {
    // Canva Connect API: /brand-templates (richiede scope brandtemplate:meta:read)
    const r = await canvaFetch('GET', '/brand-templates?limit=100');
    if (!r.ok) return res.json({ items: [], _apiError: true, status: r.status, message: (r.json && r.json.message) || 'Canva API error' });
    const templates = (r.json && r.json.items) || [];

    // Raggruppa template per brand_id. Se Canva non popola brand_id, usiamo
    // il singolo template come "Brand Kit" surrogato (caso account senza brand kits).
    const brandMap = new Map();
    for (const bt of templates) {
      const bid = bt.brand_id || `__solo_${bt.id}`;
      if (!brandMap.has(bid)) {
        brandMap.set(bid, {
          brandId: bt.brand_id || null,
          templates: [],
          // Nome del Brand Kit: per ora usiamo il nome del primo template del brand.
          // Idealmente Canva ritorna brand.name ma il campo non è documentato in Connect.
          name: bt.brand && bt.brand.name ? bt.brand.name : null,
          firstThumb: bt.thumbnail && bt.thumbnail.url,
          newestUpdate: bt.updated_at || 0,
        });
      }
      const slot = brandMap.get(bid);
      slot.templates.push({
        id: bt.id,
        name: bt.title || `Template ${bt.id.slice(0, 6)}`,
        thumbnail: bt.thumbnail && bt.thumbnail.url,
        updatedAt: bt.updated_at || 0,
      });
      if ((bt.updated_at || 0) > slot.newestUpdate) {
        slot.newestUpdate = bt.updated_at || 0;
        slot.firstThumb = (bt.thumbnail && bt.thumbnail.url) || slot.firstThumb;
      }
    }

    // Ordina per ultima modifica decrescente
    const grouped = Array.from(brandMap.values()).sort((a, b) => b.newestUpdate - a.newestUpdate);

    const items = grouped.map((g, i) => {
      const realBrand = !!g.brandId;
      const tplCount = g.templates.length;
      const fallbackName = realBrand
        ? `Brand Kit #${g.brandId.slice(0, 8)} (${tplCount} template)`
        : g.templates[0].name;
      return {
        // Quando salviamo, usiamo brandId se disponibile, altrimenti templateId
        // come surrogato (caso "no brand kit, solo template singolo").
        id: g.brandId || g.templates[0].id,
        brandId: g.brandId,                                 // null se surrogato
        templateIds: g.templates.map(t => t.id),
        name: g.name || fallbackName,
        icon: realBrand ? '✨' : '🎨',
        subtitle: realBrand
          ? `Brand Kit · ${tplCount} template${tplCount > 1 ? '' : ''} collegati`
          : 'Template singolo (no Brand Kit dedicato)',
        thumbnail: g.firstThumb,
        modified: g.newestUpdate ? new Date(g.newestUpdate * 1000).toLocaleDateString('it-IT') : null,
        templates: g.templates,                             // lista dettagliata per UI espandibile
      };
    });

    res.json({
      items,
      _live: true,
      account: cfg.connected_email || cfg.connected_account,
      _note: 'Canva Connect API non espone direttamente Brand Kit. Lista derivata raggruppando brand-templates per brand_id.',
    });
  } catch (e) {
    res.json({ items: [], _apiError: true, message: String(e.message || e) });
  }
});

// Ricerca GLOBALE cartelle (non legata al livello corrente del breadcrumb).
// Body: { provider, query, kind?: 'media_folder'|'strategy' }
// Per Drive: ricerca su tutti i Drive accessibili (My + Shared).
// Per Canva: usa search globale folders + design.
app.post('/ped/resources/search', auth(), async (req, res) => {
  const { provider, query, kind } = req.body || {};
  if (!provider || !query) return res.status(400).json({ error: 'provider e query richiesti' });
  const q = String(query).trim();
  if (q.length < 2) return res.json({ items: [], message: 'Query troppo corta (min 2 char)' });

  const map = { canva: 'canva', drive_pdf: 'google', google_doc: 'google', drive: 'google' };
  const integName = map[provider] || provider;

  // ===== CANVA =====
  if (integName === 'canva') {
    const cfg = getCanvaConfig();
    if (!cfg || !cfg.refresh_token) return res.json({ items: [], _notConfigured: true });
    try {
      // Canva: /designs supporta query. Per folders non c'è search globale,
      // facciamo fallback su navigazione root con paginazione.
      if (kind === 'media_folder') {
        // Stessa logica BFS profondità 2 ma filtrata per name (no API search nativa).
        const allFolders = [];
        const seenIds = new Set();
        const fetchItems = async (parentId) => {
          const out = [];
          let cont = null;
          for (let i = 0; i < 3; i++) {
            let path = `/folders/${parentId}/items?item_types=folder&limit=100`;
            if (cont) path += `&continuation=${encodeURIComponent(cont)}`;
            const r = await canvaFetch('GET', path);
            if (!r.ok) break;
            const items = (r.json && r.json.items) || [];
            for (const it of items) out.push(it.folder || it);
            cont = r.json && r.json.continuation;
            if (!cont) break;
          }
          return out;
        };
        const rootF = await fetchItems('root');
        for (const f of rootF) { if (!seenIds.has(f.id)) { seenIds.add(f.id); allFolders.push({ ...f, _path: f.name }); } }
        for (const parent of rootF) {
          const subs = await fetchItems(parent.id);
          for (const sf of subs) {
            if (!seenIds.has(sf.id)) {
              seenIds.add(sf.id);
              allFolders.push({ ...sf, _path: `${parent.name} › ${sf.name}` });
            }
            // 1 livello in più
            const subsubs = await fetchItems(sf.id);
            for (const ssf of subsubs) {
              if (!seenIds.has(ssf.id)) {
                seenIds.add(ssf.id);
                allFolders.push({ ...ssf, _path: `${parent.name} › ${sf.name} › ${ssf.name}` });
              }
            }
          }
        }
        const ql = q.toLowerCase();
        const matched = allFolders.filter(f =>
          (f.name + ' ' + (f._path || '')).toLowerCase().includes(ql)
        );
        return res.json({
          items: matched.map(f => ({
            id: f.id, name: f.name,
            icon: '📁',
            subtitle: f._path !== f.name ? f._path : 'Canva folder',
            modified: f.updated_at ? new Date(f.updated_at * 1000).toLocaleDateString('it-IT') : null,
            _hasChildren: true,
          })),
          _live: true,
        });
      }
      // kind=strategy: search design
      const r = await canvaFetch('GET', `/designs?ownership=any&query=${encodeURIComponent(q)}&limit=30`);
      if (!r.ok) return res.json({ items: [], _apiError: true, message: (r.json && r.json.message) || 'Canva API error' });
      const items = ((r.json && r.json.items) || []).map(d => ({
        id: d.id,
        name: d.title || `Design ${d.id.slice(0, 6)}`,
        icon: '🎨',
        subtitle: 'Canva design',
        ref: (d.urls && d.urls.edit_url) || d.id,
        modified: d.updated_at ? new Date(d.updated_at * 1000).toLocaleDateString('it-IT') : null,
        thumbnail: d.thumbnail && d.thumbnail.url,
      }));
      return res.json({ items, _live: true });
    } catch (e) {
      return res.json({ items: [], _apiError: true, message: String(e.message || e) });
    }
  }

  // ===== GOOGLE DRIVE =====
  if (integName === 'google') {
    const cfg = getGoogleConfig();
    if (!cfg || !cfg.refresh_token) return res.json({ items: [], _notConfigured: true });
    try {
      // Drive: q='name contains "...."' supporta search globale su nome
      const qFilter = kind === 'media_folder'
        ? `mimeType='application/vnd.google-apps.folder' and name contains '${q.replace(/'/g, "\\'")}' and trashed=false`
        : `(mimeType='application/vnd.google-apps.document' or mimeType='application/pdf') and name contains '${q.replace(/'/g, "\\'")}' and trashed=false`;
      const params = new URLSearchParams({
        q: qFilter, pageSize: '50',
        fields: 'files(id,name,mimeType,modifiedTime,parents,driveId,webViewLink,iconLink)',
        orderBy: 'modifiedTime desc',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
      });
      const r = await googleFetch('GET', `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      if (!r.ok) return res.json({ items: [], _apiError: true, message: (r.json.error && r.json.error.message) || 'Drive API error' });
      const items = (r.json.files || []).map(f => ({
        id: f.id,
        name: f.name,
        icon: kind === 'media_folder' ? '📁' : (f.mimeType === 'application/pdf' ? '📄' : '📝'),
        subtitle: kind === 'media_folder' ? 'Drive folder' : (f.mimeType === 'application/pdf' ? 'PDF Drive' : 'Google Doc'),
        ref: f.webViewLink || f.id,
        _driveId: f.driveId || null,
        _hasChildren: kind === 'media_folder',
        modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('it-IT') : null,
      }));
      return res.json({ items, _live: true });
    } catch (e) {
      return res.json({ items: [], _apiError: true, message: String(e.message || e) });
    }
  }

  res.json({ items: [], _notConfigured: true });
});

// Lista clienti con PED già fatti — quick access per lo step Cliente del wizard.
// Per ogni cliente: ultimo brief (mese, status), n. brief totali. Usato per
// mostrare card "Clienti salvati" sopra la search.
app.get('/ped/clients-with-ped', auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT b.client_sync_id, b.year, b.month, b.status, b.updated_at, COUNT(*) OVER (PARTITION BY b.client_sync_id) AS total_briefs
    FROM ped_briefs b
    WHERE b.id IN (
      SELECT MAX(id) FROM ped_briefs GROUP BY client_sync_id
    )
    ORDER BY b.updated_at DESC
    LIMIT 50
  `).all();
  // Arricchisci con dati cliente (brand, name) dal store clients
  const enriched = rows.map(r => {
    const clientRow = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(r.client_sync_id);
    let c = null;
    try { c = clientRow ? JSON.parse(clientRow.data) : null; } catch {}
    return {
      clientSyncId: r.client_sync_id,
      brand: c && (c.brand || c.name) || '(cliente sconosciuto)',
      name: c && c.name || null,
      lastBriefMonth: `${r.year}-${String(r.month).padStart(2,'0')}`,
      lastStatus: r.status,
      lastUpdate: r.updated_at,
      totalBriefs: r.total_briefs,
    };
  });
  res.json({ clients: enriched });
});

// Onboarding state per un cliente: ritorna se ha già brief precedenti
// e con quale configurazione (strategia, fonti). Permette al wizard di
// saltare gli step "stabili" dopo il primo PED.
app.get('/ped/onboarding-state', auth(), (req, res) => {
  const clientSyncId = String(req.query.clientSyncId || '');
  if (!clientSyncId) return res.status(400).json({ error: 'clientSyncId required' });
  // Brand Kit Canva è salvato sul cliente e va recuperato sempre (anche se
  // il cliente non ha ancora brief PED), così la card cliente lo conosce.
  let brandKit = null;
  try {
    const cliRow = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(clientSyncId);
    if (cliRow) {
      const c = JSON.parse(cliRow.data || '{}');
      // Preferenza: canvaBrandKitId (nuovo) > canvaBrandTemplateId (legacy)
      const id = c.canvaBrandKitId || c.canvaBrandTemplateId;
      const name = c.canvaBrandKitName || c.canvaBrandTemplateName || '';
      if (id) {
        brandKit = {
          id,
          name,
          brandId: c.canvaBrandId || null,
          templateIds: Array.isArray(c.canvaBrandTemplateIds) ? c.canvaBrandTemplateIds : [],
        };
      }
    }
  } catch (_) { /* fallback brandKit=null */ }

  const last = db.prepare(`
    SELECT id, year, month, status, strategy_source, strategy_ref, mode, payload, created_at
    FROM ped_briefs
    WHERE client_sync_id = ?
    ORDER BY year DESC, month DESC, id DESC
    LIMIT 1
  `).get(clientSyncId);
  if (!last) {
    return res.json({ hasPriorPed: false, brandKit });
  }
  let payload = {};
  try { payload = JSON.parse(last.payload || '{}'); } catch {}
  res.json({
    hasPriorPed: true,
    lastBriefId: last.id,
    lastBriefAt: last.created_at,
    lastBriefMonth: `${last.year}-${String(last.month).padStart(2, '0')}`,
    lastStatus: last.status,
    strategy: {
      source: last.strategy_source,
      ref: last.strategy_ref,
      resourceName: payload.strategyResourceName || null,
    },
    mode: last.mode,
    sources: payload.sources || [],
    brandKit,
  });
});

// Lista brief PED per cliente (utile per dashboard cliente).
app.get('/ped/briefs', auth(), (req, res) => {
  const { clientSyncId, year, limit } = req.query;
  const max = Math.min(parseInt(limit || '100', 10) || 100, 500);
  let sql = 'SELECT id, client_sync_id, year, month, status, strategy_source, mode, canva_design_id, created_at, updated_at FROM ped_briefs WHERE 1=1';
  const p = [];
  if (clientSyncId) { sql += ' AND client_sync_id = ?'; p.push(clientSyncId); }
  if (year)         { sql += ' AND year = ?';           p.push(parseInt(year, 10)); }
  sql += ' ORDER BY year DESC, month DESC, id DESC LIMIT ?';
  p.push(max);
  res.json({ briefs: db.prepare(sql).all(...p) });
});

// Logga evento di memoria PED (approvazione cliente, pubblicazione effettiva).
app.post('/ped/memory', auth(), (req, res) => {
  const { clientSyncId, briefId, eventType, channel, refUrl, notes } = req.body || {};
  if (!clientSyncId || !eventType) return res.status(400).json({ error: 'clientSyncId, eventType richiesti' });
  const r = db.prepare(`
    INSERT INTO ped_memory (client_sync_id, brief_id, event_type, channel, ref_url, notes, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(clientSyncId, briefId || null, eventType, channel || null, refUrl || null, notes || null, new Date().toISOString());
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

// Endpoint feed attività. Default: 100 righe più recenti per l'entità chiesta.
// Se entityType omesso → feed globale (utile per dashboard supervisore futura).
app.get('/activity', auth(), (req, res) => {
  const { entityType, entityId, limit } = req.query;
  const max = Math.min(parseInt(limit || '100', 10) || 100, 500);
  let sql = 'SELECT * FROM activity_log WHERE 1=1';
  const p = [];
  if (entityType) { sql += ' AND entity_type = ?'; p.push(entityType); }
  if (entityId)   { sql += ' AND entity_id = ?';   p.push(String(entityId)); }
  sql += ' ORDER BY ts DESC, id DESC LIMIT ?';
  p.push(max);
  const rows = db.prepare(sql).all(...p).map(r => {
    // Field può essere 'brand', 'signedAt', 'line.quantity', 'line.added', etc.
    let fieldLabel;
    if (r.field === 'line.added') fieldLabel = 'Voce aggiunta';
    else if (r.field === 'line.removed') fieldLabel = 'Voce rimossa';
    else if (r.field && r.field.startsWith('line.')) {
      const sub = r.field.slice(5);
      fieldLabel = LINE_FIELD_LABEL[sub] || sub;
    } else {
      fieldLabel = FIELD_LABEL[r.field] || r.field;
    }
    return {
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      field: r.field,
      fieldLabel,
      lineIndex: r.line_index,
      lineName: r.line_name,
      oldValue: safeJsonParse(r.old_value),
      newValue: safeJsonParse(r.new_value),
      userId: r.user_id,
      userName: r.user_name,
      ts: r.ts,
    };
  });
  res.json(rows);
});

function safeJsonParse(s) {
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return s; }
}

// ============================================================
// SETTINGS sincronizzabili (loghi brand, KPI, regole, permessi).
// Whitelist esplicita: MAI token/segreti, MAI chiavi di bookkeeping.
// ============================================================
function settingSyncable(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('brand_')) return true;
  if (key.startsWith('login_')) return true;
  if (key.startsWith('notif_')) return true;
  if (key.startsWith('template_')) return true;
  if (key.startsWith('automation_')) return true;
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
// ORACOLO — wizard ricerca su dati FiC + locali.
// L'intent detection è basato su keyword italiani: poche regole
// concrete che coprono le domande più ricorrenti, facili da estendere.
// ============================================================

function oracleNorm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // rimuove accenti
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pulisce una stringa "nome cliente" rimuovendo parole-funzione (preposizioni,
// articoli, parole di intent) che capitano frequentemente quando l'utente
// scrive frasi tipo "fatture di Cold Company" o "situazione del cliente X".
function oracleStripStopwords(s) {
  if (!s) return '';
  const stop = new Set([
    'di','del','dello','della','dei','degli','delle','da','dal','dalla','dai',
    'a','al','allo','alla','agli','alle','su','sul','sulla','sui','sugli','sulle',
    'per','con','in','il','lo','la','i','gli','le','un','una','uno',
    'cliente','clienti','azienda','ditta','ragione','sociale',
    'fattura','fatture','fatt','invoice','invoices',
    'situazione','stato','status','info','informazioni','dettagli','dettaglio',
    'riepilogo','riepilog','aperta','aperte','scaduta','scadute','scadenza',
    'insolute','insoluto','insolut','saldate','saldata','sald','non','pagare','pagamento','pagamenti',
    'anno','mese','periodo','tutte','tutti','tutto',
  ]);
  return s.split(' ')
    .filter(w => w && !stop.has(w) && !/^20\d{2}$/.test(w))
    .join(' ')
    .trim();
}

function oracleDetectIntent(q) {
  const n = oracleNorm(q);
  if (!n) return { intent: 'empty' };

  const year = (n.match(/\b(20\d{2})\b/) || [])[1];
  const yearNum = year ? parseInt(year, 10) : null;

  // === intent espliciti su entità globali ===

  // valore medio / ticket medio (deve precedere unpaid_invoices: contiene "fattur"!)
  if (/(valore|prezzo|ticket|media|medio).*(servizi|venduti|preventiv|fattur)/.test(n) ||
      /(servizi|venduti|preventiv|fattur).*(valore|prezzo|ticket|media|medio)/.test(n)) {
    return { intent: 'avg_sold' };
  }

  // prodotto più venduto
  if (/(prodotto|servizio|voce|item).*(piu|maggiormente|top|piu venduto|piu venduti)/.test(n) ||
      /(top|piu|maggior).*(prodotto|servizio|voce)/.test(n) ||
      /(prodotto|servizio).*(venduto)/.test(n)) {
    return { intent: 'top_product' };
  }

  // bonifici / pagamenti in arrivo (cross-check conto)
  if (/(conto|bonifici|incassi|pagamenti).*(arriv|in\s*entrata|ricev)/.test(n)) {
    return { intent: 'incoming_payments' };
  }

  // === intent fatturali, eventualmente filtrati per cliente ===
  const isInvoiceQ = /(fatture?|invoice|insolut|scadut|aperte|non\s*sald|da\s*pagare)/.test(n);
  // Estrae il nome cliente residuo togliendo verbi di intent e parole-funzione
  const residue = oracleStripStopwords(n);

  if (isInvoiceQ) {
    // Se dopo lo strip rimane qualcosa di "sostanzioso", è una query fatture per cliente.
    // Soglia: almeno 2 caratteri e non solo cifre.
    if (residue && residue.length >= 2 && !/^\d+$/.test(residue)) {
      return { intent: 'client_invoices', clientName: residue, year: yearNum };
    }
    return { intent: 'unpaid_invoices', year: yearNum };
  }

  // === client_status: situazione cliente X (prefisso esplicito) ===
  const matchCliente = n.match(/(?:situazione|stato|dettag|info|riepilog)\s+(?:del\s+|della\s+|sul\s+|sulla\s+|cliente\s+)?(.+)/);
  if (matchCliente) {
    return { intent: 'client_status', clientName: oracleStripStopwords(matchCliente[1].trim()) || matchCliente[1].trim() };
  }

  // === client_status fallback: query libera con almeno una "parola lunga".
  // Se l'utente scrive solo "Cold Company" o "Bar Centrale Pescara", trattalo come
  // ricerca cliente. Evita match troppo permissivi: serve almeno una parola di 3+
  // caratteri che non sia uno stopword.
  if (residue && residue.length >= 3 && /[a-z]{3,}/.test(residue)) {
    return { intent: 'client_status', clientName: residue };
  }

  return { intent: 'unknown' };
}

app.post('/oracle/answer', auth(), async (req, res) => {
  const query = String((req.body && req.body.query) || '').trim();
  const intent = oracleDetectIntent(query);
  if (intent.intent === 'empty') return res.json({ intent: 'empty', query });

  try {
    if (intent.intent === 'avg_sold')          return res.json(await oracleAvgSold(query));
    if (intent.intent === 'top_product')       return res.json(await oracleTopProduct(query));
    if (intent.intent === 'client_status')     return res.json(await oracleClientStatus(query, intent.clientName));
    if (intent.intent === 'client_invoices')   return res.json(await oracleClientInvoices(query, intent.clientName, intent.year));
    if (intent.intent === 'unpaid_invoices')   return res.json(await oracleUnpaidInvoices(query, intent.year));
    if (intent.intent === 'incoming_payments') return res.json(await oracleIncomingPayments(query));
    return res.json({ intent: 'unknown', query, hint: 'Prova: "fatture non saldate 2026" · "prodotto più venduto" · "situazione cliente Bar Centrale" · "fatture Cold Company" · "valore medio servizi"' });
  } catch (e) {
    res.status(500).json({ intent: intent.intent, query, error: String(e.message || e) });
  }
});

// --- Intent implementations ---

async function oracleAvgSold() {
  // Fonte autoritativa: fatture emesse su Fatture in Cloud (anno corrente).
  // Più rappresentativo del "venduto reale" rispetto ai preventivi locali.
  if (!ficConfigured()) return { intent: 'avg_sold', error: 'Fatture in Cloud non configurato' };
  const co = process.env.FIC_COMPANY_ID;
  const year = new Date().getFullYear();

  const all = [];
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      type: 'invoice', per_page: '100', page: String(page), sort: '-date',
      q: `date >= '${year}-01-01' AND date <= '${year}-12-31'`,
      fields: 'id,number,date,entity,amount_net,amount_gross',
    });
    const r = await ficFetch('GET', `/c/${co}/issued_documents?${qs.toString()}`);
    if (!r.ok) {
      const code = r.json && r.json.error && r.json.error.code;
      if (r.status === 403 || code === 'NO_PERMISSION') {
        return { intent: 'avg_sold', permissionMissing: true, scope: 'issued_documents.invoices:r',
          error: 'Il PAT non ha permesso di lettura fatture.', howto: 'Attiva "Documenti emessi - Lettura" nel PAT FiC.' };
      }
      return { intent: 'avg_sold', error: 'FiC HTTP ' + r.status, details: r.json };
    }
    const list = (r.json && r.json.data) || [];
    if (!list.length) break;
    all.push(...list);
    if (list.length < 100) break;
  }

  let totalNet = 0, totalGross = 0;
  for (const d of all) {
    totalNet   += Number(d.amount_net)   || 0;
    totalGross += Number(d.amount_gross) || 0;
  }
  const count = all.length;
  return {
    intent: 'avg_sold',
    source: 'fatture_fic',
    year,
    count,
    totalNet,
    totalGross,
    avgNet:   count > 0 ? totalNet / count : 0,
    avgGross: count > 0 ? totalGross / count : 0,
  };
}

async function oracleTopProduct() {
  const rows = db.prepare(`SELECT data FROM quotes WHERE deleted = 0`).all();
  const tally = new Map();          // name → { count, qty, revenue }
  for (const r of rows) {
    try {
      const q = JSON.parse(r.data);
      for (const l of (q.lines || [])) {
        const key = (l.name || '').trim();
        if (!key) continue;
        const t = tally.get(key) || { name: key, area: l.area || null, count: 0, qty: 0, revenue: 0 };
        t.count++;
        t.qty += (l.quantity || 1);
        const gross = (l.net || 0) * (l.quantity || 1);
        t.revenue += gross * (1 - (l.discountPct || 0) / 100);
        tally.set(key, t);
      }
    } catch {}
  }
  const ranked = Array.from(tally.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  return { intent: 'top_product', items: ranked };
}

// Cerca un cliente nelle anagrafiche FiC paginate. Restituisce array di match
// normalizzati (con ficId). Usata sia da client_status che da client_invoices.
async function oracleFindFicClients(needle, maxPages = 10) {
  if (!ficConfigured()) return { matches: [], permissionMissing: false, error: null };
  const co = process.env.FIC_COMPANY_ID;
  const matches = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const r = await ficFetch('GET', `/c/${co}/entities/clients?per_page=100&page=${page}`);
      if (!r.ok) {
        const code = r.json && r.json.error && r.json.error.code;
        if (r.status === 403 || code === 'NO_PERMISSION') {
          return { matches, permissionMissing: true, scope: 'entities.clients:r', error: 'Permesso lettura clienti FiC mancante' };
        }
        return { matches, error: 'FiC HTTP ' + r.status };
      }
      const list = (r.json && r.json.data) || [];
      if (!list.length) break;
      for (const c of list) {
        const n = oracleNorm(c.name);
        if (!n) continue;
        // match se la parte normalizzata contiene il bisogno, o viceversa
        if (n.includes(needle) || needle.includes(n)) {
          matches.push({
            name: c.name, vat: c.vat_number, cf: c.tax_code,
            addr: c.address_street, city: c.address_city, prov: c.address_province,
            email: c.email, phone: c.phone, contact: c.contact_person || '',
            ficId: c.id, _fromFic: true,
          });
        }
      }
      if (list.length < 100) break;
    }
  } catch (e) {
    return { matches, error: String(e.message || e) };
  }
  return { matches, permissionMissing: false, error: null };
}

// Aggrega le fatture FiC di un cliente (per entity_id). Ritorna null se permesso
// mancante o errore non recuperabile; ritorna i dati altrimenti.
async function oracleFicInvoicesForClient(ficId) {
  if (!ficConfigured() || !ficId) return null;
  const co = process.env.FIC_COMPANY_ID;
  const fields = 'id,number,date,entity,amount_net,amount_gross,payments_list,next_due_amount';
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      type: 'invoice', per_page: '100', page: String(page), sort: '-date', fields,
      q: `entity.id = ${ficId}`,
    });
    const r = await ficFetch('GET', `/c/${co}/issued_documents?${qs.toString()}`);
    if (!r.ok) {
      const code = r.json && r.json.error && r.json.error.code;
      if (r.status === 403 || code === 'NO_PERMISSION') {
        return { permissionMissing: true, scope: 'issued_documents.invoices:r' };
      }
      return { error: 'FiC HTTP ' + r.status };
    }
    const list = (r.json && r.json.data) || [];
    if (!list.length) break;
    all.push(...list);
    if (list.length < 100) break;
  }
  // Aggrega: totale fatture, fatturato, aperte, importo da incassare, scadute
  let totalGross = 0, totalNet = 0, totalDue = 0;
  const unpaid = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const d of all) {
    totalGross += Number(d.amount_gross) || 0;
    totalNet   += Number(d.amount_net)   || 0;
    const pays = Array.isArray(d.payments_list) ? d.payments_list : [];
    const opens = pays.filter(p => p && p.status && p.status !== 'paid');
    let openAmount = 0, nextDue = null;
    if (opens.length) {
      openAmount = opens.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      nextDue = opens.map(p => p.due_date).filter(Boolean).sort()[0] || null;
    } else if (!pays.length && Number(d.next_due_amount) > 0) {
      openAmount = Number(d.next_due_amount);
    }
    if (openAmount > 0) {
      totalDue += openAmount;
      unpaid.push({
        id: d.id, number: d.number, date: d.date, due_date: nextDue,
        amount_gross: d.amount_gross, amount_due: openAmount,
        overdue: nextDue && nextDue < today,
      });
    }
  }
  unpaid.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  return {
    invoicesCount: all.length,
    totalNet, totalGross, totalDue,
    unpaidCount: unpaid.length,
    overdueCount: unpaid.filter(x => x.overdue).length,
    unpaid: unpaid.slice(0, 20),
    nextDueDate: unpaid.length ? unpaid[0].due_date : null,
  };
}

async function oracleClientStatus(query, partialName) {
  const needle = oracleNorm(partialName);
  if (!needle) return { intent: 'client_status', query, found: 0, suggestion: partialName };

  // 1) cerca tra clients locali (sync store). Matcha anche brand e aliases,
  // perché l'operatore conosce il cliente solo col nome commerciale.
  const rows = db.prepare(`SELECT data FROM clients WHERE deleted = 0`).all();
  const matches = [];
  for (const r of rows) {
    try {
      const c = JSON.parse(r.data);
      const candidates = [c.name, c.brand, ...(Array.isArray(c.aliases) ? c.aliases : [])]
        .filter(Boolean).map(s => oracleNorm(s));
      const hit = candidates.some(n => n && (n.includes(needle) || needle.includes(n)));
      if (hit) matches.push(c);
    } catch {}
  }
  // 2) anche se ci sono match locali, prova FiC per arricchire (e per ottenere ficId).
  // Se locale ha match ma manca ficId, faremo il merge per nome più sotto.
  let ficLookup = { matches: [], permissionMissing: false, error: null };
  if (ficConfigured()) {
    ficLookup = await oracleFindFicClients(needle);
    // Se locale era vuoto, i match FiC sono i match
    if (!matches.length) {
      matches.push(...ficLookup.matches);
    } else {
      // Merge: assegna ficId ai locali quando il nome combacia
      for (const local of matches) {
        if (local.ficId) continue;
        const ln = oracleNorm(local.name);
        const hit = ficLookup.matches.find(f => oracleNorm(f.name) === ln);
        if (hit) { local.ficId = hit.id || hit.ficId; local._fromFic = false; }
      }
    }
  }
  if (!matches.length) {
    return {
      intent: 'client_status', query, found: 0, suggestion: partialName,
      ficPermissionMissing: ficLookup.permissionMissing || false,
    };
  }

  // Aggrega contratti / preventivi locali
  const qRows = db.prepare(`SELECT data FROM quotes WHERE deleted = 0`).all();
  const allQuotes = qRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

  const results = [];
  for (const c of matches.slice(0, 5)) {
    const name = c.name || '';
    const lname = oracleNorm(name);
    const quotes = allQuotes.filter(q => oracleNorm(q.clientName) === lname);
    const byStage = {};
    let totalNet = 0, totalMonthly = 0;
    for (const q of quotes) {
      const s = q.pipelineStage || q.status || '—';
      byStage[s] = (byStage[s] || 0) + 1;
      const net = (q.lines || []).reduce((acc, l) => {
        const gross = (l.net || 0) * (l.quantity || 1);
        return acc + gross * (1 - (l.discountPct || 0) / 100);
      }, 0);
      totalNet += net;
      for (const l of (q.lines || [])) {
        const u = String(l.udm || '').toLowerCase();
        if (['mese','mesi','mensile','anno'].includes(u)) {
          const gross = (l.net || 0) * (l.quantity || 1);
          totalMonthly += gross * (1 - (l.discountPct || 0) / 100) / (l.quantity || 1);
        }
      }
    }

    // Arricchimento con fatture FiC del cliente, se ho un ficId
    let invoices = null;
    if (c.ficId) {
      try {
        invoices = await oracleFicInvoicesForClient(c.ficId);
      } catch (e) { invoices = { error: String(e.message || e) }; }
    }

    results.push({
      name, vat: c.vat || '', city: c.city || '', email: c.email || '', phone: c.phone || '', contact: c.contact || '',
      quotesCount: quotes.length,
      byStage,
      totalNet,
      totalMonthly,
      ficId: c.ficId || null,
      _fromFic: !!c._fromFic,
      lastSigned: quotes.map(q => q.signedAt).filter(Boolean).sort().pop() || null,
      invoices, // { invoicesCount, totalGross, totalDue, unpaidCount, overdueCount, unpaid: [...] } | { permissionMissing } | { error } | null
    });
  }
  return { intent: 'client_status', query, found: matches.length, results };
}

async function oracleClientInvoices(query, partialName, year) {
  const needle = oracleNorm(partialName);
  if (!needle) return { intent: 'client_invoices', query, found: 0, suggestion: partialName };

  // Risolvi il cliente: locale prima, poi FiC (per ficId)
  const rows = db.prepare(`SELECT data FROM clients WHERE deleted = 0`).all();
  const localMatches = [];
  for (const r of rows) {
    try {
      const c = JSON.parse(r.data);
      const n = oracleNorm(c.name);
      if (n && (n.includes(needle) || needle.includes(n))) localMatches.push(c);
    } catch {}
  }
  let ficLookup = { matches: [], permissionMissing: false, error: null };
  if (ficConfigured()) ficLookup = await oracleFindFicClients(needle);

  // Cerca il primo cliente con ficId (fonte verità per le fatture)
  const candidates = [];
  for (const lc of localMatches) {
    const ln = oracleNorm(lc.name);
    const ficHit = ficLookup.matches.find(f => oracleNorm(f.name) === ln);
    if (ficHit) candidates.push({ name: lc.name, ficId: ficHit.ficId || ficHit.id });
  }
  for (const fc of ficLookup.matches) {
    if (candidates.some(x => x.ficId === (fc.ficId || fc.id))) continue;
    candidates.push({ name: fc.name, ficId: fc.ficId || fc.id });
  }

  if (!candidates.length) {
    return {
      intent: 'client_invoices', query, found: 0, suggestion: partialName,
      ficPermissionMissing: ficLookup.permissionMissing || false,
    };
  }

  const results = [];
  for (const cand of candidates.slice(0, 3)) {
    const inv = await oracleFicInvoicesForClient(cand.ficId);
    if (inv && inv.permissionMissing) {
      return { intent: 'client_invoices', query, permissionMissing: true, scope: inv.scope };
    }
    // Filtro opzionale per anno sulla lista unpaid
    let unpaid = (inv && inv.unpaid) || [];
    if (year) unpaid = unpaid.filter(u => (u.date || '').startsWith(String(year)));
    results.push({
      name: cand.name, ficId: cand.ficId,
      invoicesCount: inv ? inv.invoicesCount : 0,
      totalGross: inv ? inv.totalGross : 0,
      totalDue: inv ? inv.totalDue : 0,
      unpaidCount: unpaid.length,
      overdueCount: unpaid.filter(x => x.overdue).length,
      unpaid,
    });
  }
  return { intent: 'client_invoices', query, year: year || null, found: candidates.length, results };
}

async function oracleUnpaidInvoices(query, year) {
  if (!ficConfigured()) return { intent: 'unpaid_invoices', error: 'Fatture in Cloud non configurato' };
  const co = process.env.FIC_COMPANY_ID;
  const filters = [];
  if (year) {
    filters.push(`date >= '${year}-01-01'`);
    filters.push(`date <= '${year}-12-31'`);
  }
  // IMPORTANT: il summary di default NON include payments_list/next_due_amount,
  // quindi 'amount_due' è undefined. Va richiesto esplicitamente via 'fields'.
  const fields = 'id,number,date,entity,amount_net,amount_gross,payments_list,next_due_amount';

  const all = [];
  let page = 1, totalScanned = 0;
  while (page <= 5) {
    const qs = new URLSearchParams({ type: 'invoice', per_page: '100', page: String(page), sort: '-date', fields });
    if (filters.length) qs.set('q', filters.join(' AND '));
    const r = await ficFetch('GET', `/c/${co}/issued_documents?${qs.toString()}`);
    if (!r.ok) {
      const code = r.json && r.json.error && r.json.error.code;
      if (r.status === 403 || code === 'NO_PERMISSION') {
        return {
          intent: 'unpaid_invoices',
          permissionMissing: true,
          scope: 'issued_documents.invoices:r',
          error: 'Il tuo Personal Access Token di Fatture in Cloud non ha il permesso di leggere le fatture.',
          howto: 'Vai su Fatture in Cloud → Impostazioni → API Sviluppatori → modifica il PAT e attiva "Documenti emessi - Lettura". Salva e riprova.',
        };
      }
      return { intent: 'unpaid_invoices', error: 'FiC HTTP ' + r.status, details: r.json };
    }
    const list = (r.json && r.json.data) || [];
    if (!list.length) break;
    all.push(...list);
    totalScanned += list.length;
    if (list.length < 100) break;
    page++;
  }

  // Una fattura è "aperta" se ha almeno una rata payments_list con
  // status != 'paid'. L'importo aperto è la somma di quelle rate.
  const items = [];
  let totalDue = 0;
  for (const d of all) {
    const pays = Array.isArray(d.payments_list) ? d.payments_list : [];
    const opens = pays.filter(p => p && p.status && p.status !== 'paid');
    if (!opens.length && pays.length) continue;        // tutte saldate
    // Se payments_list è vuoto, assumo aperta se next_due_amount > 0
    if (!pays.length && !(Number(d.next_due_amount) > 0)) continue;
    const openAmount = opens.length
      ? opens.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : Number(d.next_due_amount) || Number(d.amount_gross) || 0;
    const nextDue = opens.length
      ? opens.map(p => p.due_date).filter(Boolean).sort()[0] || null
      : null;
    totalDue += openAmount;
    items.push({
      id: d.id, number: d.number, date: d.date, due_date: nextDue,
      entity: d.entity && d.entity.name,
      amount_net: d.amount_net, amount_gross: d.amount_gross,
      amount_due: openAmount,
      status: opens.length === pays.length ? 'aperta' : 'parziale',
    });
  }
  // Ordina per scadenza ascendente (le più urgenti in cima)
  items.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  return { intent: 'unpaid_invoices', year, count: items.length, totalDue, items, scanned: totalScanned };
}

async function oracleIncomingPayments() {
  // Implementazione minima: tenta GET /c/{co}/cashbook (se disponibile sul piano FiC).
  // Se non disponibile/abilitato, ritorna stub informativo.
  if (!ficConfigured()) return { intent: 'incoming_payments', error: 'FiC non configurato' };
  const co = process.env.FIC_COMPANY_ID;
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    const r = await ficFetch('GET', `/c/${co}/cashbook?per_page=50&from_date=${start}&to_date=${end}`);
    if (!r.ok) return { intent: 'incoming_payments', error: 'FiC HTTP ' + r.status, hint: 'L\'API cashbook potrebbe non essere disponibile sul tuo piano FiC.', details: r.json };
    const entries = (r.json && r.json.data) || [];
    const incoming = entries.filter(e => Number(e.amount_in) > 0 || (Number(e.amount) > 0 && e.kind !== 'out'));
    return { intent: 'incoming_payments', count: incoming.length, totalIn: incoming.reduce((s,e)=>s + (Number(e.amount_in) || Number(e.amount) || 0), 0), items: incoming.slice(0, 20) };
  } catch (e) {
    return { intent: 'incoming_payments', error: String(e.message || e), hint: 'Per il check incrociato sul conto serve attivare l\'integrazione cashbook su FiC.' };
  }
}

// ============================================================
// HUB INTEGRAZIONI — gestione credenziali servizi esterni.
// Luigi (admin) può salvare/testare/rimuovere credenziali per
// Trello, Adobe Sign, Gmail, Drive, WhatsApp ecc. DAL FRONT-END
// in autonomia. Le credenziali NON tornano mai al client una volta
// salvate (solo flag 'configured' + maschera dei campi presenti).
// ============================================================

const INTEGRATION_SCHEMAS = {
  fic: {
    label: 'Fatture in Cloud',
    desc: 'Listino, anagrafica clienti, creazione bozze preventivo',
    status: 'active',           // implementato
    source: 'env',              // configurato via server/.env, sola lettura qui
    fields: ['FIC_ACCESS_TOKEN', 'FIC_COMPANY_ID'],
  },
  trello: {
    label: 'Trello',
    desc: 'Bacheche cliente + card brief automatica alla firma',
    status: 'active',           // implementato (test getMe)
    source: 'db',
    fields: ['api_key', 'token'],
  },
  adobe_sign: {
    label: 'Adobe Acrobat Sign',
    desc: 'Firma elettronica contratti — richiede piano Pro/Sign (non Standard DC)',
    status: 'scaffold',         // credenziali salvabili ma test → non implementato
    source: 'db',
    fields: ['client_id', 'client_secret', 'refresh_token', 'base_uri'],
  },
  google: {
    label: 'Google Account (Gmail + Drive)',
    desc: 'Un unico collegamento per: invio mail brief team, controllo inbox, archiviazione contratti su Drive, futuro Calendar/Sheets.',
    status: 'oauth',          // flusso 'Connetti con Google'
    source: 'db',
    // Configurabili dall'UI: client_id/secret dell'app Google Cloud
    // creata da Luigi (guida nel UI). refresh_token viene popolato
    // automaticamente dopo l'OAuth flow, NON è da incollare a mano.
    fields: ['client_id', 'client_secret'],
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      // drive.readonly: serve per VEDERE Shared Drives di Workspace e
      // navigare le cartelle del cliente nel Generatore PED.
      // drive.file dà accesso solo ai file creati DALL'app stessa.
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },
  whatsapp: {
    label: 'WhatsApp Business',
    desc: 'Messaggi automatici cliente (Meta Cloud API)',
    status: 'scaffold',
    source: 'db',
    fields: ['access_token', 'phone_number_id', 'business_account_id'],
  },
  google_ai: {
    label: 'Google AI (Gemini)',
    desc: 'Motore AI per Generatore PED: parsing strategia, estrazione tone-of-voice dalle slide reference, generazione copy post + caption reel. Gratis fino a 1500 chiamate/giorno su Gemini Flash.',
    status: 'active',
    source: 'db',
    // Una sola API key. NESSUN OAuth (l'API key autentica direttamente l'app).
    // Si ottiene su aistudio.google.com → Create API key.
    fields: ['api_key', 'model'],
    // SOLO api_key è obbligatoria per considerare "configured=true".
    // model ha default 'gemini-2.5-flash' applicato in fallback dal provider.
    requiredFields: ['api_key'],
  },
  canva: {
    label: 'Canva',
    desc: 'Generatore PED: lettura Brand Kit del cliente, template piano editoriale, asset shooting',
    status: 'oauth',              // OAuth Canva Connect API attivo
    source: 'db',
    // Solo le credenziali statiche dell'app vengono inserite a mano:
    // access_token + refresh_token arrivano via OAuth flow.
    fields: ['client_id', 'client_secret'],
    scopes: [
      'design:meta:read', 'design:content:read', 'design:content:write',
      'asset:read', 'asset:write',
      'folder:read', 'folder:write',
      'brandtemplate:meta:read', 'brandtemplate:content:read',
      'profile:read',
    ],
  },
};

// Lo schema è pubblico solo all'admin (per renderizzare i form)
app.get('/integrations/schema', auth('admin'), (req, res) => {
  res.json(INTEGRATION_SCHEMAS);
});

// Lista stato di tutte le integrazioni (NESSUN valore segreto esposto)
app.get('/integrations', auth('admin'), (req, res) => {
  const rows = db.prepare('SELECT name, configured, last_test, last_status, last_error, config FROM integrations').all();
  const byName = new Map(rows.map(r => [r.name, r]));
  const out = {};
  for (const [name, schema] of Object.entries(INTEGRATION_SCHEMAS)) {
    const row = byName.get(name);
    let fieldsSet = [];
    if (name === 'fic') {
      // FiC viene da .env, non dal DB
      fieldsSet = schema.fields.filter(f => !!process.env[f]);
      out[name] = {
        label: schema.label, desc: schema.desc, status: schema.status, source: schema.source,
        fields: schema.fields, fields_set: fieldsSet,
        configured: ficConfigured(),
        last_test: null, last_status: null, last_error: null,
      };
      continue;
    }
    let extra = {};
    if (row && row.config) {
      try {
        const cfg = JSON.parse(row.config);
        fieldsSet = Object.keys(cfg).filter(k => cfg[k] != null && cfg[k] !== '');
        if (name === 'google') {
          extra = {
            oauth_complete: !!cfg.refresh_token,
            connected_email: cfg.connected_email || null,
            connected_at: cfg.connected_at || null,
            scopes_count: (cfg.scope ? cfg.scope.split(' ').length : 0),
          };
        }
        if (name === 'canva') {
          extra = {
            oauth_complete: !!cfg.refresh_token,
            connected_account: cfg.connected_account || null,
            connected_at: cfg.connected_at || null,
            scopes_count: (cfg.scope ? cfg.scope.split(' ').length : 0),
          };
        }
      } catch {}
    }
    out[name] = Object.assign({
      label: schema.label, desc: schema.desc, status: schema.status, source: schema.source,
      fields: schema.fields, fields_set: fieldsSet,
      configured: !!(row && row.configured),
      last_test: row ? row.last_test : null,
      last_status: row ? row.last_status : null,
      last_error: row ? row.last_error : null,
    }, extra);
  }
  res.json(out);
});

// Salva/aggiorna config integrazione (merge campi non vuoti)
app.put('/integrations/:name', auth('admin'), (req, res) => {
  const name = req.params.name;
  const schema = INTEGRATION_SCHEMAS[name];
  if (!schema) return res.status(404).json({ error: 'Integrazione sconosciuta' });
  if (schema.source !== 'db') return res.status(400).json({ error: 'Integrazione configurata via server/.env, non modificabile da UI' });

  const incoming = req.body && req.body.config ? req.body.config : {};
  // Sanifica: tieni SOLO i campi previsti dallo schema
  const clean = {};
  for (const f of schema.fields) {
    if (incoming[f] != null && incoming[f] !== '') clean[f] = String(incoming[f]);
  }

  // Merge col config esistente (così posso aggiornare 1 campo senza reincollare tutti)
  const cur = db.prepare('SELECT config FROM integrations WHERE name = ?').get(name);
  let merged = clean;
  if (cur && cur.config) {
    try { merged = Object.assign({}, JSON.parse(cur.config), clean); } catch {}
  }
  // Considero "configured=1" SOLO se i campi davvero obbligatori sono valorizzati.
  // Schema può specificare `requiredFields`; altrimenti per retro-compat usa `fields`.
  const required = (schema.requiredFields && schema.requiredFields.length)
    ? schema.requiredFields
    : schema.fields;
  const configured = required.every(f => merged[f] != null && merged[f] !== '') ? 1 : 0;
  const updated_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO integrations (name, config, configured, updated_at)
    VALUES (@name, @config, @configured, @updated_at)
    ON CONFLICT(name) DO UPDATE SET
      config=@config, configured=@configured, updated_at=@updated_at
  `).run({ name, config: JSON.stringify(merged), configured, updated_at });

  res.json({ ok: true, configured: !!configured, fields_set: Object.keys(merged) });
});

// Cancella config integrazione
app.delete('/integrations/:name', auth('admin'), (req, res) => {
  const r = db.prepare('DELETE FROM integrations WHERE name = ?').run(req.params.name);
  res.json({ ok: true, removed: r.changes });
});

// Helper interno: leggi config integrazione dal DB
function getIntegrationConfig(name) {
  const row = db.prepare('SELECT config, configured FROM integrations WHERE name = ?').get(name);
  if (!row || !row.configured || !row.config) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}

// Aggiorna esito ultimo test
function saveIntegrationTest(name, status, error) {
  db.prepare(`
    UPDATE integrations SET last_test = ?, last_status = ?, last_error = ?
    WHERE name = ?
  `).run(new Date().toISOString(), status, error || null, name);
}

// Test connessione integrazione
app.post('/integrations/:name/test', auth('admin'), async (req, res) => {
  const name = req.params.name;
  const schema = INTEGRATION_SCHEMAS[name];
  if (!schema) return res.status(404).json({ error: 'Integrazione sconosciuta' });

  try {
    if (name === 'fic') {
      if (!ficConfigured()) throw new Error('Credenziali FiC mancanti in server/.env');
      const r = await ficFetch('GET', '/user/info');
      if (!r.ok) throw new Error('FiC HTTP ' + r.status);
      return res.json({ ok: true, info: { user: r.json && r.json.data && r.json.data.name } });
    }

    if (name === 'google') {
      const cfg = getGoogleConfig();
      if (!cfg || !cfg.refresh_token) throw new Error('Account Google non ancora collegato (clicca "Connetti il mio account Google")');
      // Refresh dell'access_token per verificare che il refresh_token sia valido
      const body = new URLSearchParams({
        client_id: cfg.client_id, client_secret: cfg.client_secret,
        refresh_token: cfg.refresh_token, grant_type: 'refresh_token',
      });
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      const data = await r.json();
      if (!r.ok) throw new Error('Refresh fallito: ' + (data.error_description || data.error || 'HTTP ' + r.status));
      saveGoogleConfig({ access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 });
      saveIntegrationTest('google', 'ok', null);
      return res.json({ ok: true, info: { account: cfg.connected_email || '—', scopes: (cfg.scope || '').split(' ').length + ' scopes attivi' } });
    }

    if (name === 'trello') {
      const cfg = getIntegrationConfig('trello');
      if (!cfg) throw new Error('Trello non configurato');
      const u = new URL('https://api.trello.com/1/members/me');
      u.searchParams.set('key', cfg.api_key);
      u.searchParams.set('token', cfg.token);
      const r = await fetch(u);
      if (!r.ok) throw new Error('Trello HTTP ' + r.status + ': ' + (await r.text()).slice(0, 120));
      const me = await r.json();
      saveIntegrationTest('trello', 'ok', null);
      return res.json({ ok: true, info: { username: me.username, fullName: me.fullName, idMember: me.id } });
    }

    // scaffold-only: salva 'pending' e dice all'utente che è tutto pronto
    if (schema.status === 'scaffold') {
      saveIntegrationTest(name, 'pending', 'Integrazione non ancora attivata sul backend (Fase 2)');
      return res.json({
        ok: false, pending: true,
        info: 'Credenziali salvate. Test reale non disponibile finché non attivo l\'integrazione lato backend (richiede sviluppo dedicato per ' + schema.label + ').'
      });
    }

    throw new Error('Test non implementato per ' + name);
  } catch (e) {
    saveIntegrationTest(name, 'error', String(e.message || e));
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

// ============================================================
// TRELLO AUTOMATION — crea card dal quote al cambio stato firmato
// ============================================================

// Estrae boardId da una URL board Trello. Supporta entrambi i formati:
//   - https://trello.com/b/<boardId>/<slug>                      (standard)
//   - https://trello.com/invite/b/<boardId>/<inviteToken>/<slug> (link invito)
// Il boardId Trello è 24 char alfanumerici (es. 6a116e3889548fce86fe85ab).
function trelloBoardIdFromUrl(url) {
  if (!url) return null;
  const s = String(url);
  // Prova invito prima (più specifico), poi standard
  let m = s.match(/trello\.com\/invite\/b\/([A-Za-z0-9]{8,})/);
  if (m) return m[1];
  m = s.match(/trello\.com\/b\/([A-Za-z0-9]{8,})/);
  return m ? m[1] : null;
}

// Helper: legge un setting dal DB locale. Il setting può essere salvato come:
//   - stringa JSON pura: '"https://..."'  → JSON.parse → "https://..."
//   - oggetto: '{"value": "..."}'         → estrae .value
//   - oggetto wrapper: '{...}'            → ritorna l'oggetto intero
function getLocalSetting(key, fallback) {
  const row = db.prepare('SELECT data FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.data);
    if (typeof parsed === 'string') return parsed; // stringa JSON pura
    if (parsed && typeof parsed === 'object' && parsed.value != null) return parsed.value;
    return parsed;
  } catch { return row.data || fallback; }
}

// POST /trello/card-from-quote
// Body: { quoteSyncId, listName? (default 'Informazioni'), boardUrl? (default da settings) }
// Crea una card Trello "Brief operativo {clientName}" nella lista indicata.
app.post('/trello/card-from-quote', auth(), async (req, res) => {
  try {
    const { quoteSyncId, listName = 'Informazioni', boardUrl: bodyBoardUrl } = req.body || {};
    if (!quoteSyncId) return res.status(400).json({ error: 'quoteSyncId richiesto' });

    // 1. Quote
    const qRow = db.prepare('SELECT data FROM quotes WHERE sync_id = ? AND deleted = 0').get(quoteSyncId);
    if (!qRow) return res.status(404).json({ error: 'Quote non trovato' });
    const quote = JSON.parse(qRow.data);

    // 2. Credenziali Trello
    const trello = getIntegrationConfig('trello');
    if (!trello || !trello.api_key || !trello.token) {
      return res.status(400).json({ error: 'Trello non configurato. Vai in Integrazioni → Trello e salva api_key/token.' });
    }

    // 3. Board URL: priorità a body, poi setting "automation_team_trello"
    const boardUrl = bodyBoardUrl || getLocalSetting('automation_team_trello', '');
    const boardId = trelloBoardIdFromUrl(boardUrl);
    if (!boardId) return res.status(400).json({ error: 'URL board Trello mancante o non valida. Impostala in Personalizza → Automazioni team.' });

    // 4. Trova la lista per nome nella board
    const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${trello.api_key}&token=${trello.token}`;
    const listsRes = await fetch(listsUrl);
    if (!listsRes.ok) {
      const txt = await listsRes.text();
      // Errori specifici Trello con guida operativa
      if (listsRes.status === 401) {
        return res.status(401).json({ error: 'Credenziali Trello scadute o invalide (HTTP 401). Vai in Integrazioni → Trello, rigenera api_key/token e salva.' });
      }
      if (listsRes.status === 404) {
        return res.status(404).json({ error: `Board Trello non trovata (HTTP 404). BoardId estratto: "${boardId}". Verifica l'URL salvato in Personalizza → Automazioni team.` });
      }
      return res.status(502).json({ error: `Lettura liste board fallita (HTTP ${listsRes.status}): ${txt.slice(0, 200)}` });
    }
    const lists = await listsRes.json();
    const targetList = lists.find(l => l.name.toLowerCase() === listName.toLowerCase());
    if (!targetList) {
      const available = lists.map(l => l.name).join(', ') || '(nessuna)';
      return res.status(404).json({ error: `Lista "${listName}" non trovata nella board. Liste disponibili: ${available}. Crea una lista chiamata "${listName}" o passa un listName diverso.` });
    }

    // 5. Recupera nome cliente (brand commerciale ha priorità sulla ragione
    // sociale: in Trello l'operatore riconosce il brand, non la s.r.l.)
    let clientName = '';
    let clientBrand = '';
    let clientDefaultAssignee = null;
    if (quote.clientSyncId) {
      const cRow = db.prepare('SELECT data FROM clients WHERE sync_id = ?').get(quote.clientSyncId);
      if (cRow) {
        try {
          const c = JSON.parse(cRow.data);
          clientBrand = c.brand || '';
          clientName = c.name || '';
          clientDefaultAssignee = c.defaultAssignee || null;
        } catch {}
      }
    }
    const displayName = clientBrand || quote.clientName || clientName || '(cliente)';

    // 6. Deduci "lavorazione" — il pacchetto/servizio della scheda.
    // Priorità: tag del preventivo (es. "PED giugno", "Aggiornamento sito") →
    // prima line del preventivo → fallback generico.
    let lavorazione = (quote.tag || '').trim();
    if (!lavorazione && Array.isArray(quote.lines) && quote.lines.length) {
      lavorazione = (quote.lines[0].name || '').trim();
    }
    if (!lavorazione) lavorazione = 'Lavorazione';

    // Format titolo: "Cliente / Lavorazione" (richiesta esplicita Luigi 2026-05-25)
    const cardName = `${displayName} / ${lavorazione}`;

    // 7. Descrizione: brief operativo + meta info
    const descParts = [];
    if (quote.briefOperativo) descParts.push(quote.briefOperativo);
    else descParts.push('_Brief operativo non compilato dal commerciale._');
    descParts.push('\n---\n');
    descParts.push(`**Cliente**: ${displayName}${clientName && clientName !== displayName ? ` (${clientName})` : ''}`);
    descParts.push(`**Lavorazione**: ${lavorazione}`);
    if (quote.number)   descParts.push(`**Preventivo**: #${quote.number}`);
    if (quote.signedAt) descParts.push(`**Firmato il**: ${new Date(quote.signedAt).toLocaleDateString('it-IT')}`);
    if (quote.expectedStartDate) descParts.push(`**Inizio previsto**: ${new Date(quote.expectedStartDate).toLocaleDateString('it-IT')}`);
    if (clientDefaultAssignee) descParts.push(`**Operatore di riferimento**: ${clientDefaultAssignee}`);
    if (quote.appuntiCommerciali) descParts.push('\n**Appunti commerciali**:\n' + quote.appuntiCommerciali);

    // 8. Crea la card SENZA scadenza automatica — la imposta l'operatore
    //    direttamente da Trello o dalla Situazione operativa
    //    (richiesta esplicita Luigi 2026-05-25).
    const createUrl = new URL('https://api.trello.com/1/cards');
    createUrl.searchParams.set('key', trello.api_key);
    createUrl.searchParams.set('token', trello.token);
    createUrl.searchParams.set('idList', targetList.id);
    createUrl.searchParams.set('name', cardName);
    createUrl.searchParams.set('desc', descParts.join('\n'));
    // NO due: la scadenza la mette l'operatore.
    const createRes = await fetch(createUrl, { method: 'POST' });
    if (!createRes.ok) {
      const txt = await createRes.text();
      return res.status(502).json({ error: 'Creazione card fallita: ' + createRes.status + ' ' + txt.slice(0, 200) });
    }
    const card = await createRes.json();

    res.json({
      ok: true,
      cardId: card.id,
      cardUrl: card.shortUrl || card.url,
      cardName,
      listName: targetList.name,
      boardId,
      assignee: clientDefaultAssignee,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ============================================================
// TRELLO BOARDS API — per UI collegamento board ↔ cliente
// (workload step 1A)
// ============================================================

// Estrae lo shortLink (8 char) o l'id 24-char da URL board Trello
// e lo "risolve" via API a un id pieno. Usato perché spesso le URL
// usano lo shortLink (es. https://trello.com/b/abc123XY/board-name)
// ma le successive chiamate vogliono l'id pieno o lo shortLink stesso.
function trelloShortFromUrl(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/trello\.com\/invite\/b\/([A-Za-z0-9]{6,})/);
  if (m) return m[1];
  m = s.match(/trello\.com\/b\/([A-Za-z0-9]{6,})/);
  return m ? m[1] : null;
}

// GET /trello/boards
// Restituisce le board Trello accessibili al token configurato.
// Output: [{ id, name, shortUrl, url, dateLastActivity, closed }]
app.get('/trello/boards', auth(), async (req, res) => {
  try {
    const trello = getIntegrationConfig('trello');
    if (!trello || !trello.api_key || !trello.token) {
      return res.status(400).json({ error: 'Trello non configurato. Vai in Integrazioni → Trello.' });
    }
    const u = new URL('https://api.trello.com/1/members/me/boards');
    u.searchParams.set('key', trello.api_key);
    u.searchParams.set('token', trello.token);
    u.searchParams.set('fields', 'id,name,shortUrl,url,dateLastActivity,closed');
    u.searchParams.set('filter', 'open');
    const r = await fetch(u);
    if (!r.ok) {
      if (r.status === 401) return res.status(401).json({ error: 'Credenziali Trello scadute o invalide (HTTP 401).' });
      return res.status(502).json({ error: `Lettura board fallita (HTTP ${r.status}).` });
    }
    const boards = await r.json();
    boards.sort((a, b) => String(b.dateLastActivity || '').localeCompare(String(a.dateLastActivity || '')));
    res.json(boards);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// GET /trello/board/:idOrShort/info
// Restituisce { id, name, url, lists: [{id, name, pos}] } per la board indicata.
// Accetta sia l'id pieno che lo shortLink (es. da URL board).
app.get('/trello/board/:idOrShort/info', auth(), async (req, res) => {
  try {
    const trello = getIntegrationConfig('trello');
    if (!trello || !trello.api_key || !trello.token) {
      return res.status(400).json({ error: 'Trello non configurato.' });
    }
    const ref = String(req.params.idOrShort);
    const u = new URL(`https://api.trello.com/1/boards/${encodeURIComponent(ref)}`);
    u.searchParams.set('key', trello.api_key);
    u.searchParams.set('token', trello.token);
    u.searchParams.set('fields', 'id,name,shortUrl,url,closed');
    u.searchParams.set('lists', 'open');
    u.searchParams.set('list_fields', 'id,name,pos,closed');
    const r = await fetch(u);
    if (!r.ok) {
      if (r.status === 401) return res.status(401).json({ error: 'Credenziali Trello scadute o invalide (HTTP 401).' });
      if (r.status === 404) return res.status(404).json({ error: `Board "${ref}" non trovata. Verifica l'URL.` });
      return res.status(502).json({ error: `Lettura info board fallita (HTTP ${r.status}).` });
    }
    const board = await r.json();
    const lists = (board.lists || [])
      .filter(l => !l.closed)
      .sort((a, b) => (a.pos || 0) - (b.pos || 0))
      .map(l => ({ id: l.id, name: l.name }));
    res.json({
      id: board.id,
      shortUrl: board.shortUrl,
      url: board.url,
      name: board.name,
      lists,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ============================================================
// OAUTH GOOGLE — flusso "Connetti con Google" (Gmail + Drive)
// ============================================================
// Memoria volatile per il parametro 'state' OAuth (CSRF protection)
const oauthStates = new Map();
function makeState() {
  const s = require('crypto').randomBytes(24).toString('hex');
  oauthStates.set(s, { createdAt: Date.now() });
  // Pulizia: stati più vecchi di 15 min vengono scartati
  for (const [k, v] of oauthStates) if (Date.now() - v.createdAt > 15 * 60 * 1000) oauthStates.delete(k);
  return s;
}
function consumeState(s) {
  const ok = oauthStates.has(s);
  oauthStates.delete(s);
  return ok;
}

// Helper: leggi config 'google' (client_id, client_secret + token salvati)
function getGoogleConfig() {
  const row = db.prepare('SELECT config FROM integrations WHERE name = ?').get('google');
  if (!row || !row.config) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}
function saveGoogleConfig(merge) {
  const cur = getGoogleConfig() || {};
  const merged = Object.assign({}, cur, merge);
  const configured = !!(merged.client_id && merged.client_secret && merged.refresh_token) ? 1 : 0;
  db.prepare(`
    INSERT INTO integrations (name, config, configured, updated_at)
    VALUES ('google', @config, @configured, @updated_at)
    ON CONFLICT(name) DO UPDATE SET config=@config, configured=@configured, updated_at=@updated_at
  `).run({ config: JSON.stringify(merged), configured, updated_at: new Date().toISOString() });
  return merged;
}

// URI di redirect (deve coincidere con quello registrato in Google Cloud).
// Normalizziamo "localhost" → "127.0.0.1" per coerenza con Canva (che
// richiede esplicitamente 127.0.0.1) e per evitare disallineamenti tra
// quello che configuri su Google Cloud e quello che il backend manda.
function googleRedirectUri(req) {
  const host = req.get('host') || `127.0.0.1:${PORT}`;
  const normalized = host.replace(/^localhost(:|$)/, '127.0.0.1$1');
  return `http://${normalized}/oauth/google/callback`;
}

// Avvio OAuth: il client (autenticato) chiama questo, riceve l'URL e
// lo apre in un popup. NON usiamo redirect diretti per non spostare
// l'utente fuori dall'app.
app.post('/oauth/google/init', auth('admin'), (req, res) => {
  const cfg = getGoogleConfig();
  if (!cfg || !cfg.client_id || !cfg.client_secret) {
    return res.status(400).json({ error: 'Prima inserisci client_id e client_secret nella card Google e clicca Salva.' });
  }
  const schema = INTEGRATION_SCHEMAS.google;
  const state = makeState();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', cfg.client_id);
  url.searchParams.set('redirect_uri', googleRedirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');           // serve per il refresh_token
  url.searchParams.set('prompt', 'consent');                // forza emissione refresh_token
  url.searchParams.set('scope', schema.scopes.join(' '));
  url.searchParams.set('state', state);
  res.json({ url: url.toString(), redirect_uri: googleRedirectUri(req) });
});

// Callback Google: scambia il code col refresh_token e access_token.
// Restituisce una pagina HTML che notifica al popup-opener e si chiude.
app.get('/oauth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const finish = (ok, msg) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>${ok ? 'Connesso' : 'Errore'}</title>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:${ok ? '#10b981' : '#ef4444'};color:#fff">
  <h2>${ok ? '✅ Account Google collegato' : '❌ Errore'}</h2>
  <p>${msg.replace(/[<>]/g, '')}</p>
  <p style="opacity:.8;font-size:14px">Puoi chiudere questa finestra.</p>
  <script>
    try { if (window.opener) window.opener.postMessage({ type: 'google-oauth', ok: ${ok}, msg: ${JSON.stringify(msg)} }, '*'); } catch(e){}
    setTimeout(() => window.close(), 1500);
  </script>
</body>`);
  };

  if (error) return finish(false, 'Google ha rifiutato l\'autorizzazione: ' + error);
  if (!code || !state || !consumeState(state)) return finish(false, 'Stato OAuth non valido o scaduto. Riprova dall\'app.');
  const cfg = getGoogleConfig();
  if (!cfg || !cfg.client_id || !cfg.client_secret) return finish(false, 'Credenziali app Google mancanti sul backend.');

  try {
    const body = new URLSearchParams({
      code: String(code),
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      redirect_uri: googleRedirectUri(req),
      grant_type: 'authorization_code',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await r.json();
    if (!r.ok) return finish(false, 'Token endpoint: ' + (data.error_description || data.error || 'errore'));
    if (!data.refresh_token) return finish(false, 'Google non ha restituito un refresh_token (riprova revocando l\'accesso precedente).');

    // Recupera anche l'email dell'utente connesso (info opzionale, utile in UI)
    let connectedEmail = null;
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + data.access_token },
      });
      if (u.ok) connectedEmail = (await u.json()).email;
    } catch {}

    saveGoogleConfig({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      scope: data.scope,
      connected_email: connectedEmail,
      connected_at: new Date().toISOString(),
    });
    saveIntegrationTest('google', 'ok', null);
    finish(true, connectedEmail ? `Account ${connectedEmail} collegato.` : 'Account collegato.');
  } catch (e) {
    finish(false, 'Errore comunicazione con Google: ' + (e.message || e));
  }
});

// ============================================================
// CANVA OAuth (Connect API) — stesso pattern di Google
// ============================================================
function getCanvaConfig() {
  const row = db.prepare('SELECT config FROM integrations WHERE name = ?').get('canva');
  if (!row || !row.config) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}
function saveCanvaConfig(merge) {
  const cur = getCanvaConfig() || {};
  const merged = Object.assign({}, cur, merge);
  // Considerato "configurato" se ci sono SOLO le credenziali statiche.
  // L'OAuth attivo è un flag separato `oauth_complete`.
  const configured = !!(merged.client_id && merged.client_secret) ? 1 : 0;
  db.prepare(`
    INSERT INTO integrations (name, config, configured, updated_at)
    VALUES ('canva', @config, @configured, @updated_at)
    ON CONFLICT(name) DO UPDATE SET config=@config, configured=@configured, updated_at=@updated_at
  `).run({ config: JSON.stringify(merged), configured, updated_at: new Date().toISOString() });
  return merged;
}
function canvaRedirectUri(req) {
  // Canva richiede esplicitamente l'IP 127.0.0.1 per i redirect locali
  // (rifiuta "localhost" con errore: "Localhost URLs must use 127.0.0.1").
  // Normalizziamo sempre l'host a 127.0.0.1 quando rileviamo localhost.
  const host = req.get('host') || `127.0.0.1:${PORT}`;
  const normalized = host.replace(/^localhost(:|$)/, '127.0.0.1$1');
  return `http://${normalized}/oauth/canva/callback`;
}
// PKCE: code_verifier random + code_challenge S256. Canva richiede PKCE.
// Import locale di crypto (server.js usa il modulo inline altrove,
// non c'è un binding top-level → senza questo importing → ReferenceError 500).
const _canvaCrypto = require('crypto');
const _canvaPendingPkce = new Map(); // state → code_verifier
function _b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function _makePkce() {
  const verifier = _b64url(_canvaCrypto.randomBytes(48));
  const challenge = _b64url(_canvaCrypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Scope Canva richiesti (corrispondono ai feature del Generatore PED)
const CANVA_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'folder:read',
  'folder:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'profile:read',
];

// Init OAuth Canva: ritorna l'URL di autorizzazione
app.post('/oauth/canva/init', auth('admin'), (req, res) => {
  const cfg = getCanvaConfig();
  if (!cfg || !cfg.client_id || !cfg.client_secret) {
    return res.status(400).json({ error: 'Prima salva client_id e client_secret nella card Canva.' });
  }
  const state = makeState();
  const { verifier, challenge } = _makePkce();
  _canvaPendingPkce.set(state, verifier);
  // Pulizia pkce vecchi (>10 min)
  setTimeout(() => _canvaPendingPkce.delete(state), 10 * 60 * 1000);
  const url = new URL('https://www.canva.com/api/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.client_id);
  url.searchParams.set('redirect_uri', canvaRedirectUri(req));
  url.searchParams.set('scope', CANVA_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  res.json({ url: url.toString(), redirect_uri: canvaRedirectUri(req) });
});

// Callback Canva: scambia code per access_token + refresh_token
app.get('/oauth/canva/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const finish = (ok, msg) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>${ok ? 'Connesso' : 'Errore'}</title>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:${ok ? '#10b981' : '#ef4444'};color:#fff">
  <h2>${ok ? '✅ Account Canva collegato' : '❌ Errore Canva'}</h2>
  <p>${msg.replace(/[<>]/g, '')}</p>
  <p style="opacity:.8;font-size:14px">Puoi chiudere questa finestra.</p>
  <script>
    try { if (window.opener) window.opener.postMessage({ type: 'canva-oauth', ok: ${ok}, msg: ${JSON.stringify(msg)} }, '*'); } catch(e){}
    setTimeout(() => window.close(), 1500);
  </script>
</body>`);
  };
  if (error) return finish(false, 'Canva ha rifiutato: ' + error);
  if (!code || !state || !consumeState(state)) return finish(false, 'State OAuth non valido o scaduto.');
  const verifier = _canvaPendingPkce.get(state);
  _canvaPendingPkce.delete(state);
  if (!verifier) return finish(false, 'PKCE verifier scaduto. Riprova.');
  const cfg = getCanvaConfig();
  if (!cfg || !cfg.client_id || !cfg.client_secret) return finish(false, 'Credenziali Canva mancanti sul backend.');
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      code_verifier: verifier,
      redirect_uri: canvaRedirectUri(req),
    });
    // Canva richiede Basic auth con client_id:client_secret
    const basic = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
    const r = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + basic },
      body,
    });
    const data = await r.json();
    if (!r.ok) return finish(false, 'Token endpoint: ' + (data.error_description || data.message || data.error || `HTTP ${r.status}`));
    if (!data.refresh_token) return finish(false, 'Canva non ha restituito un refresh_token.');
    // Profilo utente per mostrare email/nome
    let connectedAccount = null;
    try {
      const u = await fetch('https://api.canva.com/rest/v1/users/me/profile', {
        headers: { Authorization: 'Bearer ' + data.access_token },
      });
      if (u.ok) {
        const prof = await u.json();
        connectedAccount = (prof.profile && (prof.profile.display_name || prof.profile.email)) || null;
      }
    } catch {}
    saveCanvaConfig({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      scope: data.scope,
      connected_account: connectedAccount,
      connected_at: new Date().toISOString(),
      oauth_complete: true,
    });
    saveIntegrationTest('canva', 'ok', null);
    finish(true, connectedAccount ? `Account ${connectedAccount} collegato.` : 'Account Canva collegato.');
  } catch (e) {
    finish(false, 'Errore comunicazione Canva: ' + (e.message || e));
  }
});

// Disconnetti Canva
app.post('/oauth/canva/disconnect', auth('admin'), async (req, res) => {
  saveCanvaConfig({
    refresh_token: null, access_token: null, expires_at: null,
    scope: null, connected_account: null, connected_at: null,
    oauth_complete: false,
  });
  saveIntegrationTest('canva', null, null);
  res.json({ ok: true });
});

// Helper: chiamata autenticata a Google API con refresh automatico
async function googleFetch(method, url, body) {
  let cfg = getGoogleConfig();
  if (!cfg || !cfg.access_token) throw new Error('Google non collegato (manca access_token)');
  // Refresh proattivo se scaduto/scadrà a breve
  if (!cfg.expires_at || cfg.expires_at < Date.now() + 60 * 1000) {
    if (cfg.refresh_token) {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          refresh_token: cfg.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const j = await r.json();
      if (r.ok && j.access_token) {
        cfg = saveGoogleConfig({
          access_token: j.access_token,
          expires_at: Date.now() + (j.expires_in || 3600) * 1000,
        });
      } else {
        throw new Error('Refresh Google fallito: ' + (j.error_description || j.error || `HTTP ${r.status}`));
      }
    }
  }
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + cfg.access_token, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

// Helper: chiamata autenticata a Canva API con refresh automatico
async function canvaFetch(method, path, body) {
  let cfg = getCanvaConfig();
  if (!cfg || !cfg.access_token) throw new Error('Canva non collegato (manca access_token)');
  // Refresh proattivo se scaduto/scadrà a breve
  if (!cfg.expires_at || cfg.expires_at < Date.now() + 60 * 1000) {
    if (cfg.refresh_token) {
      const basic = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
      const r = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + basic },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token }),
      });
      const j = await r.json();
      if (r.ok && j.access_token) {
        cfg = saveCanvaConfig({
          access_token: j.access_token,
          refresh_token: j.refresh_token || cfg.refresh_token,
          expires_at: Date.now() + (j.expires_in || 3600) * 1000,
        });
      } else {
        throw new Error('Refresh Canva fallito: ' + (j.error_description || j.error || `HTTP ${r.status}`));
      }
    }
  }
  const url = 'https://api.canva.com/rest/v1' + path;
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + cfg.access_token, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

// Disconnetti: revoca + cancella i token, lascia client_id/secret
app.post('/oauth/google/disconnect', auth('admin'), async (req, res) => {
  const cfg = getGoogleConfig();
  if (cfg && cfg.refresh_token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(cfg.refresh_token), { method: 'POST' });
    } catch {}
  }
  saveGoogleConfig({
    refresh_token: null, access_token: null, expires_at: null,
    scope: null, connected_email: null, connected_at: null,
  });
  saveIntegrationTest('google', null, null);
  res.json({ ok: true });
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

// Preview del prossimo numero per la numerazione PRINCIPALE dei preventivi FiC.
// Strategia: leggo l'ultimo preventivo (sort desc per numero) e ritorno +1.
// Non riserva il numero: la fonte verità resta FiC al momento del push, che
// assegna automaticamente il prossimo libero. Questo serve solo come hint
// nell'editor preventivo.
app.get('/fic/quotes/next-number', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const co = process.env.FIC_COMPANY_ID;
  try {
    // FiC API: per_page minimo 5, sort=-date più affidabile di -number
    // (number è stringa con prefisso). Leggo le ultime 5 quote e prendo
    // il numero più alto.
    const qs = new URLSearchParams({
      type: 'quote',
      per_page: '5',
      page: '1',
      sort: '-date',
      fields: 'number,numeration,date',
    });
    const r = await ficFetch('GET', `/c/${co}/issued_documents?${qs.toString()}`);
    if (!r.ok) return res.status(r.status).json(r.json);
    const list = (r.json && r.json.data) || [];
    // Estraggo l'ultimo gruppo di cifre dalla stringa number (es. "PRE/2026/97" → 97)
    let last = 0;
    for (const d of list) {
      const m = String(d.number || '').match(/(\d+)(?!.*\d)/);
      const n = m ? parseInt(m[1], 10) : 0;
      if (n > last) last = n;
    }
    res.json({ next: last + 1, last, source: 'fic', numeration: (list[0] && list[0].numeration) || '' });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
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

// Lista bozze preventivo (con filtri opzionali ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/fic/quote-drafts', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  const sort = req.query.sort ? `&sort=${encodeURIComponent(req.query.sort)}` : '&sort=-id';
  // FiC API supporta ?q="date >= 'YYYY-MM-DD' AND date <= 'YYYY-MM-DD'"
  const filters = [];
  if (req.query.from) filters.push(`date >= '${req.query.from}'`);
  if (req.query.to)   filters.push(`date <= '${req.query.to}'`);
  const q = filters.length ? `&q=${encodeURIComponent(filters.join(' AND '))}` : '';
  const r = await ficFetch('GET', `/c/${company}/issued_documents?type=quote&per_page=100${sort}${q}`);
  if (!r.ok) return res.status(r.status).json(r.json);
  const list = (r.json && r.json.data) || [];
  res.json(list.map(d => ({ id: d.id, number: d.number, subject: d.subject, date: d.date, amount_net: d.amount_net, amount_gross: d.amount_gross, entity: d.entity && d.entity.name })));
});

// Dettaglio singolo preventivo FiC (voci, totali, cliente completo)
app.get('/fic/quote/:id', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  const r = await ficFetch('GET', `/c/${company}/issued_documents/${req.params.id}`);
  if (!r.ok) return res.status(r.status).json(r.json);
  res.json(r.json.data || r.json);
});

// Lista clienti FiC (per il sync anagrafica nella view Clienti)
app.get('/fic/clients', auth(), async (req, res) => {
  if (!ficConfigured()) return res.status(503).json({ error: 'FiC non configurato sul server' });
  const company = process.env.FIC_COMPANY_ID;
  // Paginazione fino a 10 pagine = 1000 clienti, abbondante per agenzie tipiche.
  // Senza questo l'Import Wizard del piano editoriale non trova clienti dopo
  // i primi 100 (Luigi ne ha 212+).
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const r = await ficFetch('GET', `/c/${company}/entities/clients?per_page=100&page=${page}`);
    if (!r.ok) {
      // Se la prima pagina fallisce, propago. Se fallisce una pagina interna, ritorno comunque quel che ho.
      if (page === 1) return res.status(r.status).json(r.json);
      break;
    }
    const list = (r.json && r.json.data) || [];
    if (!list.length) break;
    all.push(...list);
    if (list.length < 100) break;
  }
  res.json(all);
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
