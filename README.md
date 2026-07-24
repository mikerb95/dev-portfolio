# CodeByMike — Portafolio + Panel de Control + Laboratorio de Ingeniería

**En vivo: [codebymike.tech](https://codebymike.tech)**

Portafolio público, **panel de control privado**, **portal de clientes** y
**laboratorio de ingeniería** construido con Astro 7 (SSR), Turso/libSQL +
Drizzle, Auth.js (GitHub OAuth) y Tailwind 4. Desplegado en Vercel. Sin
frameworks de frontend, sin servicios de pago más allá de la pasarela:
monitoreo, alertas, SLOs y observabilidad de seguridad son **desarrollo propio**
sobre capas gratuitas.

## En vivo (sin login)

| Página | Qué demuestra |
|---|---|
| [/demo](https://codebymike.tech/demo) | **El panel completo con datos ficticios**, sin registro: costos y P&L, clientes, monitoreo. Solo lectura, sobre una base de datos aparte |
| [/lab](https://codebymike.tech/lab) | Laboratorio: pipeline CI/CD con rollback, chaos engineering, hallazgos de seguridad y ataques controlados a la pasarela, con resultados reales |
| [/status](https://codebymike.tech/status) | Uptime real de 8 monitores propios (motor de checks + incidentes + SSL), SLOs y error budget |
| [/security](https://codebymike.tech/security) | Micro-SIEM propio: intentos de intrusión detectados/bloqueados (agregados en vivo), arquitectura de 4 capas |
| [/notes](https://codebymike.tech/notes) | Artículos técnicos: chaos engineering, SLOs, micro-SIEM, sesiones revocables, mutation testing, RAG… |
| [/tools](https://codebymike.tech/tools) | Índice de las herramientas construidas en este repo |
| [/docs](https://codebymike.tech/docs) | Documentación formal: requerimientos, casos de uso, diagramas UML, kanban, [guía completa de testing](https://codebymike.tech/docs/testing), V&V y [estado del pipeline en vivo](https://codebymike.tech/docs/pipeline-en-vivo) |
| [/architecture](https://codebymike.tech/architecture) | Cómo está construido el sistema |
| [/pay](https://codebymike.tech/pay) | Pasarela de pagos (modo sandbox) con idempotencia y webhooks firmados |
| [/paginas-web](https://codebymike.tech/paginas-web) | Landing comercial de diseño web para negocios locales, aparte de la marca técnica |

## Módulos de ingeniería (LAB)

Cada módulo existe para demostrar una práctica concreta, con tests y datos reales:

- **Monitoreo propio** — motor de uptime checks (latencia, SSL, incidentes) disparado por cron externo; alimenta `/status` y alertas push vía ntfy.
- **SLO / error budget** — objetivos de disponibilidad calculados sobre los checks reales, con presupuesto de error visible.
- **CI/CD + rollback** — pipeline en GitHub Actions que reporta cada corrida (estado, duración, cobertura) a la base vía ingesta autenticada; rollback automatizado.
- **Chaos engineering** — inyección de fallos con flags de TTL corto (máx 15 min), fail-open, con `/admin` excluido por código.
- **Micro-SIEM** — clasificador de amenazas OWASP en el middleware, rate limiting durable de dos capas, honeypots con tarpit, auto-block con TTL escalado, detección de anomalías por z-score, y vitrina pública con OPSEC (solo agregados). Plan completo en [`docs/plan-security-observability.md`](./docs/plan-security-observability.md).
- **Pagos** — checkout con llaves de idempotencia y verificación de firma de webhooks (modo mock sin llaves reales).
- **SAST + DAST + accesibilidad** — `npm audit` y CodeQL sobre el código, OWASP ZAP baseline contra el preview, y axe-core sobre las páginas públicas; todo desemboca en hallazgos rastreables con estado (abierto/resuelto/aceptado) en el panel del LAB.
- **Mutation testing + contratos** — Stryker sobre `src/lib` (score real 87.2 %) y esquemas Zod que congelan la forma de las respuestas de la API.
- **Fingerprinting demo** — [/lab/fingerprint](https://codebymike.tech/lab/fingerprint): identificación de dispositivos entre pestañas/salas.

Queda pendiente la última fase del LAB (load testing con k6), detallada en
[`docs/plan-lab-fases-pendientes.md`](./docs/plan-lab-fases-pendientes.md); el
roadmap general está en [`docs/plan-roadmap-2026-07.md`](./docs/plan-roadmap-2026-07.md).

## Panel privado (`/admin`)

Fuente centralizada de información del negocio: clientes, proyectos, **costos de
infraestructura con P&L multi-moneda**, **bóveda de credenciales cifrada**,
seguimiento (llamadas/reuniones/recordatorios), briefings, finanzas,
certificaciones, monitores, seguridad y backups.

- **Portafolio**: elige qué repos de GitHub se muestran (`/admin/repos`), con stack auto-importado.
- **Costos & P&L** (`/admin/costs`): costo por servicio (multi-moneda → USD base), ciclo de cobro, renovaciones con alertas, responsable de pago, margen por proyecto/cliente.
- **Bóveda de credenciales**: API keys/tokens/contraseñas por servicio, cifradas con AES-256-GCM, reveladas solo bajo demanda.
- **Seguimiento** (`/admin/seguimiento`): bitácora de interacciones + tablero de pendientes (vencidos/próximos).
- **Seguridad** (`/admin/security`): eventos del micro-SIEM, anomalías, blocklist con desbloqueo.
- **Mobile-first**: drawer responsive, tablas que se vuelven tarjetas en móvil.

## Demo del panel

`/demo` deja recorrer `/admin` completo sin cuenta. El aislamiento no depende de
esconder botones: los datos salen de una **base Turso distinta** (seleccionada
por request con `AsyncLocalStorage`, ver `src/db/index.ts`), el middleware solo
admite `GET`/`HEAD`, y las rutas que revelan credenciales o vuelcan datos están
vetadas por patrón — incluidas las que son GET, como el revelado de la bóveda.

```bash
node scripts/seed-demo.mjs   # recrea el esquema y siembra los datos ficticios
```

Requiere `TURSO_DEMO_URL` y `TURSO_DEMO_AUTH_TOKEN`. Sin ellas la demo no existe
y el panel se comporta exactamente como antes.

## Portal de clientes (`/portal`)

Cada cliente entra con su propia cuenta (email + contraseña con scrypt, cookie y
tabla de sesiones propias, sin compartir nada con el login del administrador) y
ve sus facturas —descargables en PDF—, sus documentos, el avance por hitos de su
proyecto y un hilo de mensajería con el administrador.

El requisito del que cuelga todo lo demás es el aislamiento entre clientes:
**el identificador de cliente nunca viene del request**, siempre sale de la
sesión y viaja en el `WHERE` aunque la consulta ya lleve un id de proyecto. Es
lo que verifican los 26 tests de `tests/portal-isolation.test.ts`. La
impersonación de soporte ("ver como cliente") es de solo lectura, cortada en el
middleware y además en el endpoint de pago, que vive fuera del prefijo
`/api/portal/` y se habría escapado del primer guard.

Falta la capa de tiempo real (el portal no se refresca solo): diseño cerrado en
[`docs/plan-portal-tiempo-real.md`](./docs/plan-portal-tiempo-real.md).

## Cobros de campo (`/cobrar`)

Flujo mobile-first para cobrar trabajos externos desde el celular: se configura
monto y teléfono, se previsualiza el mensaje y se envía por WhatsApp **sin usar
la API de WhatsApp** (se abre `wa.me` desde el propio teléfono). El cliente paga
en un link corto público `/c/[code]` y consulta su histórico en `/mis-pagos`.

Un cobro **es** una fila de `payments` con campos extra, no una tabla ni una
máquina de estados paralela. El monto se firma siempre en el servidor: nunca
viaja en la URL del mensaje. El teléfono tampoco es autenticación — solo el
token HMAC del link abre el historial completo; la consulta manual por número da
una vista enmascarada con rate limiting fuerte.

## Arquitectura (resumen)

```
request → Vercel (edge, DDoS/WAF) → src/middleware.ts
            · clasificador de amenazas + rate limit durable + blocklist (fail-open)
            · chaos flags (LAB) · auth allowlist /admin · headers CSP/HSTS
          → Astro 6 SSR (páginas + /api) → Turso (libSQL) vía Drizzle
crons externos (cron-job.org) → /api/cron/* (Bearer) → checks, rollups, alertas ntfy
```

Directorios clave: `src/lib/` (lógica pura, testeada), `src/lib/security/`
(micro-SIEM), `src/lib/portal/` (sesiones del portal), `src/pages/api/`
(endpoints), `tests/` (Vitest), `e2e/` (Playwright), `drizzle/` (migraciones
aditivas), `docs/` (planes vivos).

## Tests

**521 tests de Vitest** en 40 archivos y **45 e2e** de Playwright en 6 specs,
repartidos en 15 niveles distintos de verificación. El recorrido completo —qué
responde cada nivel y cuál es su punto ciego— está en
[/docs/testing](https://codebymike.tech/docs/testing).

```bash
npm test               # Vitest (lógica pura + libsql en archivo temporal)
npm run test:coverage
npm run test:e2e       # Playwright contra bases libsql desechables
npm run test:contracts # esquemas Zod sobre los handlers reales
npm run test:mutation  # Stryker sobre src/lib
```

## Seguridad

- Acceso restringido por **GitHub OAuth + allowlist** (`ALLOWED_GITHUB_LOGINS`), validada en el callback de login y en el middleware (defensa en profundidad); WebAuthn/passkeys como puerta alternativa.
- Secretos cifrados con **AES-256-GCM** (`ENCRYPTION_KEY`); nunca se exponen en listados ni en el HTML SSR, solo vía endpoints de revelado.
- CSP en modo enforce con reporting, HSTS con preload, `Permissions-Policy` restrictiva, y cabeceras endurecidas (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `noindex`) en todas las rutas `/admin`.
- Divulgación responsable: [`/.well-known/security.txt`](https://codebymike.tech/.well-known/security.txt) (RFC 9116).

## Licencia

**Software propietario — Todos los derechos reservados.**
© 2026 Mike (@mikerb95) — codebymike.tech

Este repositorio es público **solo** con fines de portafolio y demostración.
No se concede ningún permiso de uso, copia, modificación, distribución ni
reutilización del código. Ver [`LICENSE`](./LICENSE) para los términos completos.
