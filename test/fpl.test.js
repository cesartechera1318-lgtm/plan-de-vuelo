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
