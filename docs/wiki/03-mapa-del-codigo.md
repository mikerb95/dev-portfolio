# 03 · Mapa del código

## Raíz del repositorio

| Ruta | Qué es |
|---|---|
| `src/` | La aplicación (ver abajo). |
| `tests/` | Vitest (~190 archivos). Lógica pura primero; libSQL en archivo temporal cuando hace falta concurrencia o UNIQUE. |
| `e2e/` | Playwright (14 specs, ~80 tests) con bases libSQL desechables y un Anthropic falso (`fake-anthropic.mjs`). |
| `drizzle/` | Migraciones generadas (0000 a 0050). **Nunca se editan a mano.** |
| `docs/` | Planes vivos (`plan-*.md`), runbooks, requisitos, historias de usuario, entregables SENA y esta wiki. |
| `scripts/` | Utilidades: siembras, exportadores, chequeos de sustentación, OG images, IndexNow, ingesta de k6/ZAP, reporte de pruebas. |
| `agents/` | Agentes de IA: `analista-siem/`, `asistente/` (versiones de terminal) y `vigia/` (Managed Agents, YAML versionado). |
| `instrumentacion/` | Medidor de cómputo portable que se instala en proyectos de clientes (`medidor.ts` + versiones `.mjs`/`.cjs` generadas). |
| `integrations/` | Integraciones de Astro propias: headers estáticos y redirect canónico para páginas prerenderizadas. |
| `lab/k6/` | Scripts de carga y estrés de k6. |
| `public/` | Estáticos: logos, OG images, CV, `final.html` (mazo de la sustentación), videos, fuentes. |
| `workshop/managed-agents/` | Material de un workshop sobre Claude Managed Agents. |
| `.github/workflows/` | 7 workflows: CI, Security, Accessibility, DAST, Mutation, Load test, Distribuir nota. |
| `.devcontainer/`, `compose.yaml` | Entorno Docker de desarrollo con dos `sqld` (principal y demo). |
| `CLAUDE.md` | Instrucciones para agentes. Obligatorio leerlo antes de editar. |
| `pendientes.md` | Inventario vivo de acciones manuales y trabajo pendiente. |
| `claude-lock.json` | IDs de los recursos del vigía en Managed Agents. |
| `informes/`, `manuales_sena/`, `expo-datacenters/`, `*.pdf`, `*.docx` | Entregables académicos y material de exposiciones. No es código de la app. |

## `src/`

| Ruta | Qué es |
|---|---|
| `middleware.ts` | Toda la seguridad y el ruteo de acceso. Ver [02](02-arquitectura.md). |
| `db/schema.ts` | Esquema Drizzle único (~2.000 líneas, ~90 tablas). |
| `db/index.ts` | Clientes libSQL diferidos + contextos demo/respaldo. |
| `pages/` | Rutas. `pages/api/` = endpoints. `pages/en/` = cascarones de 3 líneas que reexportan la página en español. |
| `layouts/` | `BaseLayout` (público), `AdminLayout`, `PortalLayout`, `PortalAuthLayout`, `CotizaLayout`, `PresentLayout`, `SlidesLayout`. |
| `components/` | Por área: `home/`, `engineering/`, `security/`, `tools/`, `lab/`, `notes/`, `log/`, `automatizaciones/`, `architecture/`, `ep/`, `admin/`, `portal/`, `plano/`, `present/`, `capacitacion/`, `paginas-web/`, `uml/`, `docs/`, `changelog/`. Sueltos: `Navbar`, `Footer`, `WhatsappFab` (burbuja + asesor IA), `Fantasmas` (Halloween), `LangSwitch`, `HuellaVisor`… |
| `lib/` | Lógica. Ver la tabla por dominio abajo. |
| `data/` | Datos tipados que alimentan páginas: requisitos, iteraciones, tarifario, modelos de diagramas, automatizaciones, guion de sustentación, instantánea de respaldo. **Ninguna cifra de `/docs` se escribe a mano en un `.astro`.** |
| `i18n/` | Locales, diccionarios `es.ts`/`en.ts` (`en` satisface `typeof es`), ruteo, formateo. Módulo puro. |
| `content/notes/{es,en}/` | 24 artículos técnicos (colección de Astro). |
| `styles/` | CSS global y de páginas con motion. |

## `src/lib` por dominio

> Convención: un módulo **puro** (sin BD ni red) se acompaña de uno `-db` o
> `-store` con la persistencia. Si un módulo se importa desde el navegador no
> puede importar `node:crypto` ni `../db`; se parte en isomorfo + solo-servidor
> (`cobros.ts` / `cobros-crypto.ts`).

### Seguridad (`lib/security/`)

`classify.ts` (clasificador puro), `sensor.ts` (pega clasificador + registro),
`events.ts` (`recordSecurityEvent`, `recordAdminEvent`), `blocklist.ts` (TTL
escalado 1 h → 1 d → 7 d, caché 30 s), `autoblock.ts`, `ratelimit-durable.ts`
(memoria + Turso), `anomaly.ts` / `anomaly-store.ts` (z-score), `rollup.ts`,
`honeypot.ts`, `audit.ts` (`AUDIT_CATEGORIES`), `paths.ts`, `private-headers.ts`,
`csp-report.ts`, `redact.ts`, `vitrina.ts`. Afines: `ssrf-guard.ts`,
`safe-url.ts`, `json-script.ts`, `crypto.ts` (AES-256-GCM), `vault.ts`,
`webauthn.ts`, `auth.ts` (allowlist), `device-sessions.ts`, `device-info.ts`,
`ratelimit.ts`, `chaos.ts`.

