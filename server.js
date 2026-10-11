const path = require('node:path');
const express = require('express');
const fpl = require('./src/fpl');
const { plans } = require('./src/db');
const mail = require('./src/mail');
const auth = require('./src/auth');
const sheetPdf = require('./src/sheet-pdf');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '200kb' }));
// Las escrituras de la API solo aceptan JSON (bloquea envíos de formularios desde otros sitios).
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.method !== 'DELETE' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Se esperaba JSON.' });
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] })); // /guias/x sirve /guias/x.html
app.use(auth.loadUser);
auth.routes(app, mail);

function prepare(body) {
  const p = fpl.normalize(body || {});
  const errors = fpl.validate(p);
  const ok = Object.keys(errors).length === 0;
  return { p, errors, ok, message: ok ? fpl.buildMessage(p) : null, warnings: fpl.warnings(p) };
}

app.get('/api/config', (req, res) => {
  const c = mail.config();
  // En modo prueba no se muestra a quién llegan los envíos (es el correo personal del administrador).
  res.json({ mode: c.mode, recipient: c.mode === 'test' ? null : c.recipient, dinaciaEmail: c.dinaciaEmail });
});

// Vista previa del mensaje sin guardar.
app.post('/api/preview', (req, res) => {
  const { errors, ok, message, warnings } = prepare(req.body);
  res.json({ ok, errors, message, warnings });
});

app.use('/api/plans', auth.requireUser);

app.get('/api/plans', (req, res) => res.json(plans.list(req.user.id)));

app.get('/api/plans/:id', (req, res) => {
  const plan = plans.get(req.user.id, Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado.' });
  const submissions = plan.submissions.map((s) => (s.mode === 'test' ? { ...s, recipient: null } : s));
  res.json({ ...plan, submissions, warnings: fpl.warnings(plan.data), email: mail.compose(plan) });
});

// Formulario OACI en PDF (el mismo que se adjunta al correo).
app.get('/api/plans/:id/pdf', async (req, res) => {
  const plan = plans.get(req.user.id, Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado.' });
  const live = (plan.submissions || []).find((s) => s.result === 'ok' && s.mode === 'live'); // la más reciente va primero
  const pdf = await sheetPdf.render(plan, { filedAt: live ? new Date(live.sent_at) : null });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${mail.pdfName(plan)}"`);
  res.end(pdf);
});

app.post('/api/plans', (req, res) => {
  const { p, errors, ok, message } = prepare(req.body);
  if (!ok) return res.status(422).json({ errors });
  const id = plans.create(req.user.id, p, message, fpl.departureUtc(p).toISOString());
  res.status(201).json(plans.get(req.user.id, id));
});

app.put('/api/plans/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!plans.get(req.user.id, id)) return res.status(404).json({ error: 'Plan no encontrado.' });
  const { p, errors, ok, message } = prepare(req.body);
  if (!ok) return res.status(422).json({ errors });
  plans.update(req.user.id, id, p, message, fpl.departureUtc(p).toISOString());
  res.json(plans.get(req.user.id, id));
});

app.delete('/api/plans/:id', (req, res) => {
  plans.remove(req.user.id, Number(req.params.id));
  res.status(204).end();
});

// Envío: exige confirm=true explícito desde la interfaz.
app.post('/api/plans/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const plan = plans.get(req.user.id, id);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado.' });
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Falta confirmar el envío.' });
  const errors = fpl.validate(plan.data);
  if (Object.keys(errors).length) return res.status(422).json({ errors });
  try {
    const r = await mail.send(plan, req.user);
    plans.logSubmission(id, { ...r, result: 'ok' });
    res.json({ ...r, recipient: r.mode === 'test' ? null : r.recipient, file: r.file ? path.basename(r.file) : null });
  } catch (err) {
    const cfg = mail.config();
    plans.logSubmission(id, { mode: cfg.mode, recipient: cfg.recipient || '-', subject: '-', result: 'error', error: err.message });
    res.status(502).json({ error: err.message });
  }
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(port, () => {
    const c = mail.config();
    console.log(`Planes de vuelo en http://localhost:${port}  (correo: modo ${c.mode}, destino ${c.recipient || '—'})`);
  });
}

module.exports = app;
