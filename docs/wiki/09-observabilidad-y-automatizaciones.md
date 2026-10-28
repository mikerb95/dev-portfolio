# 09 · Observabilidad y automatizaciones

Planes: [`docs/plan-automatizaciones.md`](../plan-automatizaciones.md),
[`docs/plan-roadmap-2026-07.md`](../plan-roadmap-2026-07.md). Artículos:
`/notes/por-que-construi-mi-propio-monitor`, `/notes/slos-y-error-budgets-en-un-portfolio`.

## Monitoreo de uptime propio

- **Motor**: [`src/lib/monitors.ts`](../../src/lib/monitors.ts). Hace la
  petición HTTP, mide latencia, valida status y contenido esperado, refresca la
  expiración del certificado TLS, abre y cierra **incidentes**
  (`monitor_incidents`). Redirecciones manuales + `ssrf-guard`.
- Nació porque UptimeRobot decía "todo bien" mientras producción servía la
  página equivocada.
- Datos: `monitors`, `monitor_checks` (crudo, con purga), `monitor_daily`
  (una fila por monitor y día, precalculada por el cron `monitor-rollup`).
- **Nunca** agregar `monitor_checks` en ventanas > 24 h desde una ruta pública:
  para eso está `monitor_daily` (RNF-25). Ver [13](13-base-de-datos.md#coste-de-lectura).
- Hueco real de sondeos conocido: 10 ago - 1 sep 2026 (cuota de Turso).
- Panel: `/admin/monitors`, ficha de proyecto. Público: `/status` (solo nombre,
  uptime, latencia).

## SLO y error budget

[`src/lib/slo.ts`](../../src/lib/slo.ts), al estilo Google SRE: SLI sobre los
checks reales, objetivo, presupuesto de error restante y burn rate. Panel en
`/admin/lab/slo`, resumen en `/status`.

## Web Vitals (RUM)

`WebVitals.astro` envía LCP/INP/CLS reales a `/api/vitals` → `web_vitals`.
`/engineering` muestra el p75 (`lib/vitals.ts`). RNF-12 (vitals en "good") está
**parcial**; los vitals aún no tienen rollup.

## Notificaciones

[`src/lib/notify.ts`](../../src/lib/notify.ts): push vía **ntfy.sh**
(`NTFY_TOPIC`) y email vía **Resend**. Si falta la variable, no-op silencioso
(`{ skipped: true }`), **nunca lanza**. Bug histórico: un emoji en un header
HTTP rompía todas las alertas.

## Automatizaciones (crons)

Fuente de verdad: [`src/data/automatizaciones.ts`](../../src/data/automatizaciones.ts),
publicado en `/automatizaciones`. Todos los crons son `GET /api/cron/<nombre>`
con `Authorization: Bearer CRON_SECRET` (comparación `timingSafeEqual`),
fail-open, y anotan su corrida en `cron_runs` mediante `conRegistro`.

Dos orígenes: **Vercel Cron** (`vercel.json`, plan Hobby = como mucho diario) y
**cron-job.org** (los frecuentes). Horarios de Vercel en UTC.

| Cron | Origen | Cuándo | Qué hace | Si deja de correr |
|---|---|---|---|---|
| `backup` | Vercel | 03:00 | Copia de las tablas de negocio a JSON en Blob | La copia restaurable envejece |
| `portal-demo-reseed` | Vercel | 04:00 | Repuebla la base demo | La demo acumula basura de visitantes |
| `monitor-rollup` | Vercel | 05:00 | Una fila diaria por monitor | El historial se vuelve caro de leer |
| `computo-rollup` | Vercel | 06:00 | Consolida cómputo de clientes y avisa de la cuota | Avisos de cuota tardíos |
| `uptime-check` | Vercel | 07:00 | Sondeo + SSL + incidentes + purga | Una caída no abre incidente |
| `domain-check` | Vercel | 08:00 | Vencimiento de dominios (RDAP), sin repetir aviso | Un dominio vence sin aviso |
| `indexnow` | Vercel | 08:30 | Reenvía el sitemap a IndexNow | Indexación más lenta |
| `invoices-overdue` | Vercel | 09:00 | Marca facturas vencidas y notifica | Facturas vencidas "al día" |
| `analista-matutino` | Vercel | 11:30 | Analista de IA revisa 24 h de seguridad y avisa al celular | La noche queda sin resumen |
| `resumen-semanal` | Vercel | lunes 12:00 | Resumen semanal redactado por IA | La semana no se resume |
| `uptime-check` | cron-job.org | ~5 min | El mismo sondeo, a la frecuencia real | Resolución de 1 medición/día |
| `security-rollup` | cron-job.org | ~15 min | Rollup, anomalías, auto-block | Anomalías sin base de comparación |
| `sena-recordatorio` | cron-job.org | 12:00 | Recordatorio de la calculadora de etapa productiva | Se pierde el recordatorio |
| `marketing-envio` | cron-job.org | 60 min | Envía correos en cola dentro del horario legal y el cupo diario | La campaña queda a medias (**pendiente de dar de alta**) |
| `ep-agenda` | cron-job.org | cada minuto, consulta ~10 min | Vigía de la agenda del instructor (Bookings): avisa cuando aparece una cita libre | Las citas libres pasan sin aviso |

Además, `vigia` (Managed Agents) corre de noche y reporta por webhook; ver
[11](11-ia-y-agentes.md#vigía-nocturno-del-repositorio).

`tests/crons.test.ts` verifica que todo cron declarado en `vercel.json` existe y
está autenticado sin desplegar (RNF-28).

### Detector de silencio (RF-408)

[`src/lib/cron-silencio.ts`](../../src/lib/cron-silencio.ts): interruptor de
hombre muerto sobre `cron_runs`. Cada cron tiene una tolerancia; si no hay
corrida dentro de ella, avisa (deduplicado y con throttling). Nació del segundo
corte de crons del 7 sep 2026: los jobs de cron-job.org apuntaban a
`codebymike.tech`, que murió, y nadie se enteró. La exención de `/api` del
redirect protege del 308, no de que el dominio desaparezca.

`cron-largos.ts` lee la última corrida de los crons de más de un día sin leer
toda la bitácora. `/automatizaciones` lee la bitácora en ventana de 48 h (con
150 filas fijas, siete crons salían "sin registro").

### Automatismos disparados por el tráfico

Apertura/cierre de incidentes, bloqueo automático de abuso, detección de
anomalías, modo respaldo del portal, reversión post-despliegue (CI), purga de
retención. Documentados en el mismo catálogo.

## Backups

[`src/lib/backup.ts`](../../src/lib/backup.ts): vuelca las tablas de negocio a
un JSON en Vercel Blob (diario + manual en `/admin/backup`). Restauración con
`scripts/restore-backup.mjs`.

## Resumen semanal (RF-409)

Los lunes, `resumen-semanal` junta las cifras de la semana (uptime, seguridad,
cobros, crons…), una IA las redacta y el titular llega al celular; se guarda en
`app_settings` y se lee en `/admin/semana`. Si la IA no está disponible, se arma
sin IA.

## Prueba de vida pública

- `/status`, `/engineering`, `/automatizaciones`, `/lab`, `/docs/pipeline-en-vivo`.
- `/api/health`, `/api/now`, `/api/engineering/live` (cuidado: `/api/now` ya
  agotó la cuota de Turso una vez por agregar 30 días de checks).
