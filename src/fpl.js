// Validación y armado del mensaje FPL OACI (Doc 4444, Apéndice 2 / Enmienda 1)
// según el formulario de plan de vuelo de DINACIA (AIP Uruguay ENR 1.10).

const RULES = ['I', 'V', 'Y', 'Z'];
const FLIGHT_TYPES = ['S', 'N', 'G', 'M', 'X'];
const WTC = ['L', 'M', 'H', 'J'];

// Mayúsculas sin tildes ni eñes: los mensajes OACI solo admiten A-Z, 0-9 y algunos signos.
const up = (v) => (v == null ? '' : String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase());
const clean = (v) => up(v).replace(/\s+/g, ' ');

function normalize(input) {
  const p = {};
  p.aircraftId = up(input.aircraftId).replace(/[^A-Z0-9]/g, '');
  p.flightRules = up(input.flightRules);
  p.flightType = up(input.flightType);
  p.numberOfAircraft = parseInt(input.numberOfAircraft, 10) || 1;
  p.aircraftType = up(input.aircraftType);
  p.wakeTurbulence = up(input.wakeTurbulence);
  p.equipment = up(input.equipment).replace(/\s/g, '');
  p.surveillance = up(input.surveillance).replace(/\s/g, '');
  p.departureAerodrome = up(input.departureAerodrome);
  p.departureDate = String(input.departureDate || '').trim(); // YYYY-MM-DD (UTC)
  p.departureTime = up(input.departureTime).replace(':', ''); // HHMM UTC
  p.cruisingSpeed = up(input.cruisingSpeed);
  p.cruisingLevel = up(input.cruisingLevel);
  p.route = clean(input.route);
  p.destinationAerodrome = up(input.destinationAerodrome);
  p.totalEet = up(input.totalEet).replace(':', '');
  p.alternate1 = up(input.alternate1);
  p.alternate2 = up(input.alternate2);
  p.otherInfo = clean(input.otherInfo);
  p.endurance = up(input.endurance).replace(':', '');
  p.personsOnBoard = up(input.personsOnBoard);
  p.emergencyRadio = arr(input.emergencyRadio);
  p.survivalEquipment = arr(input.survivalEquipment);
  p.jackets = arr(input.jackets);
  p.dinghiesNumber = up(input.dinghiesNumber);
  p.dinghiesCapacity = up(input.dinghiesCapacity);
  p.dinghiesCover = !!input.dinghiesCover;
  p.dinghiesColour = clean(input.dinghiesColour);
  p.aircraftColour = clean(input.aircraftColour);
  p.remarks = clean(input.remarks);
  p.pilotInCommand = clean(input.pilotInCommand);
  p.contactName = String(input.contactName || '').trim();
  p.contactPhone = String(input.contactPhone || '').trim();
  p.contactEmail = String(input.contactEmail || '').trim();
  p.pilotLicense = up(input.pilotLicense);
  return p;
}

function arr(v) {
  if (Array.isArray(v)) return v.map(up).filter(Boolean);
  if (typeof v === 'string' && v) return v.split(/[,\s]+/).map(up).filter(Boolean);
  return [];
}

const AD = /^[A-Z]{4}$/;
const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;
const DUR = /^\d{2}[0-5]\d$/;

function validate(p) {
  const e = {};
  if (!/^[A-Z0-9]{2,7}$/.test(p.aircraftId)) e.aircraftId = 'Entre 2 y 7 letras/números (ej. CXABC).';
  if (!RULES.includes(p.flightRules)) e.flightRules = 'Elegí I, V, Y o Z.';
  if (!FLIGHT_TYPES.includes(p.flightType)) e.flightType = 'Elegí S, N, G, M o X.';
  if (p.numberOfAircraft < 1 || p.numberOfAircraft > 99) e.numberOfAircraft = 'Entre 1 y 99.';
  if (!/^[A-Z][A-Z0-9]{1,3}$/.test(p.aircraftType)) e.aircraftType = 'Designador OACI de 2 a 4 caracteres (ej. C172) o ZZZZ.';
  if (!WTC.includes(p.wakeTurbulence)) e.wakeTurbulence = 'Elegí L, M, H o J.';
  if (!/^(N|[A-Z0-9]+)$/.test(p.equipment)) e.equipment = 'Ej. S, SDFG o N.';
  if (!/^(N|[A-Z0-9]+)$/.test(p.surveillance)) e.surveillance = 'Ej. C, S, B1 o N.';
  if (!AD.test(p.departureAerodrome)) e.departureAerodrome = 'Código OACI de 4 letras (ej. SUMU) o ZZZZ.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.departureDate)) e.departureDate = 'Fecha de salida (UTC).';
  if (!HHMM.test(p.departureTime)) e.departureTime = 'Hora UTC en formato HHMM.';
  if (!/^(N\d{4}|K\d{4}|M\d{3})$/.test(p.cruisingSpeed)) e.cruisingSpeed = 'Ej. N0110 (nudos), K0200 (km/h) o M082.';
  if (!/^(F\d{3}|A\d{3}|S\d{4}|M\d{4}|VFR)$/.test(p.cruisingLevel)) e.cruisingLevel = 'Ej. A045, F065, S1130, M0840 o VFR.';
  if (!p.route) e.route = 'Indicá la ruta (ej. DCT).';
  if (!AD.test(p.destinationAerodrome)) e.destinationAerodrome = 'Código OACI de 4 letras o ZZZZ.';
  if (!DUR.test(p.totalEet)) e.totalEet = 'Duración HHMM (ej. 0130).';
  if (p.alternate1 && !AD.test(p.alternate1)) e.alternate1 = 'Código OACI de 4 letras.';
  if (p.alternate2 && !AD.test(p.alternate2)) e.alternate2 = 'Código OACI de 4 letras.';
  if (p.alternate2 && !p.alternate1) e.alternate2 = 'Completá primero el 1er alternativo.';
  if (!DUR.test(p.endurance)) e.endurance = 'Autonomía HHMM (ej. 0400).';
  if (!/^(\d{1,3}|TBN)$/.test(p.personsOnBoard)) e.personsOnBoard = 'Número de personas o TBN.';
  if (!p.pilotInCommand) e.pilotInCommand = 'Nombre del piloto al mando.';
  if (!p.contactName) e.contactName = 'Nombre de contacto.';
  if (!p.contactPhone) e.contactPhone = 'Teléfono de contacto.';
  if (p.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.contactEmail)) e.contactEmail = 'Email no válido.';
  if (p.dinghiesNumber && !/^\d{1,2}$/.test(p.dinghiesNumber)) e.dinghiesNumber = 'Número de botes.';
  if (p.dinghiesCapacity && !/^\d{1,3}$/.test(p.dinghiesCapacity)) e.dinghiesCapacity = 'Capacidad total.';
  if (p.cruisingLevel !== 'VFR' && /^F(29\d|3\d\d|40\d|410)$/.test(p.cruisingLevel)) {
    // Aviso AIP ENR 1.10: sin aprobación RVSM no se deben colocar niveles FL290–FL410.
    if (!/RVSM|STS\/NONRVSM/.test(p.otherInfo) && !p.equipment.includes('W')) {
      e.cruisingLevel = 'Entre FL290 y FL410 se requiere aprobación RVSM (equipo W).';
    }
  }
  return e;
}

