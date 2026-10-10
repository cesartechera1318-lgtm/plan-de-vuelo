const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { users, sessions, resets } = require('./db');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sid';
const SESSION_DAYS = 30;
const SECURE = process.env.NODE_ENV === 'production';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [, saltHex, keyHex] = String(stored).split('$');
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

const token = () => crypto.randomBytes(32).toString('base64url');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 19) + 'Z';

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

function startSession(res, userId) {
  const t = token();
  sessions.create(t, userId, inDays(SESSION_DAYS));
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${SECURE ? '; Secure' : ''}`);
}

function endSession(req, res) {
  const t = readCookie(req, COOKIE);
  if (t) sessions.remove(t);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE ? '; Secure' : ''}`);
}

// Adjunta req.user si hay sesión válida.
function loadUser(req, res, next) {
  const t = readCookie(req, COOKIE);
  req.user = t ? sessions.user(t) || null : null;
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  next();
}

// Límite simple de intentos por IP para login, registro y recuperación.
const attempts = new Map();
function rateLimit(max = 10, windowMs = 15 * 60000) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const list = (attempts.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    list.push(now);
    attempts.set(key, list);
    next();
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

function routes(app, mail) {
  app.post('/api/auth/register', rateLimit(10), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const errors = {};
    if (!name) errors.name = 'Ingresá tu nombre.';
    if (!EMAIL.test(email)) errors.email = 'Ingresá un correo válido.';
    if (password.length < 8) errors.password = 'Mínimo 8 caracteres.';
    if (!errors.email && users.byEmail(email)) errors.email = 'Ya hay una cuenta con este correo. Iniciá sesión.';
    if (Object.keys(errors).length) return res.status(422).json({ errors });
    const id = users.create(email, name, await hashPassword(password));
    startSession(res, id);
    res.status(201).json(publicUser(users.byId(id)));
  });

  app.post('/api/auth/login', rateLimit(10), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = users.byEmail(email);
    if (!u || !(await verifyPassword(String(req.body?.password || ''), u.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    sessions.prune();
    startSession(res, u.id);
    res.json(publicUser(u));
  });

  app.post('/api/auth/logout', (req, res) => { endSession(req, res); res.status(204).end(); });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sin sesión.' });
    res.json(publicUser(req.user));
  });

  // Siempre responde igual para no revelar qué correos tienen cuenta.
  app.post('/api/auth/forgot', rateLimit(5), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = users.byEmail(email);
    if (u) {
      const t = token();
      resets.create(t, u.id, new Date(Date.now() + 3600e3).toISOString().slice(0, 19) + 'Z');
      const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      try { await mail.sendPasswordReset(u, `${base}/#/restablecer/${t}`); } catch (err) { console.error('reset mail', err.message); }
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/reset', rateLimit(10), async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(422).json({ errors: { password: 'Mínimo 8 caracteres.' } });
    const userId = resets.consume(String(req.body?.token || ''));
    if (!userId) return res.status(400).json({ error: 'El enlace venció o ya se usó. Pedí uno nuevo.' });
    users.setPassword(userId, await hashPassword(password));
    sessions.removeForUser(userId);
    startSession(res, userId);
    res.json(publicUser(users.byId(userId)));
  });
}

module.exports = { loadUser, requireUser, routes, hashPassword, verifyPassword };
