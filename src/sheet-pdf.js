// Formulario de plan de vuelo modelo OACI en PDF (A4), para adjuntar al correo.
// Replica la hoja de public/sheet.js con las fuentes estándar de PDF (Helvetica / Courier).
const PDFDocument = require('pdfkit');

const INK = '#111111';
const VAL = '#0a3a8a';
const GRAY = '#e3e3e3';
const RED = '#c0261a';

function build(plan, { filedAt = new Date() } = {}) {
  const p = plan.data;
  const m = plan.message;
  const item18 = m.fpl.split('\n').pop().replace(/^-/, '').replace(/\)$/, '');
  const R = p.emergencyRadio || [], S = p.survivalEquipment || [], J = p.jackets || [];
  const hasD = !!p.dinghiesNumber;
  const pad = (n) => String(n).padStart(2, '0');
  const filing = filedAt ? pad(filedAt.getUTCDate()) + pad(filedAt.getUTCHours()) + pad(filedAt.getUTCMinutes()) : '';

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Plan de vuelo ${p.aircraftId}`, Author: 'Plan de Vuelo Uruguay' } });
  const X0 = 28, W = 539, X1 = X0 + W;
  let y = 28;

  // --- piezas -------------------------------------------------------------
  const label = (x, yy, en, es) => {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(6.5).text(en, x, yy, { lineBreak: false });
    doc.font('Helvetica').fontSize(6).fillColor('#222222').text(es, x, yy + 7.5, { lineBreak: false });
  };
  const valueFont = (size = 10) => doc.font('Courier-Bold').fontSize(size).fillColor(VAL);
  const BW = 13, BH = 16;
  const boxes = (x, yy, val, n) => {
    const s = String(val ?? '');
    doc.lineWidth(0.6).strokeColor('#9a9a9a');
    for (let i = 1; i < n; i++) doc.moveTo(x + i * BW, yy).lineTo(x + i * BW, yy + BH).stroke();
    doc.lineWidth(0.8).strokeColor(INK).rect(x, yy, n * BW, BH).stroke();
    valueFont();
    for (let i = 0; i < n; i++) if (s[i]) doc.text(s[i], x + i * BW, yy + 4, { width: BW, align: 'center', lineBreak: false });
    return x + n * BW;
  };
  const field = (x, yy, w, val, h = BH) => {
    doc.lineWidth(0.8).strokeColor(INK).rect(x, yy, w, h).stroke();
    valueFont(9.5).text(String(val ?? ''), x + 4, yy + 4, { width: w - 8, height: h - 4, ellipsis: true });
  };
  const dash = (x, yy) => { doc.lineWidth(0.8).strokeColor(INK).moveTo(x, yy + BH - 2).lineTo(x + 7, yy + BH - 2).stroke(); return x + 10; };
  const tri = (x, yy) => { doc.fillColor(INK).polygon([x, yy + BH - 8], [x + 5, yy + BH - 5], [x, yy + BH - 2]).fill(); return x + 9; };
  const slash = (x, yy) => { doc.fillColor(INK).font('Helvetica').fontSize(9).text('/', x, yy + 5, { lineBreak: false }); return x + 6; };
  // Marca de fin de casilla: << seguido de tres rayas.
  const endMark = (x, yy, size = 7, prefix = '') => {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(size).text(prefix + '<<', x, yy, { lineBreak: false });
    const w = doc.widthOfString(prefix + '<<') + 1.5;
    doc.lineWidth(0.6).strokeColor(INK);
    for (let i = 0; i < 3; i++) doc.moveTo(x + w, yy + size * 0.22 + i * size * 0.22).lineTo(x + w + size * 0.6, yy + size * 0.22 + i * size * 0.22).stroke();
    return x + w + size * 0.6 + 3;
  };
  const opt = (x, yy, letter, on, top) => {
    const s = 14;
    if (top) doc.fillColor(INK).font('Helvetica').fontSize(5).text(top, x - 6, yy - 7, { width: s + 12, align: 'center', lineBreak: false });
    doc.lineWidth(1).strokeColor(INK).rect(x, yy, s, s).stroke();
    doc.fillColor(on ? INK : '#555555').font('Helvetica-Bold').fontSize(9).text(letter, x, yy + 3, { width: s, align: 'center', lineBreak: false });
    if (!on) doc.lineWidth(1).strokeColor(RED).moveTo(x + 1, yy + 1).lineTo(x + s - 1, yy + s - 1).moveTo(x + s - 1, yy + 1).lineTo(x + 1, yy + s - 1).stroke();
    return x + s + 4;
  };
  const row = (h, gray = false) => {
    if (gray) doc.rect(X0, y, W, h).fill(GRAY);
    doc.lineWidth(0.8).strokeColor(INK).moveTo(X0, y).lineTo(X1, y).moveTo(X0, y + h).lineTo(X1, y + h).stroke();
    const top = y; y += h; return top;
  };
  const wrap = (text, width, rows) => {
    doc.font('Courier-Bold').fontSize(9.5);
    const out = []; let cur = '';
    for (const w of String(text || '').split(' ')) {
      const next = cur ? cur + ' ' + w : w;
      if (cur && doc.widthOfString(next) > width) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    while (out.length < rows) out.push('');
    return out;
  };
  const lines = (x, yy, w, arr, h = 14) => arr.forEach((l, i) => field(x, yy + i * h, w, l, h));

  // --- título ---------------------------------------------------------------
  let t = row(34);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text('FLIGHT PLAN', X0, t + 6, { width: W, align: 'center' });
  doc.font('Helvetica').fontSize(10).text('PLAN DE VUELO', X0, t + 19, { width: W, align: 'center' });

  // --- encabezado ATS (lo completa la oficina) ------------------------------
  t = row(56, true);
  label(X0 + 8, t + 20, 'PRIORITY', 'Prioridad');
  let x = endMark(X0 + 8, t + 38, 10); doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('FF', x, t + 38, { lineBreak: false }); tri(x + 16, t + 28);
  label(X0 + 130, t + 4, 'ADDRESSEE(S)', 'Destinatarios');
  lines(X0 + 130, t + 16, W - 140, ['', '', ''], 13);
  t = row(38, true);
  label(X0 + 8, t + 5, 'FILING TIME', 'Hora de depósito'); boxes(X0 + 8, t + 18, filing, 6);
  label(X0 + 150, t + 5, 'ORIGINATOR', 'Remitente'); endMark(boxes(X0 + 150, t + 18, '', 8) + 4, t + 24);
  t = row(36, true);
  label(X0 + 8, t + 5, 'SPECIFIC IDENTIFICATION OF ADDRESSEE(S) AND/OR ORIGINATOR', 'Identificación exacta de los destinatarios o del remitente');
  field(X0 + 8, t + 18, W - 16, '', 13);

  // --- casillas 3 a 8 -------------------------------------------------------
  t = row(38);
  label(X0 + 8, t + 5, '3 MESSAGE TYPE', 'Tipo de mensaje');
  x = endMark(X0 + 8, t + 23, 10); doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('(FPL', x, t + 23, { lineBreak: false });
  label(X0 + 115, t + 5, '7 AIRCRAFT IDENTIFICATION', 'Identificación de la aeronave'); boxes(dash(X0 + 115, t + 18), t + 18, p.aircraftId, 7);
  label(X0 + 300, t + 5, '8 FLIGHT RULES', 'Reglas de vuelo'); boxes(dash(X0 + 300, t + 18), t + 18, p.flightRules, 1);
  label(X0 + 390, t + 5, 'TYPE OF FLIGHT', 'Tipo de vuelo'); endMark(boxes(X0 + 390, t + 18, p.flightType, 1) + 4, t + 24);

  // --- casillas 9 y 10 ------------------------------------------------------
  t = row(38);
  label(X0 + 8, t + 5, '9 NUMBER', 'Número'); boxes(dash(X0 + 8, t + 18), t + 18, p.numberOfAircraft > 1 ? pad(p.numberOfAircraft) : '', 2);
  label(X0 + 80, t + 5, 'TYPE OF AIRCRAFT', 'Tipo de aeronave'); boxes(X0 + 80, t + 18, p.aircraftType, 4);
  label(X0 + 170, t + 5, 'WAKE TURBULENCE CAT.', 'Cat. de estela turbulenta'); boxes(slash(X0 + 170, t + 18), t + 18, p.wakeTurbulence, 1);
  label(X0 + 290, t + 5, '10 EQUIPMENT', 'Equipo'); x = dash(X0 + 290, t + 18);
  field(x, t + 18, X1 - 40 - x, `${p.equipment || ''}/${p.surveillance || ''}`); endMark(X1 - 34, t + 24);

  // --- casilla 13 -----------------------------------------------------------
  t = row(38);
  label(X0 + 8, t + 5, '13 DEPARTURE AERODROME', 'Aeródromo de salida'); boxes(dash(X0 + 8, t + 18), t + 18, p.departureAerodrome, 4);
  label(X0 + 150, t + 5, 'TIME', 'Hora'); endMark(boxes(X0 + 150, t + 18, p.departureTime, 4) + 4, t + 24);

  // --- casilla 15 -----------------------------------------------------------
  const routeX = X0 + 229, routeFW = X1 - 8 - routeX;
  const [route1, ...routeRest] = wrap(p.route, routeFW - 8, 1);
  const contLines = wrap(routeRest.join(' '), W - 58, 3).slice(0, 3);
  t = row(38);
  label(X0 + 8, t + 5, '15 CRUISING SPEED', 'Velocidad de crucero'); boxes(dash(X0 + 8, t + 18), t + 18, p.cruisingSpeed, 5);
  label(X0 + 125, t + 5, 'LEVEL', 'Nivel'); boxes(X0 + 125, t + 18, p.cruisingLevel, 5);
  label(X0 + 220, t + 5, 'ROUTE', 'Ruta'); tri(X0 + 220, t + 18); field(routeX, t + 18, routeFW, route1);
  t = row(50);
  lines(X0 + 8, t + 5, W - 50, contLines, 13);
  endMark(X1 - 34, t + 36);

  // --- casilla 16 -----------------------------------------------------------
  t = row(38);
  label(X0 + 8, t + 5, '16 DESTINATION AERODROME', 'Aeródromo de destino'); boxes(dash(X0 + 8, t + 18), t + 18, p.destinationAerodrome, 4);
  label(X0 + 160, t + 5, 'TOTAL EET', 'EET total · HR. MIN'); boxes(X0 + 160, t + 18, p.totalEet, 4);
  label(X0 + 270, t + 5, 'ALTN AERODROME', 'Aeródromo alt.'); boxes(tri(X0 + 270, t + 18), t + 18, p.alternate1, 4);
  label(X0 + 390, t + 5, '2ND ALTN AERODROME', '2º aeródromo alt.'); endMark(boxes(tri(X0 + 390, t + 18), t + 18, p.alternate2, 4) + 4, t + 24);

  // --- casilla 18 -----------------------------------------------------------
  t = row(64);
  label(X0 + 8, t + 5, '18 OTHER INFORMATION', 'Otros datos');
  x = dash(X0 + 8, t + 6);
  lines(x, t + 20, X1 - 48 - x, wrap(item18, X1 - 56 - x, 3).slice(0, 3), 13);
  endMark(X1 - 38, t + 46, 7, ')');

  // --- casilla 19 (información suplementaria) -------------------------------
  t = row(22, true);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(6.5).text('SUPPLEMENTARY INFORMATION (NOT TO BE TRANSMITTED IN FPL MESSAGES)', X0, t + 4, { width: W, align: 'center' });
  doc.font('Helvetica').fontSize(6).text('Información suplementaria (en los mensajes FPL no hay que transmitir estos datos)', X0, t + 12, { width: W, align: 'center' });
  const tag = (x, yy, s) => { doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(s, x, yy + 4, { lineBreak: false }); return x + doc.widthOfString(s) + 3; };

  t = row(48, true);
  label(X0 + 8, t + 5, '19 ENDURANCE', 'Autonomía · HR/MIN'); boxes(tag(dash(X0 + 8, t + 26), t + 26, 'E/'), t + 26, p.endurance, 4);
  label(X0 + 130, t + 5, 'PERSONS ON BOARD', 'Personas a bordo'); boxes(tag(tri(X0 + 130, t + 26), t + 26, 'P/'), t + 26, p.personsOnBoard, 3);
  label(X0 + 270, t + 5, 'EMERGENCY RADIO', 'Equipo radio de emergencia');
  x = opt(tri(X0 + 270, t + 26), t + 26, 'R', true); x = slash(x, t + 26) + 4;
  x = opt(x, t + 26, 'U', R.includes('U'), 'UHF'); x = opt(x + 4, t + 26, 'V', R.includes('V'), 'VHF'); opt(x + 4, t + 26, 'E', R.includes('E'), 'ELT');

  t = row(48, true);
  label(X0 + 8, t + 5, 'SURVIVAL EQUIPMENT', 'Equipo de supervivencia');
  x = opt(tri(X0 + 8, t + 26), t + 26, 'S', S.length > 0); x = slash(x, t + 26) + 4;
  for (const [l, n] of [['P', 'POLAR'], ['D', 'DESERT'], ['M', 'MARITIME'], ['J', 'JUNGLE']]) x = opt(x + 6, t + 26, l, S.includes(l), n);
  label(X0 + 270, t + 5, 'JACKETS', 'Chalecos');
  x = opt(tri(X0 + 270, t + 26), t + 26, 'J', J.length > 0); x = slash(x, t + 26) + 4;
  for (const [l, n] of [['L', 'LIGHT'], ['F', 'FLUORES'], ['U', 'UHF'], ['V', 'VHF']]) x = opt(x + 6, t + 26, l, J.includes(l), n);

  t = row(48, true);
  label(X0 + 8, t + 5, 'DINGHIES', 'Botes neumáticos');
  x = opt(tri(X0 + 8, t + 26), t + 26, 'D', hasD); x = Math.max(slash(x, t + 26) + 4, X0 + 80);
  label(x, t + 5, 'NUMBER', 'Número'); x = boxes(x, t + 26, hasD ? p.dinghiesNumber.padStart(2, '0') : '', 2) + 10;
  label(x, t + 5, 'CAPACITY', 'Capacidad'); x = boxes(x, t + 26, hasD ? p.dinghiesCapacity.padStart(3, '0') : '', 3) + 10;
  label(x, t + 5, 'COVER', 'Cubierta'); x = opt(x, t + 26, 'C', hasD && p.dinghiesCover) + 14;
  label(x, t + 5, 'COLOUR', 'Color'); x = tri(x, t + 26);
  field(x, t + 26, X1 - 40 - x, hasD ? p.dinghiesColour : ''); endMark(X1 - 34, t + 32);

  t = row(36, true);
  label(X0 + 8, t + 4, 'AIRCRAFT COLOUR AND MARKINGS', 'Color y marcas de la aeronave');
  x = slash(opt(X0 + 8, t + 17, 'A', true), t + 15) + 4; field(x, t + 17, X1 - 8 - x, p.aircraftColour);
  t = row(36, true);
  label(X0 + 8, t + 4, 'REMARKS', 'Observaciones');
  x = slash(opt(tri(X0 + 8, t + 17), t + 17, 'N', !!p.remarks), t + 15) + 4; field(x, t + 17, X1 - 40 - x, p.remarks); endMark(X1 - 34, t + 23);
  t = row(36, true);
  label(X0 + 8, t + 4, 'PILOT-IN-COMMAND', 'Piloto al mando');
  x = slash(opt(X0 + 8, t + 17, 'C', true), t + 15) + 4; field(x, t + 17, X1 - 44 - x, p.pilotInCommand); endMark(X1 - 38, t + 23, 7, ')');

  // --- pie ------------------------------------------------------------------
  t = row(56);
  const half = X0 + W / 2;
  doc.lineWidth(0.8).strokeColor(INK).moveTo(half, t).lineTo(half, t + 56).stroke();
  label(X0 + 8, t + 5, 'FILED BY', 'Presentado por');
  valueFont(10).text(p.contactName || '', X0 + 8, t + 24, { width: W / 2 - 16 });
  label(half + 8, t + 5, 'SPACE RESERVED FOR ADDITIONAL REQUIREMENTS', 'Espacio reservado para requisitos adicionales');
  const extra = [p.pilotLicense && 'Licencia: ' + p.pilotLicense, 'Tel: ' + (p.contactPhone || ''), p.contactEmail].filter(Boolean).join('\n');
  valueFont(8.5).text(extra, half + 8, t + 22, { width: W / 2 - 16, lineGap: 1 });

  // marco exterior
  doc.lineWidth(1.4).strokeColor(INK).rect(X0, 28, W, y - 28).stroke();
  doc.end();
  return doc;
}

// Devuelve el PDF como Buffer.
function render(plan, opts) {
  return new Promise((resolve, reject) => {
    const doc = build(plan, opts);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

module.exports = { render };
