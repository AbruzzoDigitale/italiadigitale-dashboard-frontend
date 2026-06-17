/* ============================================================
   DB.JS (server) — SQLite via node:sqlite integrato (no build nativo)
   Una sola fonte di verità condivisa tra admin e operatori.
   Quotes e clients sono salvati come blob JSON + colonne
   estratte per i filtri (status, requestedBy, ecc.).
   ============================================================ */

const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite'); // integrato in Node 22.5+ (qui Node 26)

const DB_PATH = path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username   TEXT PRIMARY KEY,
    name       TEXT,
    role       TEXT NOT NULL DEFAULT 'operator',
    pass_hash  TEXT NOT NULL,
    pass_salt  TEXT NOT NULL,
    profile            TEXT,
    profile_updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    updated_at TEXT,
    data       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS integrations (
    name        TEXT PRIMARY KEY,
    config      TEXT NOT NULL,    -- JSON: { campo: valore, ... }
    configured  INTEGER NOT NULL DEFAULT 0,
    last_test   TEXT,             -- ISO timestamp ultimo test
    last_status TEXT,             -- 'ok' | 'error' | null
    last_error  TEXT,
    updated_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_settings_upd ON settings(updated_at);

  CREATE TABLE IF NOT EXISTS quotes (
    sync_id      TEXT PRIMARY KEY,
    number       TEXT,
    status       TEXT,
    created_by   TEXT,
    requested_by TEXT,
    client_id    TEXT,
    updated_at   TEXT,
    deleted      INTEGER NOT NULL DEFAULT 0,
    data         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
  CREATE INDEX IF NOT EXISTS idx_quotes_reqby  ON quotes(requested_by);
  CREATE INDEX IF NOT EXISTS idx_quotes_upd    ON quotes(updated_at);

  CREATE TABLE IF NOT EXISTS clients (
    sync_id    TEXT PRIMARY KEY,
    name       TEXT,
    updated_at TEXT,
    deleted    INTEGER NOT NULL DEFAULT 0,
    data       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clients_upd ON clients(updated_at);

  -- Storico modifiche su clienti e preventivi (Situazione clienti → tab Attività).
  -- Ogni edit lato server scrive una riga qui dopo aver fatto il diff old/new.
  -- entity_type: 'client' | 'quote'
  -- field: nome del campo modificato (es. 'brand', 'expectedStartDate', 'line.quantity')
  -- line_index/line_name: contesto voce quando il field è line.*
  -- old_value / new_value: serializzati a JSON (numero, string, array, null tutti supportati)
  CREATE TABLE IF NOT EXISTS activity_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    field        TEXT NOT NULL,
    line_index   INTEGER,
    line_name    TEXT,
    old_value    TEXT,
    new_value    TEXT,
    user_id      TEXT,
    user_name    TEXT,
    ts           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_activity_ts     ON activity_log(ts);

  -- Piano editoriale social: una riga per ogni cella (cliente × mese × anno).
  -- Lazy: la riga esiste SOLO quando il task ha avuto almeno uno stato; le celle
  -- vuote nella matrice corrispondono a "nessuna riga in DB".
  -- status: enum del piano editoriale (DA FARE / PRONTO / IN APPROVAZIONE /
  -- REVISIONE / APPROVATO / PROGRAMMATO / Stand by / LANCIO / Finito).
  -- assigned_to: username dell'operator (es. 'mattia'). Null = non assegnato.
  -- notes: brief libero del mese ("fare reel ferragosto", "video shooting il 15")
  -- tags: array JSON (es. ["estivo", "lancio prodotto"])
  -- attachments: array JSON di { name, url } (PDF PED, link Drive, ecc.)
  CREATE TABLE IF NOT EXISTS social_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_sync_id  TEXT NOT NULL,
    year            INTEGER NOT NULL,
    month           INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'da_fare',
    assigned_to     TEXT,
    due_date        TEXT,
    notes           TEXT,
    tags            TEXT,
    attachments     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(client_sync_id, year, month)
  );
  CREATE INDEX IF NOT EXISTS idx_social_year_month ON social_tasks(year, month);
  CREATE INDEX IF NOT EXISTS idx_social_assigned  ON social_tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_social_status    ON social_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_social_client    ON social_tasks(client_sync_id);

  -- Generatore PED — un record per ogni piano editoriale generato dal wizard.
  -- Linkato facoltativamente al social_task del mese (clientSyncId+year+month):
  -- la matrice in "Situazione operativa" e il PED qui condividono cliente+mese.
  -- payload: blob JSON con lo stato pieno della sessione wizard (strategia,
  -- modalità, brief, riferimenti Canva/Drive). asset_ids è denormalizzato per
  -- query veloci di "questo asset è stato usato in quali PED".
  CREATE TABLE IF NOT EXISTS ped_briefs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_sync_id  TEXT NOT NULL,
    year            INTEGER NOT NULL,
    month           INTEGER NOT NULL,
    social_task_id  INTEGER,
    status          TEXT NOT NULL DEFAULT 'bozza',  -- bozza | inviato_responsabile | approvato | pubblicato
    strategy_source TEXT,                            -- canva | drive_pdf | google_doc
    strategy_ref    TEXT,
    mode            TEXT,                            -- auto | manual
    asset_ids       TEXT,                            -- JSON array di id asset usati
    canva_design_id TEXT,
    payload         TEXT NOT NULL,                   -- JSON pieno (brief, copy, caroselli, snapshot)
    created_by      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ped_client_ym ON ped_briefs(client_sync_id, year, month);
  CREATE INDEX IF NOT EXISTS idx_ped_status     ON ped_briefs(status);

  -- Memoria PED — cosa è stato approvato/pubblicato per cliente. Sopravvive
  -- ai singoli brief (un brief può essere riscritto, la memoria no).
  -- channel: facebook | instagram | tiktok | linkedin (per il controllo
  -- "avvenuta pubblicazione" della Fase verifica)
  CREATE TABLE IF NOT EXISTS ped_memory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_sync_id  TEXT NOT NULL,
    brief_id        INTEGER,
    event_type      TEXT NOT NULL,                   -- approvato | pubblicato | rifiutato
    channel         TEXT,
    ref_url         TEXT,
    notes           TEXT,
    ts              TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pedmem_client ON ped_memory(client_sync_id);
  CREATE INDEX IF NOT EXISTS idx_pedmem_type   ON ped_memory(event_type);

  -- Asset PED — singola immagine/file dello shooting, con hash per match
  -- Canva ↔ Drive e variante per le 4 regole di riuso del brief:
  --   originale | modificata_30_50 | scontornata | con_testi_logo
  CREATE TABLE IF NOT EXISTS ped_assets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_sync_id  TEXT NOT NULL,
    asset_key       TEXT NOT NULL,                   -- id Canva, hash file Drive, o slug
    name            TEXT,
    thumb_url       TEXT,
    source          TEXT,                             -- canva | drive
    variant         TEXT NOT NULL DEFAULT 'originale',
    used_in_briefs  TEXT,                             -- JSON array id ped_briefs
    last_used_at    TEXT,
    UNIQUE(client_sync_id, asset_key)
  );
  CREATE INDEX IF NOT EXISTS idx_pedassets_client ON ped_assets(client_sync_id);
`);

// Migrazioni leggere per DB già esistenti (ALTER idempotente)
for (const sql of [
  "ALTER TABLE users ADD COLUMN profile TEXT",
  "ALTER TABLE users ADD COLUMN profile_updated_at TEXT",
  "ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0",
  // activity_log v2: contesto voce per diff line-level
  "ALTER TABLE activity_log ADD COLUMN line_index INTEGER",
  "ALTER TABLE activity_log ADD COLUMN line_name TEXT",
  // social_tasks v2: stato separato per lavorazione (quote) — richiesta Luigi 2026-05-25
  "ALTER TABLE social_tasks ADD COLUMN quote_sync_id TEXT",
]) {
  try { db.exec(sql); } catch { /* colonna già presente */ }
}

// Migrazione strutturale social_tasks: il vecchio UNIQUE(client, year, month)
// impedisce 2 lavorazioni nello stesso cliente×mese. Lo sostituiamo con
// UNIQUE(client, COALESCE(quote, ''), year, month) ricostruendo la tabella.
try {
  const idxRow = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='social_tasks' AND name='uniq_social_task'").get();
  if (!idxRow) {
    // Ricostruisco la tabella per rimuovere il vecchio UNIQUE inline.
    db.exec(`
      CREATE TABLE IF NOT EXISTS social_tasks_v2 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        client_sync_id  TEXT NOT NULL,
        quote_sync_id   TEXT,
        year            INTEGER NOT NULL,
        month           INTEGER NOT NULL,
        status          TEXT NOT NULL DEFAULT 'da_fare',
        assigned_to     TEXT,
        due_date        TEXT,
        notes           TEXT,
        tags            TEXT,
        attachments     TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      INSERT INTO social_tasks_v2 (id, client_sync_id, quote_sync_id, year, month, status, assigned_to, due_date, notes, tags, attachments, created_at, updated_at)
        SELECT id, client_sync_id, quote_sync_id, year, month, status, assigned_to, due_date, notes, tags, attachments, created_at, updated_at FROM social_tasks;
      DROP TABLE social_tasks;
      ALTER TABLE social_tasks_v2 RENAME TO social_tasks;
      CREATE UNIQUE INDEX uniq_social_task ON social_tasks(client_sync_id, COALESCE(quote_sync_id, ''), year, month);
      CREATE INDEX IF NOT EXISTS idx_social_year_month ON social_tasks(year, month);
      CREATE INDEX IF NOT EXISTS idx_social_assigned   ON social_tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_social_status     ON social_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_social_client     ON social_tasks(client_sync_id);
      CREATE INDEX IF NOT EXISTS idx_social_quote      ON social_tasks(quote_sync_id);
    `);
    console.log('[db] social_tasks migrato a schema v2 (quote_sync_id + UNIQUE composito)');
  }
} catch (e) {
  console.error('[db] migrazione social_tasks quote_sync_id fallita:', e.message);
}
// Promuove luigi a super_admin se è ancora un admin standard
try {
  db.exec("UPDATE users SET role = 'super_admin' WHERE username = 'luigi' AND role = 'admin'");
} catch {}

// ----- Password helper (scrypt, nessuna dipendenza nativa extra) -----
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

// ----- Seed utenti default (allineati a js/state.js) -----
const DEFAULT_USERS = [
  { username: 'luigi',     name: 'Luigi',     role: 'super_admin', password: 'luigi2026' },
  { username: 'lisa',      name: 'Lisa',      role: 'admin',       password: 'lisa2026'  },
  { username: 'team',      name: 'Team',      role: 'admin',       password: 'team2026'  },
  { username: 'operatore', name: 'Operatore', role: 'operator',    password: 'op2026'    },
  // Mattia — responsabile del piano editoriale social (importato dal file Excel).
  // Password temporanea da cambiare al primo accesso via UI Profilo.
  { username: 'mattia',    name: 'Mattia',    role: 'operator',    password: 'mattia2026' },
];

function seedUsers() {
  const ins = db.prepare(
    'INSERT INTO users (username, name, role, pass_hash, pass_salt) VALUES (?, ?, ?, ?, ?)'
  );
  const existing = db.prepare('SELECT username FROM users').all().map(r => r.username);
  const created = [];
  for (const u of DEFAULT_USERS) {
    if (existing.includes(u.username)) continue;
    const { hash, salt } = hashPassword(u.password);
    ins.run(u.username, u.name, u.role, hash, salt);
    created.push(u.username);
  }
  if (created.length) console.log('[db] Utenti seedati:', created.join(', '));
}

module.exports = { db, hashPassword, verifyPassword, seedUsers };
