const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'planes.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flight_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    aircraft_id TEXT NOT NULL,
    departure TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_utc TEXT,
    status TEXT NOT NULL DEFAULT 'borrador',
    data TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (${NOW}),
    updated_at TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_plan_id INTEGER NOT NULL REFERENCES flight_plans(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    message_id TEXT,
    result TEXT NOT NULL,
    error TEXT,
    sent_at TEXT NOT NULL DEFAULT (${NOW})
  );
`);
// Bases creadas por el prototipo anterior no tenían user_id.
if (!db.prepare('PRAGMA table_info(flight_plans)').all().some((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE flight_plans ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_plans_user ON flight_plans(user_id, departure_utc)');

function row(r) {
  if (!r) return null;
  return {
    id: r.id,
    aircraftId: r.aircraft_id,
    departure: r.departure,
    destination: r.destination,
    departureUtc: r.departure_utc,
    status: r.status,
    data: JSON.parse(r.data),
    message: JSON.parse(r.message),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const users = {
  create(email, name, passwordHash) {
    const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, passwordHash);
    return Number(r.lastInsertRowid);
  },
  byEmail(email) { return db.prepare('SELECT * FROM users WHERE email = ?').get(email); },
  byId(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id); },
  setPassword(id, hash) { db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id); },
};

const sessions = {
  create(token, userId, expiresAt) {
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  },
  user(token) {
    return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                       WHERE s.token = ? AND s.expires_at > ${NOW}`).get(token);
  },
  remove(token) { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); },
  removeForUser(userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); },
  prune() { db.exec(`DELETE FROM sessions WHERE expires_at <= ${NOW}; DELETE FROM password_resets WHERE expires_at <= ${NOW};`); },
};

const resets = {
  create(token, userId, expiresAt) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  },
  consume(token) {
    const r = db.prepare(`SELECT user_id FROM password_resets WHERE token = ? AND expires_at > ${NOW}`).get(token);
    db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);
    return r ? r.user_id : null;
  },
};

const plans = {
  list(userId) {
    return db.prepare('SELECT * FROM flight_plans WHERE user_id = ? ORDER BY departure_utc DESC, id DESC').all(userId).map(row);
  },
  get(userId, id) {
    const plan = row(db.prepare('SELECT * FROM flight_plans WHERE id = ? AND user_id = ?').get(id, userId));
    if (plan) {
      plan.submissions = db.prepare('SELECT * FROM submissions WHERE flight_plan_id = ? ORDER BY id DESC').all(id);
    }
    return plan;
  },
  create(userId, p, message, depUtc) {
    const r = db
      .prepare(`INSERT INTO flight_plans (user_id, aircraft_id, departure, destination, departure_utc, data, message)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, p.aircraftId, p.departureAerodrome, p.destinationAerodrome, depUtc, JSON.stringify(p), JSON.stringify(message));
    return Number(r.lastInsertRowid);
  },
  update(userId, id, p, message, depUtc) {
    db.prepare(`UPDATE flight_plans SET aircraft_id=?, departure=?, destination=?, departure_utc=?, data=?, message=?,
                status='borrador', updated_at=${NOW} WHERE id=? AND user_id=?`)
      .run(p.aircraftId, p.departureAerodrome, p.destinationAerodrome, depUtc, JSON.stringify(p), JSON.stringify(message), id, userId);
  },
  remove(userId, id) {
    db.prepare('DELETE FROM flight_plans WHERE id = ? AND user_id = ?').run(id, userId);
  },
  logSubmission(id, s) {
    db.prepare(`INSERT INTO submissions (flight_plan_id, mode, recipient, subject, message_id, result, error)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, s.mode, s.recipient, s.subject, s.messageId || null, s.result, s.error || null);
    if (s.result === 'ok') {
      const status = s.mode === 'live' ? 'enviado' : s.mode === 'test' ? 'enviado (prueba)' : 'simulado';
      db.prepare(`UPDATE flight_plans SET status=?, updated_at=${NOW} WHERE id=?`).run(status, id);
    }
  },
};

module.exports = { users, sessions, resets, plans };
