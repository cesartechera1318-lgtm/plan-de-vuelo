// Formulario de plan de vuelo modelo OACI completado con los datos del plan.
window.renderSheet = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const boxes = (val, n, cls = '') => {
    const s = String(val ?? '');
    let h = `<span class="bx ${cls}">`;
    for (let i = 0; i < n; i++) h += `<i>${esc(s[i] || '')}</i>`;
    return h + '</span>';
  };
  const lbl = (en, es, extra = '') => `<span class="lb ${extra}"><b>${en}</b><br>${es}</span>`;
  const arrowEnd = '<span class="ae">&lt;&lt;≡</span>';
  const opt = (letter, on, top) => `<span class="op${on ? '' : ' off'}">${top ? `<small>${top}</small>` : ''}<i>${letter}</i></span>`;
  const lines = (text, rows, width) => {
    const words = String(text || '').split(' ');
    const out = []; let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width) { out.push(cur.trim()); cur = w; } else cur += ' ' + w;
    }
    if (cur.trim()) out.push(cur.trim());
    while (out.length < rows) out.push('');
    return out.map((l) => `<div class="ln">${esc(l)}</div>`).join('');
  };
  const ddhhmm = (iso) => (iso ? iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16) : '');

  return function renderSheet(plan) {
    const p = plan.data;
    const m = plan.message;
    const item18 = m.fpl.split('\n').pop().replace(/^-/, '').replace(/\)$/, '');
    const sent = (plan.history || []).filter((h) => /^Enviado/.test(h.what)).pop();
    const R = p.emergencyRadio || [], S = p.survivalEquipment || [], J = p.jackets || [];
    const hasD = !!p.dinghiesNumber;
    return `
<div class="sheet">
  <div class="sh-title"><b>FLIGHT PLAN</b><br>PLAN DE VUELO</div>

  <div class="row gray">
    <div class="cell">${lbl('PRIORITY', 'Prioridad')}<div class="big">&lt;&lt;≡ FF ▸</div></div>
    <div class="cell grow">${lbl('ADDRESSEE(S)', 'Destinatarios')}<div class="ln"></div><div class="ln"></div><div class="ln">&nbsp;</div></div>
  </div>
  <div class="row gray">
    <div class="cell">${lbl('FILING TIME', 'Hora de depósito')}${boxes(ddhhmm(sent?.at), 6)}</div>
    <div class="cell">${lbl('ORIGINATOR', 'Remitente')}${boxes('', 8)} ${arrowEnd}</div>
  </div>
  <div class="row gray"><div class="cell grow">${lbl('SPECIFIC IDENTIFICATION OF ADDRESSEE(S) AND/OR ORIGINATOR', 'Identificación exacta de los destinatarios o del remitente')}<div class="ln">&nbsp;</div></div></div>

  <div class="row">
    <div class="cell">${lbl('3 MESSAGE TYPE', 'Tipo de mensaje')}<div class="big">&lt;&lt;≡ (FPL</div></div>
    <div class="cell">${lbl('7 AIRCRAFT IDENTIFICATION', 'Identificación de la aeronave')}— ${boxes(p.aircraftId, 7, 'w')}</div>
    <div class="cell">${lbl('8 FLIGHT RULES', 'Reglas de vuelo')}— ${boxes(p.flightRules, 1)}</div>
    <div class="cell">${lbl('TYPE OF FLIGHT', 'Tipo de vuelo')}${boxes(p.flightType, 1)} ${arrowEnd}</div>
  </div>
  <div class="row">
    <div class="cell">${lbl('9 NUMBER', 'Número')}— ${boxes(p.numberOfAircraft > 1 ? String(p.numberOfAircraft).padStart(2, '0') : '', 2)}</div>
    <div class="cell">${lbl('TYPE OF AIRCRAFT', 'Tipo de aeronave')}${boxes(p.aircraftType, 4)}</div>
    <div class="cell">${lbl('WAKE TURBULENCE CAT.', 'Cat. de estela turbulenta')}/ ${boxes(p.wakeTurbulence, 1)}</div>
    <div class="cell grow">${lbl('10 EQUIPMENT', 'Equipo')}— <span class="field">${esc(p.equipment)}/${esc(p.surveillance)}</span> ${arrowEnd}</div>
  </div>
  <div class="row">
    <div class="cell">${lbl('13 DEPARTURE AERODROME', 'Aeródromo de salida')}— ${boxes(p.departureAerodrome, 4)}</div>
    <div class="cell">${lbl('TIME', 'Hora')}${boxes(p.departureTime, 4)} ${arrowEnd}</div>
  </div>
  <div class="row">
    <div class="cell">${lbl('15 CRUISING SPEED', 'Velocidad de crucero')}— ${boxes(p.cruisingSpeed, 5)}</div>
    <div class="cell">${lbl('LEVEL', 'Nivel')}${boxes(p.cruisingLevel, 5)}</div>
    <div class="cell grow">${lbl('ROUTE', 'Ruta')}▸ <span class="field">${esc(p.route)}</span></div>
  </div>
  <div class="row"><div class="cell grow">${lines('', 3, 90)} ${arrowEnd}</div></div>

  <div class="row">
    <div class="cell">${lbl('16 DESTINATION AERODROME', 'Aeródromo de destino')}— ${boxes(p.destinationAerodrome, 4)}</div>
    <div class="cell">${lbl('TOTAL EET', 'EET total · HR. MIN')}${boxes(p.totalEet, 4)}</div>
    <div class="cell">${lbl('ALTN AERODROME', 'Aeródromo alt.')}▸ ${boxes(p.alternate1, 4)}</div>
    <div class="cell">${lbl('2ND ALTN AERODROME', '2º aeródromo alt.')}▸ ${boxes(p.alternate2, 4)} ${arrowEnd}</div>
  </div>
  <div class="row"><div class="cell grow">${lbl('18 OTHER INFORMATION', 'Otros datos')}— ${lines(item18, 3, 86)} <span class="ae">)&lt;&lt;≡</span></div></div>

  <div class="row gray center">${lbl('SUPPLEMENTARY INFORMATION (NOT TO BE TRANSMITTED IN FPL MESSAGES)', 'Información suplementaria (en los mensajes FPL no hay que transmitir estos datos)')}</div>
  <div class="row gray">
    <div class="cell">${lbl('19 ENDURANCE', 'Autonomía · HR/MIN')}— E/ ${boxes(p.endurance, 4)}</div>
    <div class="cell">${lbl('PERSONS ON BOARD', 'Personas a bordo')}▸ P/ ${boxes(p.personsOnBoard, 3)}</div>
    <div class="cell">${lbl('EMERGENCY RADIO', 'Equipo radio de emergencia')}▸ <span class="op stay"><i>R</i></span>/ ${opt('U', R.includes('U'), 'UHF')}${opt('V', R.includes('V'), 'VHF')}${opt('E', R.includes('E'), 'ELT')}</div>
  </div>
  <div class="row gray">
    <div class="cell">${lbl('SURVIVAL EQUIPMENT', 'Equipo de supervivencia')}▸ ${opt('S', S.length > 0)} / ${opt('P', S.includes('P'), 'POLAR')}${opt('D', S.includes('D'), 'DESERT')}${opt('M', S.includes('M'), 'MARITIME')}${opt('J', S.includes('J'), 'JUNGLE')}</div>
    <div class="cell">${lbl('JACKETS', 'Chalecos')}▸ ${opt('J', J.length > 0)} / ${opt('L', J.includes('L'), 'LIGHT')}${opt('F', J.includes('F'), 'FLUORES')}${opt('U', J.includes('U'), 'UHF')}${opt('V', J.includes('V'), 'VHF')}</div>
  </div>
  <div class="row gray">
    <div class="cell">${lbl('DINGHIES', 'Botes neumáticos')}▸ ${opt('D', hasD)} / ${lbl('NUMBER', 'Número', 'mini')}${boxes(hasD ? p.dinghiesNumber.padStart(2, '0') : '', 2)} ${lbl('CAPACITY', 'Capacidad', 'mini')}${boxes(hasD ? p.dinghiesCapacity.padStart(3, '0') : '', 3)} ${lbl('COVER', 'Cubierta', 'mini')}${opt('C', hasD && p.dinghiesCover)}</div>
    <div class="cell grow">${lbl('COLOUR', 'Color')}▸ <span class="field">${esc(hasD ? p.dinghiesColour : '')}</span> ${arrowEnd}</div>
  </div>
  <div class="row gray"><div class="cell grow">${lbl('AIRCRAFT COLOUR AND MARKINGS', 'Color y marcas de la aeronave')}<span class="op stay"><i>A</i></span>/ <span class="field">${esc(p.aircraftColour)}</span></div></div>
  <div class="row gray"><div class="cell grow">${lbl('REMARKS', 'Observaciones')}▸ ${opt('N', !!p.remarks)}/ <span class="field">${esc(p.remarks)}</span> ${arrowEnd}</div></div>
  <div class="row gray"><div class="cell grow">${lbl('PILOT-IN-COMMAND', 'Piloto al mando')}<span class="op stay"><i>C</i></span>/ <span class="field">${esc(p.pilotInCommand)}</span> <span class="ae">)&lt;&lt;≡</span></div></div>

  <div class="row foot">
    <div class="cell half">${lbl('FILED BY', 'Presentado por')}<div class="hand">${esc(p.contactName)}</div></div>
    <div class="cell half">${lbl('SPACE RESERVED FOR ADDITIONAL REQUIREMENTS', 'Espacio reservado para requisitos adicionales')}
      <div class="hand small">${[p.pilotLicense && 'Licencia: ' + esc(p.pilotLicense), 'Tel: ' + esc(p.contactPhone), p.contactEmail && esc(p.contactEmail)].filter(Boolean).join('<br>')}</div></div>
  </div>
</div>`;
  };
})();
