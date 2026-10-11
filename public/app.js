const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const form = $('#fpl-form');
const MULTI = ['emergencyRadio', 'survivalEquipment', 'jackets'];
let config = {};
let editingId = null;
let currentPlan = null;
let me = null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = res.status === 204 ? null : await res.json();
  if (res.status === 401 && !url.startsWith('/api/auth/')) { me = null; location.hash = '#/entrar'; }
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Error'), { data, status: res.status });
  return data;
}

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 4000);
}

// ---------- Formulario ----------
function readForm() {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (MULTI.includes(el.name)) { (d[el.name] ||= []); if (el.checked) d[el.name].push(el.value); }
    else if (el.type === 'checkbox') d[el.name] = el.checked;
    else d[el.name] = el.value;
  }
  return d;
}

function fillForm(data) {
  form.reset();
  for (const el of form.elements) {
    if (!el.name || !(el.name in data)) continue;
    const v = data[el.name];
    if (MULTI.includes(el.name)) el.checked = v.includes(el.value);
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  }
}

function defaults() {
  const d = new Date(Date.now() + 90 * 60000);
  d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15, 0, 0);
  return {
    departureDate: d.toISOString().slice(0, 10),
    departureTime: d.toISOString().slice(11, 16).replace(':', ''),
    flightRules: 'V', flightType: 'G', wakeTurbulence: 'L', numberOfAircraft: 1,
    equipment: 'S', surveillance: 'C', cruisingLevel: 'VFR', route: 'DCT',
    emergencyRadio: ['V', 'E'], survivalEquipment: [], jackets: [],
    contactName: me?.name || '', contactEmail: me?.email || '', pilotInCommand: (me?.name || '').toUpperCase(),
  };
}

function showErrors(errors = {}) {
  $$('.error-msg', form).forEach((e) => e.remove());
  $$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
  for (const [name, msg] of Object.entries(errors)) {
    const el = form.elements[name];
    const input = el instanceof RadioNodeList ? el[0] : el;
    if (!input) continue;
    input.classList.add('invalid');
    input.closest('label, .checks')?.insertAdjacentHTML('beforeend', `<small class="error-msg">${esc(msg)}</small>`);
  }
}

function renderWarnings(list, el) {
  el.innerHTML = (list || []).map((w) => `<li>⚠ ${esc(w)}</li>`).join('');
}

let previewTimer;
let touched = false;
async function updatePreview() {
  const res = await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(readForm()) });
  const data = await res.json();
  if (data.message) {
    $('#fpl-preview').textContent = data.message.fpl;
    $('#item19-preview').textContent = '-' + data.message.item19;
  } else {
    $('#fpl-preview').textContent = `Faltan ${Object.keys(data.errors).length} dato(s) para armar el mensaje.`;
    $('#item19-preview').textContent = '';
  }
  if (touched) showErrors(data.errors);
  renderWarnings(data.warnings, $('#warnings'));
}

form.addEventListener('input', (e) => {
  if (e.target.matches('input:not([type=checkbox]):not([type=date]):not([type=email]):not([type=number])') && !['contactName', 'contactPhone'].includes(e.target.name)) {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    try { e.target.setSelectionRange(pos, pos); } catch {}
  }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 250);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  touched = true;
  try {
    const plan = editingId
      ? await api(`/api/plans/${editingId}`, { method: 'PUT', body: readForm() })
      : await api('/api/plans', { method: 'POST', body: readForm() });
    toast('Plan guardado.');
    location.hash = `#/plan/${plan.id}`;
  } catch (err) {
    if (err.data?.errors) { showErrors(err.data.errors); toast('Revisá los campos marcados.', 'err'); }
    else toast(err.message, 'err');
  }
});

// ---------- Lista ----------
async function renderList() {
  const plans = await api('/api/plans');
  const q = $('#search').value.trim().toUpperCase();
  const rows = plans.filter((p) => !q || [p.aircraftId, p.departure, p.destination].some((x) => x.includes(q)));
  $('#empty').hidden = plans.length > 0;
  $('#plans-body').innerHTML = rows.map((p) => `
    <tr data-id="${p.id}">
      <td>${esc(p.data.departureDate)} ${esc(p.data.departureTime)}</td>
      <td><b>${esc(p.aircraftId)}</b> <span class="muted">${esc(p.data.aircraftType)}</span></td>
      <td>${esc(p.departure)} → ${esc(p.destination)}</td>
      <td><span class="badge ${esc(p.status.split(' ')[0])}">${esc(p.status)}</span></td>
      <td><a href="#/plan/${p.id}">Ver</a></td>
    </tr>`).join('');
}
$('#search').addEventListener('input', renderList);
$('#plans-body').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && !e.target.closest('a')) location.hash = `#/plan/${tr.dataset.id}`;
});

