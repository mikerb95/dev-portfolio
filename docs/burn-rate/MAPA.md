# Mapa: alertas por burn rate - estado actual

Generado por exploración de código (Modo 1). No propone soluciones. Todo
enunciado va con ruta real. Fecha de la exploración: 2026-09-21.

## 1. Monitores y ejecución de sondeos

- Definición de monitores: tabla `monitors` (`src/db/schema.ts:307`). CRUD en
  `src/pages/api/admin/monitors/index.ts` (`GET`, `POST`) y
  `src/pages/api/admin/monitors/[id].ts` (`GET`, `PUT`, `DELETE`), UI en
  `src/pages/admin/monitors.astro`.
- Motor de sondeo puro: `probe()` en `src/lib/monitors.ts:35` (fetch + timeout,
  sin dependencias externas) y `fetchSslExpiry()` (`src/lib/monitors.ts:84`,
  socket TLS para expiración de certificado).
- Disparo del sondeo real: `runCheck()` en
  `src/pages/api/cron/uptime-check.ts:36`. `GET` (línea 206) lo llama
  cron-job.org (o Vercel cron) con `Authorization: Bearer CRON_SECRET`
  (`cronSecretOk`, `src/lib/cron-auth.ts`); `PUT` (línea 218) es el disparo
  manual desde `/admin/monitors` bajo sesión admin.
- Sondeo "en vivo" alterno (sin BD, cuando la base no responde):
  `sondearEnVivo()` en `src/lib/fallback/sondeo-vivo.ts`, usado solo por
  `/status.astro` en modo degradado.

## 2. Esquema de la tabla de sondeos

`monitor_checks` (`src/db/schema.ts:336`): `id` PK, `monitor_id` FK →
`monitors.id` (`onDelete: cascade`), `at` (timestamp), `ok` (boolean),
`status_code`, `response_ms`, `error`. Índices: compuesto
`(monitor_id, at)` (`monitorAtIdx`) para la serie por monitor, y simple `(at)`
(`atIdx`) para consultas por fecha sin filtrar monitor (`/api/engineering/live`).
Retención: purga de filas con `at` < hoy-90d al final de `runCheck()`
(`uptime-check.ts:129`).

## 3. Cron de rollup diario

`src/pages/api/cron/monitor-rollup.ts`, función `runRollup(dias)` (línea 43).
Agrega `monitor_checks` → `monitor_daily` (`src/db/schema.ts:367`, columnas
`monitor_id`, `day` 'YYYY-MM-DD' UTC, `total`, `ok`, `sum_ms`, `latency_hist`
JSON, `computed_at`; unique `(monitor_id, day)` para upsert). La agregación en
sí (conteos + histograma de latencia) vive en el módulo puro
`src/lib/monitor-rollup.ts` (`aggregateChecks`, `HIST_BOUNDS` de 32 cubos,
`quantileFromHist` para el p95 aproximado). Por defecto recalcula los últimos
2 días cerrados (`DIAS_POR_DEFECTO`); backfill manual vía
`PUT ...?days=N` (tope `DIAS_MAX=120`). Borra `monitor_daily` con `day` <
hoy-120d. El día en curso NUNCA se escribe aquí: se agrega en vivo donde se
lee (ver §4).

## 4. Cálculo de uptime, SLO 99.5% y presupuesto de error

Núcleo puro: `src/lib/slo.ts`, funciones `computeSlo()` / `computeSloFromCounts()`
(objetivo por defecto 99.5%, ventana por defecto 30 días). Devuelve SLI,
`budgetMinutes`, `spentMinutes`, `remainingMinutes`, `budgetConsumedPct`,
`budgetRemainingPct` y **`burnRate`** (tasa de fallo observada ÷ tasa
presupuestada). `budgetHealth()` clasifica en `healthy/warning/critical/exhausted`.
Documentado como implementado en `src/data/documentacion.ts` (RF-403, RNF-09).

Hay **dos consumidores con fuentes de datos distintas**:
- `/status.astro` (público, líneas 92-249): usa `monitor_daily` (rollup) para
  días cerrados + agregado en vivo de `monitor_checks` del día de hoy
  (`aggregateChecks`). `SLO_DAYS=30`, `OBJECTIVE=99.5` fijos en el archivo.
  Pinta `sliPct`, `budgetRemainingPct` + minutos, y `healthLabel[c.health]`
  (líneas 491-512). **No pinta `burnRate`.**
