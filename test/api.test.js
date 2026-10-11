const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpl-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.MAIL_MODE = 'preview';
const app = require('../server');

const plan = {
  aircraftId: 'CXABC', flightRules: 'V', flightType: 'G', numberOfAircraft: 1, aircraftType: 'C172', wakeTurbulence: 'L',
  equipment: 'S', surveillance: 'C', departureAerodrome: 'SUAA', departureDate: '2030-01-01', departureTime: '1500',
  cruisingSpeed: 'N0105', cruisingLevel: 'VFR', route: 'DCT', destinationAerodrome: 'SULS', totalEet: '0045',
  endurance: '0400', personsOnBoard: '2', pilotInCommand: 'J PEREZ', contactName: 'Juan', contactPhone: '099',
};

let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
}

test('cada piloto ve solo sus planes', async () => {
  const ana = client(), beto = client();
  assert.strictEqual((await ana('GET', '/api/plans')).status, 401);
  assert.strictEqual((await ana('POST', '/api/auth/register', { name: 'Ana', email: 'ana@example.com', password: 'clave1234' })).status, 201);
  assert.strictEqual((await beto('POST', '/api/auth/register', { name: 'Beto', email: 'beto@example.com', password: 'clave1234' })).status, 201);
  const created = await ana('POST', '/api/plans', plan);
  assert.strictEqual(created.status, 201);
  assert.strictEqual((await ana('GET', '/api/plans')).body.length, 1);
  assert.strictEqual((await beto('GET', '/api/plans')).body.length, 0);
  assert.strictEqual((await beto('GET', `/api/plans/${created.body.id}`)).status, 404);
  await beto('DELETE', `/api/plans/${created.body.id}`);
  assert.strictEqual((await ana('GET', '/api/plans')).body.length, 1);
  const sent = await ana('POST', `/api/plans/${created.body.id}/send`, { confirm: true });
  assert.strictEqual(sent.body.mode, 'preview');
  const pdf = await fetch(`${base}/api/plans/${created.body.id}/pdf`);
  assert.strictEqual(pdf.status, 401); // sin sesión no hay PDF
});

test('registro, login y errores', async () => {
  const c = client();
  assert.strictEqual((await c('POST', '/api/auth/register', { name: 'Ana', email: 'ANA@example.com', password: 'otraclave' })).status, 422);
  assert.strictEqual((await c('POST', '/api/auth/register', { name: 'X', email: 'x@example.com', password: 'corta' })).status, 422);
  assert.strictEqual((await c('POST', '/api/auth/login', { email: 'ana@example.com', password: 'mal' })).status, 401);
  const ok = await c('POST', '/api/auth/login', { email: 'Ana@Example.com', password: 'clave1234' });
  assert.strictEqual(ok.body.name, 'Ana');
  assert.strictEqual((await c('GET', '/api/auth/me')).body.email, 'ana@example.com');
  await c('POST', '/api/auth/logout', {});
  assert.strictEqual((await c('GET', '/api/auth/me')).status, 401);
});

test('recuperar contraseña', async () => {
  const c = client();
  assert.strictEqual((await c('POST', '/api/auth/forgot', { email: 'beto@example.com' })).status, 200);
  const outbox = path.join(__dirname, '..', 'data', 'outbox');
  const file = fs.readdirSync(outbox).filter((f) => f.startsWith('reset-')).sort().pop();
  const eml = fs.readFileSync(path.join(outbox, file), 'utf8').replace(/=\r?\n/g, '');
  const token = eml.match(/restablecer\/([A-Za-z0-9_-]+)/)[1];
  assert.strictEqual((await c('POST', '/api/auth/reset', { token, password: 'nuevaclave' })).status, 200);
  assert.strictEqual((await c('POST', '/api/auth/reset', { token, password: 'nuevaclave' })).status, 400);
  assert.strictEqual((await client()('POST', '/api/auth/login', { email: 'beto@example.com', password: 'nuevaclave' })).status, 200);
});