function departureUtc(p) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.departureDate) || !HHMM.test(p.departureTime)) return null;
  return new Date(`${p.departureDate}T${p.departureTime.slice(0, 2)}:${p.departureTime.slice(2)}:00Z`);
}

// Avisos no bloqueantes (plazos AIP ENR 1.10).
function warnings(p, now = new Date()) {
  const w = [];
  const dep = departureUtc(p);
  if (dep) {
    const mins = (dep - now) / 60000;
    if (mins < 0) w.push('La hora de salida ya pasó. Revisá fecha y hora (UTC).');
    else if (mins < 60) w.push(`Faltan ${Math.round(mins)} min para la salida: el AIP pide presentar el plan al menos 60 minutos antes.`);
    if (mins > 120 * 60) w.push('La salida es en más de 120 horas; verificá la fecha.');
  }
  if (p.flightRules !== 'V' && p.cruisingLevel === 'VFR') w.push('Nivel "VFR" con reglas de vuelo distintas de V.');
  return w;
}

function dof(p) {
  const [y, m, d] = p.departureDate.split('-');
  return `${y.slice(2)}${m}${d}`;
}

function item18(p) {
  let txt = p.otherInfo || '';
  if (!/\bDOF\//.test(txt) && p.departureDate) txt = `${txt} DOF/${dof(p)}`.trim();
  if (p.aircraftType === 'ZZZZ' && !/\bTYP\//.test(txt)) txt += ' TYP/?';
  return txt || '0';
}

function item19(p) {
  const parts = [`E/${p.endurance}`, `P/${p.personsOnBoard}`];
  if (p.emergencyRadio.length) parts.push(`R/${p.emergencyRadio.join('')}`);
  if (p.survivalEquipment.length) parts.push(`S/${p.survivalEquipment.join('')}`);
  if (p.jackets.length) parts.push(`J/${p.jackets.join('')}`);
  if (p.dinghiesNumber) {
    parts.push(`D/${p.dinghiesNumber.padStart(2, '0')} ${p.dinghiesCapacity.padStart(3, '0')}${p.dinghiesCover ? ' C' : ''}${p.dinghiesColour ? ' ' + p.dinghiesColour : ''}`);
  }
  if (p.aircraftColour) parts.push(`A/${p.aircraftColour}`);
  if (p.remarks) parts.push(`N/${p.remarks}`);
  parts.push(`C/${p.pilotInCommand}`);
  return parts.join(' ');
}

// Mensaje FPL en formato OACI (casillas 7 a 18) + casilla 19 aparte.
function buildMessage(p) {
  const num = p.numberOfAircraft > 1 ? String(p.numberOfAircraft) : '';
  const altn = [p.alternate1, p.alternate2].filter(Boolean).join(' ');
  const lines = [
    `(FPL-${p.aircraftId}-${p.flightRules}${p.flightType}`,
    `-${num}${p.aircraftType}/${p.wakeTurbulence}-${p.equipment}/${p.surveillance}`,
    `-${p.departureAerodrome}${p.departureTime}`,
    `-${p.cruisingSpeed}${p.cruisingLevel} ${p.route}`,
    `-${p.destinationAerodrome}${p.totalEet}${altn ? ' ' + altn : ''}`,
    `-${item18(p)})`,
  ];
  return { fpl: lines.join('\n'), item19: item19(p) };
}

module.exports = { normalize, validate, warnings, buildMessage, departureUtc };