- `/admin/lab/slo.astro` + `src/pages/api/admin/lab/slo.ts` (privado, sesión
  admin): lee `monitor_checks` **crudo** directamente (sin pasar por el
  rollup), con `objective` y `days` (1-90) configurables por query string.
  Sí pinta `burnRate` como tarjeta ("Burn rate", `slo.astro:102`).

## 5. Registro de incidentes

Tabla `monitor_incidents` (`src/db/schema.ts:386`): `monitor_id`, `started_at`,
`resolved_at` (null = abierto), `cause`, `last_error`, `duration_sec`. Se abren
y cierran dentro del mismo `runCheck()` (`uptime-check.ts:86-110`): un fallo
sin incidente abierto crea uno; un éxito con incidente abierto lo cierra y
calcula `duration_sec`. Sin severidad ni clasificación por tipo de fallo.
`/status.astro` lista incidentes resueltos (90d, límite 10, líneas 133-147) e
incidentes activos (sin límite, líneas 148-160) filtrados a monitores públicos.

## 6. Mecanismo de alertas

Sí existe: `src/lib/notify.ts`, `sendEmail()` (Resend REST, no-op sin
`RESEND_API_KEY`+`ALERT_EMAIL_TO`) y `sendPush()` (ntfy.sh, no-op sin
`NTFY_TOPIC`). Se disparan desde `notify(events)` en `uptime-check.ts:159`,
solo ante **eventos discretos**: `down`, `recovery`, `ssl` (certificado por
vencer) y `cron` (silencio de tareas programadas, vía
`silenciosPorAvisar()`/`describirSilencio()` de `src/lib/cron-runs.ts` y
`src/lib/cron-silencio.ts`). **No hay alerta por sondeo individual ni por
burn rate**: el `burnRate` de `/admin/lab/slo` se calcula bajo demanda al
cargar la página, no dispara `sendEmail`/`sendPush`, y no existe hoy ningún
esquema de ventanas corta/larga tipo "burn rate alerting" de Google SRE.

## 7. Representación de huecos de datos

A nivel de día, en `/status.astro` (`cards[].bars`, línea 215): si no hay fila
en `monitor_daily`/agregado de hoy para un día, o `total === 0`, la barra es
`{ day, pct: null }` y se pinta gris corta (`bg-ink-600`, clase `barColor`)
con tooltip `st.noDataYet` ("Sin datos"). A nivel de la mini-gráfica EKG de
latencia reciente (`recentLatency()`, `src/lib/latency.ts`), la clase
`.ekg-empty` se muestra cuando no hay serie. No hay ninguna noción de "hueco"
a nivel de `monitor_checks` individual (sondeo faltante entre dos esperados).

## 8. Framework de tests y comandos

Vitest (`npm test` = `vitest run`, `npm run test:watch`, `npm run test:coverage`).
Playwright para e2e (`npm run test:e2e`, `:ui`, `:server`). Stryker para
mutación (`npm run test:mutation`). Build: `npm run build` (`astro build`),
type-check: `npx astro check`.

Tests existentes que ya cubren este dominio: `tests/slo.test.ts` (incluye
casos de `burnRate` ≈1 y ≈2, `budgetHealth`, `formatMinutes`),
`tests/monitor-rollup.test.ts` (histograma, `quantileFromHist`,
`aggregateChecks`), `tests/monitors.test.ts` (probe/SSL). No hay e2e de
`/status` en `e2e/`, ni ningún test que ejercite `/admin/lab/slo.ts` o
`uptime-check.ts` end-to-end contra BD real.

## Dudas

- No existe todavía ningún RF/RNF en `src/data/documentacion.ts` para "burn
  rate" como concepto propio (solo RF-403/RNF-09 para SLO/error budget); no
  está claro si el proyecto de burn-rate es una extensión de esos requisitos o
  uno nuevo.
- `docs/burn-rate/PLAN.md` (que el Modo 2 de este rol dice que debe leer al
  cerrar) no existe todavía: no se pudo contrastar el mapa contra un plan.
- La discrepancia de fuente de datos entre `/status` (rollup + hoy en vivo) y
  `/admin/lab/slo` (crudo, hasta 90 días) no tiene una explicación en
  comentarios más allá de que son código separado; no quedó claro si es
  deliberado o simple deuda.
- No se encontró ningún lugar donde `burnRate` cruce un umbral y dispare
  `notify()`; si "alertas por burn rate" implica ese disparo, hoy no existe en
  ninguna forma, ni siquiera parcial.
