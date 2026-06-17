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
`);

// Migrazioni leggere per DB già esistenti (ALTER idempotente)
for (const sql of [
  "ALTER TABLE users ADD COLUMN profile TEXT",
  "ALTER TABLE users ADD COLUMN profile_updated_at TEXT",
]) {
  try { db.exec(sql); } catch { /* colonna già presente */ }
}

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
  { username: 'luigi',     name: 'Luigi',     role: 'admin',    password: 'luigi2026' },
  { username: 'lisa',      name: 'Lisa',      role: 'admin',    password: 'lisa2026'  },
  { username: 'team',      name: 'Team',      role: 'admin',    password: 'team2026'  },
  { username: 'operatore', name: 'Operatore', role: 'operator', password: 'op2026'    },
];

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const ins = db.prepare(
    'INSERT INTO users (username, name, role, pass_hash, pass_salt) VALUES (?, ?, ?, ?, ?)'
  );
  for (const u of DEFAULT_USERS) {
    const { hash, salt } = hashPassword(u.password);
    ins.run(u.username, u.name, u.role, hash, salt);
  }
  console.log('[db] Utenti default seedati:', DEFAULT_USERS.map(u => u.username).join(', '));
}

module.exports = { db, hashPassword, verifyPassword, seedUsers };
