# 14 · Catálogo de API (`src/pages/api`)

Unos 200 archivos de endpoint. La protección la decide **el middleware por prefijo**, no
cada endpoint (aunque varios repiten comprobaciones como defensa en
profundidad). Formas de respuesta de los endpoints clave congeladas con Zod en
`src/lib/contracts.ts` (`npm run test:contracts`).

| Prefijo | Protección |
|---|---|
| `/api/admin/*` | Sesión admin (o PIN de Cotiza en `/api/admin/cotiza/*`, o contraseña de sustentación en `/api/admin/sustentacion/*`). En demo: solo GET y sin rutas vetadas. |
| `/api/portal/*` | Sesión del portal (salvo login, reset, invitación, demo, health). Impersonación = solo lectura. |
| `/api/cron/*` | Bearer `CRON_SECRET`. |
| `/api/auth/*` | Auth.js + WebAuthn; rate limit de credenciales. |
| Resto | Públicos, con rate limit específico o el paraguas global. |

## Admin (`/api/admin/...`)

| Área | Endpoints |
|---|---|
| Asistente y búsqueda | `asistente/index` (chat), `asistente/decision` (aprobar/rechazar escritura), `buscar` |
| Analista | `analista/index` (ejecutar, SSE), `analista/decision`, `analista/origen` (detalle real de un seudónimo) |
| CRM | `projects/*` (incl. `adrs`, `contacts`, `envvars`, `services`), `clients/*` (incl. `impersonate`), `interactions`, `briefings/*` (con `items`), `asesor/[id]` |
| Bóveda | `services/[id]/secrets` (revelado bajo demanda), `services/[id]/refresh-expiry` |
| Dinero | `cobros/*` (crear, `lookup-client`, `[reference]/void`), `cuentas-cobro/*` (+ `pdf`), `costs`, `plano/*` (`horas`, `ia`, `pdf`, `ajustes`), `cotiza/encargos/*` (+ `ia`), `computo/proyectos`, `vida/fijos`, `vida/gastos` |
| Portal | `portal/clientes`, `portal/facturas`, `portal/hitos`, `portal/mensajes/[id]`, `portal/actividad` |
| Marketing | `marketing/campanas/*`, `marketing/suscriptores/[id]`, `marketing/procesar` |
| Capacitación | `capacitacion/programas/*`, `capacitacion/recursos/*`, `capacitacion/codigos/*` |
| Presentaciones | `decks/*`, `present/sessions`, `present/[sessionId]/control`, `present/[sessionId]/end`, `sustentacion/sesion`, `sustentacion/diagnostico` |
| Seguridad y sesiones | `security` (blocklist, bloqueo masivo), `sessions` (revocar), `webauthn/credentials`, `webauthn/registration/*` |
| LAB | `lab/chaos/*` (+ `experiment`), `lab/payments/*` (+ `attack`), `lab/ci-runs`, `lab/security`, `lab/slo`, `lab/load`, `lab/cv-downloads` |
| Monitores | `monitors/*`, `monitors/diagnose` |
| Perfil | `certifications/*`, `education/*` (+ `lab-progress`), `skills/tracks`, `skills/sessions`, `skills/milestones`, `github/repos`, `github/toggle` |
| Sistema | `settings/*` (+ `cotiza-pin`), `backup`, `upload`, `semana`, `sena-recordatorio`, `vigia/decision` |

## Portal (`/api/portal/...`)

`login`, `logout`, `reset`, `restablecer/[token]`, `invitacion/[token]`,
`demo` (pase de demo o de respaldo), `health`, `live` (digest de tiempo real),
`mensajes/*`, `documentos/*`, `facturas/[id]/pagar`, `facturas/[id]/pdf`,
`cuenta/{perfil,password,equipo,preferencias,sesiones,novedades}`.

## Cron (`/api/cron/...`)

`backup`, `portal-demo-reseed`, `monitor-rollup`, `computo-rollup`,
`uptime-check`, `domain-check`, `indexnow`, `invoices-overdue`,
`analista-matutino`, `resumen-semanal`, `security-rollup`, `sena-recordatorio`,
`marketing-envio`, `ep-agenda`. Ver [09](09-observabilidad-y-automatizaciones.md).

## Pagos y cobros

| Endpoint | Qué hace |
|---|---|
| `POST /api/payments/checkout` | Crea pago idempotente y firma el checkout de Wompi. |
| `POST /api/payments/webhook` | Evento de Wompi con firma verificada → `applyGatewayEvent`. |
| `GET /api/payments/resultado` | Estado para la página de vuelta. |
| `POST /api/payments/mock/pay` | Pago simulado (LAB, demo, e2e). |
| `POST /api/c/[code]/checkout` | Checkout de un cobro de campo. |
| `/api/mis-pagos/lookup` | Consulta enmascarada por teléfono. |
| `/api/propuesta/[token]/{simular,aceptar,anticipo}` | Enlace de Plano. |
| `/api/acuerdo/[token]` | Enlace de Cotiza. |
| `/api/cotiza/{pin,salir}` | Entrada y salida por PIN. |

## Público

| Endpoint | Qué hace |
|---|---|
| `/api/contact`, `/api/feedback` | Formularios. |
| `/api/asesor` (+ `/conversacion`, `/contacto`, `/enviado`) | Asesor público con IA y asesor en vivo. |
| `/api/vitals` | Ingesta de Core Web Vitals (RUM). |
| `/api/health`, `/api/now`, `/api/status/latency`, `/api/engineering/live` | Prueba de vida y datos de `/status` y `/engineering`. |
| `/api/github/activity`, `/api/github/public-repos` | Datos de `/log` y del portafolio. |
| `/api/lab/site-check` | Analizador público de dominios (SSRF guard). |
| `/api/lab/fp/*` | Salas de fingerprinting. |
| `/api/lab/pipeline-live` | Estado real del pipeline para `/docs/pipeline-en-vivo`. |
| `/api/lab/proceso` | Métricas de CPU y memoria del proceso para las pruebas de carga de k6. |
| `/api/lab/ingest` | Ingesta de CI/SAST/DAST/k6 (token de máquina). |
| `/api/computo/ingest` | Lotes firmados del medidor de clientes. |
| `/api/cv/capture`, `/api/cv/download` | Descarga del CV con huella y token. |
| `/api/marketing/{suscribir,confirmar,baja}` | Doble opt-in y baja. |
| `/api/capacitacion/acceso` | Canje del código de grupo. |
| `/api/aeo/referido` | Conteo de referidos desde asistentes. |
| `/api/ep-agenda` | Bitácora pública del vigía de agenda (con retraso de 10 min). |
| `/api/certs/[name]` | Imágenes de certificaciones. |
| `/api/security/csp-report` | Reportes de violación de CSP. |
| `/api/present/[sessionId]/snapshot`, `/api/presentacion` | Presentaciones (sistemas A y B). |
| `/api/sustentacion/*` | `acceso`, `pase`, `beat`, `comando`, `estado`, `guion`, `[sessionId]/snapshot`. |
| `/api/managed/webhook` | Webhook firmado del vigía. |

Algunos archivos de `src/pages/api/` (y de la raíz de `src/pages/`) son
**señuelos** del micro-SIEM: devuelven `serveHoneypot(...)`. No los documentes
aquí ni los "arregles"; si un archivo importa `lib/security/honeypot`, es un
señuelo a propósito.

## Endpoints especiales fuera de `/api`

`/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`,
`/decks/[id].html` y las rutas señuelo (no documentadas aquí, ver
[08](08-seguridad-micro-siem.md#3-honeypots-securityhoneypotts)).