// ---------- Detalle ----------
async function renderDetail(id) {
  const plan = await api(`/api/plans/${id}`);
  currentPlan = plan;
  $('#detail-title').textContent = `${plan.aircraftId} · ${plan.departure} → ${plan.destination}`;
  $('#btn-edit').href = `#/editar/${plan.id}`;
  $('#btn-pdf').href = `/api/plans/${plan.id}/pdf?download=1`;
  $('#mail-to').textContent = config.mode === 'test' ? `${config.dinaciaEmail} (próximamente en servicio)` : config.dinaciaEmail;
  $('#mail-subject').textContent = plan.email.subject;
  $('#mail-body').textContent = plan.email.text;
  renderWarnings(plan.warnings, $('#detail-warnings'));
  const sent = plan.submissions.filter((s) => s.result === 'ok' && s.mode === 'live').map((s) => ({ at: s.sent_at, what: 'Enviado' }));
  $('#sheet').innerHTML = renderSheet({ ...plan, history: sent });
  requestAnimationFrame(fitSheet);
  $('#history').innerHTML = plan.submissions.length
    ? plan.submissions.map((s) => `<li class="${s.result}">${esc(s.sent_at.replace('T', ' ').replace('Z', ' UTC'))} · ${esc(modeLabel(s.mode))}${s.recipient ? ' → ' + esc(s.recipient) : ''} · ${s.result === 'ok' ? 'OK' : 'Error: ' + esc(s.error)}</li>`).join('')
    : '<li class="muted">Sin envíos todavía.</li>';
}

function modeLabel(m) {
  return { preview: 'Simulación (no enviado)', test: 'Prueba (no presentado ante DINACIA)', live: 'Envío a DINACIA' }[m] || m;
}

$('#btn-send').addEventListener('click', async () => {
  const p = currentPlan;
  const where = config.mode === 'live'
    ? `Se enviará un correo REAL a <b>${esc(config.dinaciaEmail)}</b>.`
    : config.mode === 'test'
      ? '<b>Próximamente en servicio.</b> El envío a DINACIA todavía no está activo: este plan <b>no</b> se presenta ante DINACIA.'
      : 'Modo simulación: no se envía ningún correo; se genera el archivo para revisarlo.';
  const warn = p.warnings.length ? `<br><br>${p.warnings.map((w) => '⚠ ' + esc(w)).join('<br>')}` : '';
  $('#confirm-text').innerHTML = `${esc(p.aircraftId)} ${esc(p.departure)} → ${esc(p.destination)}, salida ${esc(p.data.departureDate)} ${esc(p.data.departureTime)} UTC.<br><br>${where}${warn}`;
  const dlg = $('#confirm');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener('close', async function onClose() {
    dlg.removeEventListener('close', onClose);
    if (dlg.returnValue !== 'ok') return;
    try {
      const r = await api(`/api/plans/${p.id}/send`, { method: 'POST', body: { confirm: true } });
      toast(r.mode === 'preview' ? `Simulación lista (${r.file}).` : r.mode === 'test' ? 'Próximamente en servicio: el plan no se presentó ante DINACIA.' : `Enviado a ${r.recipient}.`);
    } catch (err) {
      toast(`No se pudo enviar: ${err.message}`, 'err');
    }
    renderDetail(p.id);
  });
});

$('#btn-delete').addEventListener('click', async () => {
  if (!confirm('¿Eliminar este plan? No se puede deshacer.')) return;
  await api(`/api/plans/${currentPlan.id}`, { method: 'DELETE' });
  toast('Plan eliminado.');
  location.hash = '#/planes';
});

$('#btn-dup').addEventListener('click', () => {
  sessionStorage.setItem('dup', JSON.stringify(currentPlan.data));
  location.hash = '#/nuevo';
});

$('#btn-print').addEventListener('click', () => window.print());