### Portal de clientes (`lib/portal/`)

`session.ts`, `login.ts`, `passwords.ts` (scrypt), `invitations.ts`, `team.ts`,
`projects.ts`, `hitos.ts`, `invoices.ts`, `invoice-pdf.ts`, `settlement.ts`
(pago → factura), `threads.ts`, `documents.ts`, `notifications.ts`, `live.ts`
(digest de tiempo real), `activity.ts`, `audit.ts`, `demo.ts`, `respaldo.ts`,
`health.ts`, `paths.ts`, `format.ts`.

### Dinero

`payments.ts` (núcleo: idempotencia, firma Wompi, `applyGatewayEvent`),
`payments-state.ts` (máquina de estados pura), `pay-form.ts`, `pay-result.ts`,
`cobros.ts` / `cobros-crypto.ts` / `cobros-db.ts` / `cobros-codes.ts` /
`cobros-notify.ts`, `mis-pagos.ts`, `cuentas-cobro.ts` / `cuentas-cobro-db.ts` /
`cuenta-cobro-pdf.ts`, `money.ts`, `pnl.ts`, `services.ts`, `infra-stack.ts`,
`resumen-mensual.ts`, `vida.ts`, `computo/*` (medición, cuota, cotizador de
hosting), `plano/*` (propuestas), `cotiza/*` (consultoría),
`festivos-co.ts`, `fecha-co.ts`, `phone.ts`.

### IA

`asesor/*` (chat público), `asistente/*` (panel: herramientas, escrituras con
aprobación, guardia de cifras, limpieza de PII, presupuesto), `analista/*`
(micro-SIEM), `vigia/*` (Managed Agents), `plano/ia/*`, `cotiza/ia.ts`,
`resumen-semanal-ia.ts`, `gasto-diario.ts` (tope compartido), `aeo/*`
(visibilidad en asistentes: `llms.txt`, JSON-LD, robots, conteo de bots).

### Observabilidad y operación

`monitors.ts` (motor de sondeo con SSL), `monitor-rollup.ts`, `latency.ts`,
`slo.ts`, `vitals.ts`, `cron-auth.ts`, `cron-runs.ts`, `cron-silencio.ts`
(detector de hombre muerto), `cron-largos.ts`, `notify.ts` (ntfy + Resend),
`email.ts`, `backup.ts`, `domains.ts` (RDAP), `diagnostics.ts` (analizador de
sitios), `indexnow.ts`, `resumen-semanal*.ts`, `pulso-publico.ts`,
`pulso-panel.ts`, `fallback/*`, `safe-query.ts`, `ep-agenda*.ts`.

### Presentaciones

`present/*` (decks HTML con PIN, Redis), `presentacion/*` (mando de
`/final.html`: espejo, puntero, eco, cronómetro, cierre, panel del ponente),
`sustentacion/*` (escenario, bus, PIN de presentador, mando del celular).

### LAB

`lab/findings.ts` + `findings-store.ts` (SAST/DAST/a11y), `lab/mutation.ts`,
`lab/load-test.ts`, `lab/pipeline-live.ts`, `contracts.ts` (Zod),
`fingerprint.ts` + `fingerprint-client.ts`, `cv-downloads.ts`.

### Documentación y diagramas

`bpmn-layout.ts`, `uml-activity.ts`, `uml-communication.ts`,
`uml-component.ts`, `uml-deployment.ts`, `red-layout.ts`,
`gobernanza-estilos.ts`.

### Contenido y perfil

`notes.ts`, `notes-meta.ts`, `changelog.ts`, `changelog-github.ts`,
`actividad.ts` (GitHub en `/log`), `skills.ts` (tracker de aprendizaje),
`racha-aviso.ts`, `education-paths.ts`, `cert-images.ts`, `capacitacion/*`,
`marketing/*`, `sena-ep.ts`, `sena-correos.ts`, `sena-remuneracion.ts`,
`hero-servicios.ts`, `temporada.ts`, `tech-stack.ts`, `interactions.ts`.

### Motion (`lib/motion/`)

Unos 60 módulos. Patrón: un archivo de **datos/geometría puro** (testeado en
`tests/motion-*.test.ts`) y un archivo **vivo** que lo dibuja en el navegador
(`*-vivo.ts`, `*-gl.ts`, `*-lienzo.ts`). Ejemplos: `isolineas.ts` (terreno del
hero), `filtro.ts` (hero de `/security`), `circuito.ts` (hero de `/tools`),
`ensayo.ts` (hero de `/lab`), `partitura.ts` (`/automatizaciones`),
`reloj.ts` (`/log`), `trazado.ts` (`/architecture`), `cinta-ep.ts` (`/ep`).

### Utilidades base

`env.ts` (`serverEnv`: lee `import.meta.env` **y** `process.env`), `site.ts`,
`canonical-host.ts`, `db-target.ts`, `db-unique.ts`.
