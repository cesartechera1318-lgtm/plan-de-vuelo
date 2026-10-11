# Plan de Vuelo Uruguay

Aplicación web para cargar planes de vuelo OACI, guardarlos y enviarlos por correo a DINACIA.

## Qué hace
- Cada piloto crea su cuenta con correo y contraseña y ve solo sus planes. Incluye recuperar contraseña por correo.
- Formulario con las casillas del plan de vuelo OACI (7 a 19) y los datos de contacto que pide el formulario de DINACIA.
- Valida el formato de cada casilla y arma el mensaje `(FPL-...)` en vivo.
- Avisa si faltan menos de 60 minutos para la salida (AIP Uruguay ENR 1.10) y si se usa FL290–FL410 sin RVSM.
- Guarda los planes en SQLite: listado, búsqueda, edición, duplicar (para reutilizar una aeronave) y eliminar.
- Muestra el plan completado en el formulario de plan de vuelo modelo OACI, listo para imprimir o guardar en PDF.
- Envía el plan por correo a `plandevuelo@dinacia.gub.uy`, con confirmación previa e historial de envíos.

## Fuente oficial
AIP Uruguay ENR 1.10: el Departamento de Operaciones de DINACIA (Aeropuerto de Carrasco) recibe planes de vuelo
personalmente, por telefax (598) 2604 0311 o por email a **plandevuelo@dinacia.gub.uy**. Plazo: al menos 60 minutos
antes de la salida; el FPL vence 60 minutos después de la hora prevista si no hay DLA.
Para vuelos V/Z nacionales sin oficina de operaciones también existe el 0800-PLAN y el formulario web
https://plandevuelo.dinacia.gub.uy/plan-de-vuelo.

## Uso
Requiere Node.js 22.13 o superior.

```bash
npm install
cp .env.example .env   # editar si se quiere enviar correos
npm start              # http://localhost:3000
npm test
```

Para cargar las variables de `.env`: `node --env-file=.env --no-warnings server.js`.

### Modos de correo (`MAIL_MODE`)
| Modo | Qué pasa al tocar "Enviar a DINACIA" |
|---|---|
| `preview` (por defecto) | No sale ningún correo; se guarda el `.eml` en `data/outbox/` para revisarlo. |
| `test` | Se envía solo a `TEST_RECIPIENT` (tu correo) para probar el SMTP. |
| `live` | Se envía a DINACIA, con copia al email de contacto del piloto. |

## Publicar en internet
La app es un solo proceso Node con una base SQLite, así que el host necesita un **disco persistente** para `DB_PATH`.

**Railway** (recomendado): crear proyecto desde el repositorio de GitHub, agregar un *Volume* montado en `/data`
y cargar las variables de `.env.example` (`DB_PATH=/data/planes.db`, `NODE_ENV=production`, `APP_URL`, SMTP y `MAIL_MODE`).
Railway detecta el `Dockerfile`.

**Render**: Web Service desde el repositorio, con *Disk* montado en `/data` y las mismas variables.

**Servidor propio**: `docker build -t plan-de-vuelo . && docker run -d -p 3000:3000 -v planes:/data --env-file .env plan-de-vuelo`
detrás de un proxy con HTTPS (Caddy o Nginx).

### Envío de correos
Con `BREVO_API_KEY` la app manda por la API HTTPS de Brevo (gratis hasta 300 correos por día). Es la opción para Railway,
que bloquea SMTP en el plan Hobby. El remitente (`MAIL_FROM`) tiene que estar verificado en Brevo como *sender*.
Sin `BREVO_API_KEY` se usa SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).

## Estructura
- `server.js` — API (Express)
- `src/fpl.js` — validación y armado del mensaje OACI
- `src/auth.js` — cuentas, sesiones (cookie HttpOnly) y contraseñas con scrypt
- `src/db.js` — base de datos SQLite (`data/planes.db`)
- `src/mail.js` — envío por SMTP (nodemailer)
- `public/` — interfaz web (`sheet.js` dibuja el formulario OACI)
