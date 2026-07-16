# CodeByMike — Portafolio + Panel de Control + Laboratorio de Ingeniería

**En vivo: [codebymike.tech](https://codebymike.tech)**

Portafolio público, **panel de control privado** y **laboratorio de ingeniería**
construido con Astro 6 (SSR), Turso/libSQL + Drizzle, Auth.js (GitHub OAuth) y
Tailwind 4. Desplegado en Vercel. Sin frameworks de frontend, sin servicios de
pago: monitoreo, alertas, SLOs y observabilidad de seguridad son **desarrollo
propio** sobre capas gratuitas.

## En vivo (sin login)

| Página | Qué demuestra |
|---|---|
| [/demo](https://codebymike.tech/demo) | **El panel completo con datos ficticios**, sin registro: costos y P&L, clientes, monitoreo. Solo lectura, sobre una base de datos aparte |
| [/lab](https://codebymike.tech/lab) | Laboratorio: pipeline CI/CD con rollback, chaos engineering y ataques controlados a la pasarela, con resultados reales |
| [/status](https://codebymike.tech/status) | Uptime real de 8 monitores propios (motor de checks + incidentes + SSL), SLOs y error budget |
| [/security](https://codebymike.tech/security) | Micro-SIEM propio: intentos de intrusión detectados/bloqueados (agregados en vivo), arquitectura de 4 capas |
| [/notes](https://codebymike.tech/notes) | Artículos técnicos: chaos engineering, SLOs, micro-SIEM, sesiones revocables, RAG… |
| [/tools](https://codebymike.tech/tools) | Índice de las herramientas construidas en este repo |
| [/docs](https://codebymike.tech/docs) | Documentación formal: casos de uso, diagramas UML (SVG), requerimientos, historias de usuario |
| [/architecture](https://codebymike.tech/architecture) | Cómo está construido el sistema |
| [/pay](https://codebymike.tech/pay) | Pasarela de pagos (modo sandbox) con idempotencia y webhooks firmados |

## Módulos de ingeniería (LAB)

Cada módulo existe para demostrar una práctica concreta, con tests y datos reales:

- **Monitoreo propio** — motor de uptime checks (latencia, SSL, incidentes) disparado por cron externo; alimenta `/status` y alertas push vía ntfy.
- **SLO / error budget** — objetivos de disponibilidad calculados sobre los checks reales, con presupuesto de error visible.
- **CI/CD + rollback** — pipeline en GitHub Actions que reporta cada corrida (estado, duración, cobertura) a la base vía ingesta autenticada; rollback automatizado.
- **Chaos engineering** — inyección de fallos con flags de TTL corto (máx 15 min), fail-open, con `/admin` excluido por código.
- **Micro-SIEM** — clasificador de amenazas OWASP en el middleware, rate limiting durable de dos capas, honeypots con tarpit, auto-block con TTL escalado, detección de anomalías por z-score, y vitrina pública con OPSEC (solo agregados). Plan completo en [`docs/plan-security-observability.md`](./docs/plan-security-observability.md).
- **Pagos** — checkout con llaves de idempotencia y verificación de firma de webhooks (modo mock sin llaves reales).
- **Fingerprinting demo** — [/lab/fingerprint](https://codebymike.tech/lab/fingerprint): identificación de dispositivos entre pestañas/salas.

Planes de fases pendientes (load testing k6, SAST/a11y, mutation testing) en
[`docs/plan-lab-fases-pendientes.md`](./docs/plan-lab-fases-pendientes.md) y el
roadmap general en [`docs/plan-roadmap-2026-07.md`](./docs/plan-roadmap-2026-07.md).

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

## Arquitectura (resumen)

```
request → Vercel (edge, DDoS/WAF) → src/middleware.ts
            · clasificador de amenazas + rate limit durable + blocklist (fail-open)
            · chaos flags (LAB) · auth allowlist /admin · headers CSP/HSTS
          → Astro 6 SSR (páginas + /api) → Turso (libSQL) vía Drizzle
crons externos (cron-job.org) → /api/cron/* (Bearer) → checks, rollups, alertas ntfy
```

Directorios clave: `src/lib/` (lógica pura, testeada), `src/lib/security/`
(micro-SIEM), `src/pages/api/` (endpoints), `tests/` (Vitest, 280+ tests),
`drizzle/` (migraciones aditivas), `docs/` (planes vivos).

## Tests

```bash
npm test              # Vitest (lógica pura + libsql en archivo temporal)
npm run test:coverage
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