// ---------- Hoja OACI ----------
function fitSheet() {
  const wrap = $('.sheet-wrap'), sc = $('#sheet');
  if (!wrap || wrap.offsetParent === null || !sc.firstElementChild) return;
  const k = Math.min(1, (wrap.clientWidth - 24) / 760);
  sc.style.transform = `scale(${k})`;
  wrap.style.height = `${sc.firstElementChild.offsetHeight * k + 24}px`;
}
window.addEventListener('resize', fitSheet);

// ---------- Cuenta ----------
function authPane(name) {
  $$('[data-pane]').forEach((f) => (f.hidden = f.dataset.pane !== name));
  $$('.tabs [data-auth]').forEach((b) => b.classList.toggle('active', b.dataset.auth === name));
  $('.tabs').hidden = !['login', 'register'].includes(name);
  authMsg('');
}
function authMsg(text, ok = false) {
  const m = $('#auth-msg');
  m.hidden = !text; m.textContent = text; m.className = `auth-msg${ok ? ' ok' : ''}`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-auth]');
  if (b) authPane(b.dataset.auth);
});
const formData = (f) => Object.fromEntries(new FormData(f));
function authErrors(err) {
  if (err.data?.errors) authMsg(Object.values(err.data.errors).join(' '));
  else authMsg(err.message);
}
function signedIn(user) {
  me = user;
  $('#who').textContent = user.name;
  $('#main-nav').hidden = false;
  location.hash = '#/planes';
  if (location.hash === '#/planes') route();
}
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { signedIn(await api('/api/auth/login', { method: 'POST', body: formData(e.target) })); } catch (err) { authErrors(err); }
});
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { signedIn(await api('/api/auth/register', { method: 'POST', body: formData(e.target) })); toast('Cuenta creada.'); } catch (err) { authErrors(err); }
});
$('#form-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/auth/forgot', { method: 'POST', body: formData(e.target) }); authMsg('Si el correo tiene una cuenta, te llega un enlace en unos minutos.', true); } catch (err) { authErrors(err); }
});
$('#form-reset').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = location.hash.split('/')[2] || '';
  try { signedIn(await api('/api/auth/reset', { method: 'POST', body: { ...formData(e.target), token } })); toast('Contraseña actualizada.'); } catch (err) { authErrors(err); }
});
$('#btn-logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  me = null; $('#main-nav').hidden = true;
  $$('[data-pane]').forEach((f) => f.reset());
  location.hash = '#/entrar';
});

// ---------- Rutas ----------
function show(view, nav) {
  for (const v of ['auth', 'form', 'list', 'detail']) $(`#view-${v}`).hidden = v !== view;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
}

async function route() {
  const h = location.hash || '#/planes';
  let m;
  if ((m = h.match(/^#\/restablecer\/(.+)/))) { show('auth'); authPane('reset'); return; }
  if (!me) { show('auth'); authPane('login'); return; }
  if (h === '#/entrar') { location.hash = '#/planes'; return; }
  try {
    if ((m = h.match(/^#\/plan\/(\d+)/))) { show('detail', 'planes'); await renderDetail(m[1]); }
    else if ((m = h.match(/^#\/editar\/(\d+)/))) {
      const plan = await api(`/api/plans/${m[1]}`);
      editingId = plan.id; touched = true;
      $('#form-title').textContent = `Editar plan ${plan.aircraftId}`;
      fillForm(plan.data); show('form', 'nuevo'); updatePreview();
    } else if (h.startsWith('#/planes')) { show('list', 'planes'); await renderList(); }
    else {
      editingId = null; touched = false;
      $('#form-title').textContent = 'Nuevo plan de vuelo';
      const dup = sessionStorage.getItem('dup');
      sessionStorage.removeItem('dup');
      fillForm(dup ? { ...JSON.parse(dup), ...pick(defaults(), ['departureDate', 'departureTime']) } : defaults());
      showErrors(); show('form', 'nuevo'); updatePreview();
    }
  } catch (err) {
    toast(err.message, 'err');
  }
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

(async () => {
  config = await api('/api/config');
  try { me = await api('/api/auth/me'); $('#who').textContent = me.name; $('#main-nav').hidden = false; } catch { me = null; }
  const b = $('#mode-banner');
  if (config.mode !== 'live') {
    b.hidden = false;
    b.textContent = config.mode === 'test'
      ? 'Próximamente en servicio: el envío de planes a DINACIA todavía no está activo.'
      : 'Modo simulación: los envíos no salen por correo; se generan para revisarlos.';
  }
  window.addEventListener('hashchange', route);
  route();
})();
