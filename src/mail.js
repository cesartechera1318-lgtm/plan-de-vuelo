const path = require('node:path');
const fs = require('node:fs');
const nodemailer = require('nodemailer');
const sheetPdf = require('./sheet-pdf');

// MAIL_MODE:
//   preview (por defecto) -> no envía nada; guarda el .eml en data/outbox para revisarlo.
//   test                  -> envía SOLO a TEST_RECIPIENT (tu propio correo).
//   live                  -> envía a DINACIA (DINACIA_EMAIL, por defecto plandevuelo@dinacia.gub.uy).
// Cualquier valor que no sea exactamente test o live (vacío, mal escrito, con comillas) cae en preview: nunca envía.
const RAW_MODE = String(process.env.MAIL_MODE || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
const MODE = ['test', 'live'].includes(RAW_MODE) ? RAW_MODE : 'preview';
const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');
const DINACIA_EMAIL = clean(process.env.DINACIA_EMAIL) || 'plandevuelo@dinacia.gub.uy';
const TEST_RECIPIENT = clean(process.env.TEST_RECIPIENT);
const FROM = clean(process.env.MAIL_FROM) || clean(process.env.SMTP_USER) || 'planes@example.com';
const outbox = path.join(__dirname, '..', 'data', 'outbox');

function recipient() {
  if (MODE === 'live') return DINACIA_EMAIL;
  if (MODE === 'test') return TEST_RECIPIENT;
  return DINACIA_EMAIL; // en preview solo se muestra, no se envía
}

const BREVO_API_KEY = clean(process.env.BREVO_API_KEY);
const PROVIDER = BREVO_API_KEY ? 'brevo' : 'smtp';

function config() {
  const configured = PROVIDER === 'brevo' || !!process.env.SMTP_HOST;
  return { mode: MODE, requestedMode: RAW_MODE || null, provider: PROVIDER, recipient: recipient(), dinaciaEmail: DINACIA_EMAIL, from: FROM,
    ready: MODE === 'preview' || (configured && (MODE !== 'test' || !!TEST_RECIPIENT)) };
}

// "Nombre <correo@x>" -> { name, email }
function parseAddress(a) {
  const m = String(a || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^["']|["']$/g, '') || undefined, email: m[2].trim() } : { email: String(a).trim() };
}

// Envío por la API HTTPS de Brevo (sirve en hosts que bloquean SMTP, como Railway Hobby).
function brevoTransport() {
  return {
    async sendMail(o) {
      const list = (v) => (v ? [].concat(v).map(parseAddress) : undefined);
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: parseAddress(o.from),
          to: list(o.to),
          cc: list(o.cc),
          replyTo: o.replyTo ? parseAddress(o.replyTo) : undefined,
          subject: o.subject,
          textContent: o.text,
          htmlContent: o.html || `<pre style="font-family:Consolas,Menlo,monospace">${esc(o.text)}</pre>`,
          attachment: o.attachments?.length ? o.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') })) : undefined,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Brevo rechazó el envío (${res.status}): ${body.message || body.code || 'error desconocido'}`);
      return { messageId: body.messageId };
    },
  };
}

function transport() {
  if (MODE === 'preview') {
    return nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  }
  if (MODE === 'test' && !TEST_RECIPIENT) throw new Error('Falta TEST_RECIPIENT para el modo de prueba.');
  if (PROVIDER === 'brevo') return brevoTransport();
  if (!process.env.SMTP_HOST) throw new Error('Falta configurar BREVO_API_KEY o SMTP_HOST para enviar correos.');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function compose(plan) {
  const p = plan.data;
  const m = plan.message;
  const subject = `FPL ${p.aircraftId} ${p.departureAerodrome}-${p.destinationAerodrome} ${p.departureDate} ${p.departureTime} UTC`;
  const contact = [
    `Piloto al mando: ${p.pilotInCommand}`,
    p.pilotLicense && `Licencia: ${p.pilotLicense}`,
    `Contacto: ${p.contactName}`,
    `Teléfono: ${p.contactPhone}`,
    p.contactEmail && `Email: ${p.contactEmail}`,
  ].filter(Boolean);
  const text = [
    'Se presenta el siguiente plan de vuelo:',
    '',
    m.fpl,
    '',
    'Información suplementaria (casilla 19):',
    `-${m.item19}`,
    '',
    ...contact,
    '',
    'Se adjunta el formulario de plan de vuelo OACI en PDF.',
    'Enviado desde la aplicación de planes de vuelo.',
  ].join('\n');
  const html = `<p>Se presenta el siguiente plan de vuelo:</p>
<pre style="font-family:Consolas,Menlo,monospace;font-size:14px;background:#f4f6f8;padding:12px;border-radius:6px">${esc(m.fpl)}</pre>
<p><b>Información suplementaria (casilla 19):</b></p>
<pre style="font-family:Consolas,Menlo,monospace;font-size:14px;background:#f4f6f8;padding:12px;border-radius:6px">-${esc(m.item19)}</pre>
<p>${contact.map(esc).join('<br>')}</p>
<p>Se adjunta el formulario de plan de vuelo OACI en PDF.</p>
<p style="color:#666;font-size:12px">Enviado desde la aplicación de planes de vuelo.</p>`;
  return { subject, text, html };
}

function pdfName(plan) {
  const p = plan.data;
  return `plan-de-vuelo-${[p.aircraftId, p.departureAerodrome, p.destinationAerodrome, p.departureDate].filter(Boolean).join('-')}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
}

// Hora de envío (UTC) en el asunto: así cada envío es un correo aparte y Gmail no los agrupa en una conversación.
function sentStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

async function send(plan, user) {
  const now = new Date();
  const c = compose(plan);
  const { text, html } = c;
  const subject = `${c.subject} · enviado ${sentStamp(now)}`;
  const to = recipient();
  const p = plan.data;
  // El formulario OACI va como PDF adjunto; si no se pudiera generar, el plan sale igual (el texto FPL es lo que vale).
  let attachments;
  try {
    attachments = [{ filename: pdfName(plan), content: await sheetPdf.render(plan, { filedAt: now }), contentType: 'application/pdf' }];
  } catch (err) {
    console.error('No se pudo generar el PDF del plan', plan.id, err);
  }
  const info = await transport().sendMail({
    from: FROM,
    to,
    cc: MODE === 'live' ? p.contactEmail || user?.email || undefined : undefined,
    replyTo: p.contactEmail || user?.email || undefined,
    subject,
    text,
    html,
    attachments,
  });
  let file = null;
  if (MODE === 'preview') {
    fs.mkdirSync(outbox, { recursive: true });
    file = path.join(outbox, `plan-${plan.id}-${Date.now()}.eml`);
    fs.writeFileSync(file, info.message);
  }
  return { mode: MODE, recipient: to, subject, messageId: info.messageId, file };
}

// Correo de recuperación de contraseña: va al usuario (en preview se guarda en data/outbox).
async function sendPasswordReset(user, link) {
  const info = await transport().sendMail({
    from: FROM,
    to: user.email,
    subject: 'Restablecer tu contraseña · Plan de Vuelo Uruguay',
    text: `Hola ${user.name}:\n\nPara elegir una contraseña nueva entrá a este enlace (vence en 1 hora):\n${link}\n\nSi no lo pediste, ignorá este correo.`,
  });
  if (MODE === 'preview') {
    fs.mkdirSync(outbox, { recursive: true });
    fs.writeFileSync(path.join(outbox, `reset-${user.id}-${Date.now()}.eml`), info.message);
  }
}

module.exports = { config, compose, send, sendPasswordReset, pdfName };
