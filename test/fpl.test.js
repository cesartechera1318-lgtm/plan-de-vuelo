const test = require('node:test');
const assert = require('node:assert');
const fpl = require('../src/fpl');

const base = {
  aircraftId: 'cxabc', flightRules: 'V', flightType: 'G', numberOfAircraft: 1, aircraftType: 'C172',
  wakeTurbulence: 'L', equipment: 'S', surveillance: 'C', departureAerodrome: 'SUAA', departureDate: '2026-10-11',
  departureTime: '1500', cruisingSpeed: 'N0105', cruisingLevel: 'VFR', route: 'DCT', destinationAerodrome: 'SULS',
  totalEet: '0045', alternate1: 'SUMU', endurance: '0400', personsOnBoard: '2', emergencyRadio: ['V', 'E'],
  aircraftColour: 'BLANCO Y AZUL', pilotInCommand: 'J PEREZ', contactName: 'Juan Pérez', contactPhone: '099123456',
};

test('arma el mensaje FPL OACI', () => {
  const p = fpl.normalize(base);
  assert.deepStrictEqual(fpl.validate(p), {});
  const m = fpl.buildMessage(p);
  assert.strictEqual(m.fpl, '(FPL-CXABC-VG\n-C172/L-S/C\n-SUAA1500\n-N0105VFR DCT\n-SULS0045 SUMU\n-DOF/261011)');
  assert.strictEqual(m.item19, 'E/0400 P/2 R/VE A/BLANCO Y AZUL C/J PEREZ');
});

test('detecta errores de formato', () => {
  const e = fpl.validate(fpl.normalize({ ...base, departureAerodrome: 'MVD', cruisingSpeed: '110', totalEet: '1:70' }));
  assert.ok(e.departureAerodrome && e.cruisingSpeed && e.totalEet);
});

test('avisa si faltan menos de 60 minutos', () => {
  const p = fpl.normalize(base);
  const w = fpl.warnings(p, new Date('2026-10-11T14:30:00Z'));
  assert.match(w[0], /60 minutos/);
});

test('bloquea FL290-FL410 sin RVSM', () => {
  const e = fpl.validate(fpl.normalize({ ...base, flightRules: 'I', cruisingLevel: 'F310' }));
  assert.ok(e.cruisingLevel);
});

test('MAIL_MODE desconocido o mal escrito nunca envía', () => {
  const { execFileSync } = require('node:child_process');
  const run = (v) => execFileSync(process.execPath, ['--no-warnings', '-e', "console.log(require('./src/mail').config().mode)"], { env: { ...process.env, MAIL_MODE: v }, cwd: require('node:path').join(__dirname, '..') }).toString().trim();
  assert.strictEqual(run('Test '), 'test');
  assert.strictEqual(run('"live"'), 'live');
  assert.strictEqual(run('tset'), 'preview');
  assert.strictEqual(run(''), 'preview');
});

test('envío por Brevo arma el pedido correcto', async () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    let req;
    global.fetch = async (url, o) => { req = { url, headers: o.headers, body: JSON.parse(o.body) }; return { ok: true, json: async () => ({ messageId: '<x@brevo>' }) }; };
    const mail = require('./src/mail');
    const plan = { id: 1, data: { aircraftId: 'CXABC', departureAerodrome: 'SUAA', destinationAerodrome: 'SULS', departureDate: '2030-01-01', departureTime: '1500', pilotInCommand: 'J', contactName: 'Juan', contactPhone: '099', contactEmail: 'juan@example.com' }, message: { fpl: '(FPL-CXABC-VG)', item19: 'E/0400' } };
    mail.send(plan).then((r) => console.log(JSON.stringify({ r, req })));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '-e', script], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, MAIL_MODE: 'test', TEST_RECIPIENT: 'yo@example.com', BREVO_API_KEY: 'k', MAIL_FROM: 'Plan de Vuelo Uruguay <plandevuelouruguay@gmail.com>' },
  }).toString());
  assert.strictEqual(out.req.url, 'https://api.brevo.com/v3/smtp/email');
  assert.strictEqual(out.req.headers['api-key'], 'k');
  assert.deepStrictEqual(out.req.body.to, [{ email: 'yo@example.com' }]);
  assert.deepStrictEqual(out.req.body.sender, { name: 'Plan de Vuelo Uruguay', email: 'plandevuelouruguay@gmail.com' });
  assert.strictEqual(out.req.body.cc, undefined);
  assert.strictEqual(out.r.recipient, 'yo@example.com');
  assert.strictEqual(out.req.body.attachment.length, 1);
  assert.strictEqual(out.req.body.attachment[0].name, 'plan-de-vuelo-CXABC-SUAA-SULS-2030-01-01.pdf');
  assert.ok(Buffer.from(out.req.body.attachment[0].content, 'base64').subarray(0, 5).toString() === '%PDF-');
});
