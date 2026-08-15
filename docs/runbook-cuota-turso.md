# Runbook: cuota de lecturas de Turso agotada (`BLOCKED`)

Estado: incidente de agosto 2026. Causa corregida en código; procedimiento de
recuperación verificado contra bases libSQL desechables.

## Qué pasó

`/api/now.ts` calculaba el error budget con `count(*)` y `sum(ok)` sobre
`monitor_checks` en una ventana de **30 días**. Turso factura **filas leídas**,
no consultas: con ~10 monitores sondeados cada 5 minutos, esa agregación leía
unas **86.000 filas por llamada** aunque devolviera un único número.

El endpoint alimenta la card "Ahora" del index. Con `s-maxage=60`, el CDN
revalida una vez por minuto **y por región**, así que el consumo de base no
dependía de las visitas: ~124 millones de filas al día en reposo.

Contribuían además:

- `/api/engineering/live.ts` con `Cache-Control: no-store` y dos `count(*)` de
  24 h (`monitor_checks` y `web_vitals`) en cada apertura de card.
- `/status` con un poll de 30 s que seguía corriendo con la pestaña oculta.
- `/docs/pipeline-en-vivo` con un poll de **6 s** en una página pública.

Es la tercera vez que el mismo patrón agota la cuota (jul 2026: faltaban
índices; ago 2026: `/status` agregaba el crudo). Ver los comentarios de
`monitor_checks` y `monitor_daily` en `src/db/schema.ts`.

## La regla que lo evita

> Ninguna página o endpoint público agrega `monitor_checks`, `security_events`
> ni `web_vitals` sobre ventanas de más de 24 h. Para eso están las tablas de
> resumen (`monitor_daily`). Si un agregado nuevo necesita una ventana larga,
> primero se le hace su rollup.

Un `count(*)` que devuelve una fila puede haber leído cien mil. El coste está en
las filas **escaneadas**, no en las devueltas, y no se ve en el tiempo de
respuesta porque SQLite las recorre rápido.

## Cambios aplicados

| Archivo | Cambio |
|---|---|
| `src/pages/api/now.ts` | Error budget sale de `monitor_daily` (~300 filas) en vez de `monitor_checks` (~86.000) |
| `src/pages/api/engineering/live.ts` | Conteo de sondeos desde `monitor_daily`; conteo de `web_vitals` con tope (`500+`); `no-store` → `s-maxage=30` |
| `src/pages/status.astro` | El poll se detiene con la pestaña oculta |
| `src/pages/docs/pipeline-en-vivo.astro` | Poll 6 s → 15 s y se detiene con la pestaña oculta |

Medido tras el cambio: la consulta de `/api/now` lee **62 filas** con 2
monitores (~300 con 10), frente a ~86.000.

## Plan elegido: aguantar hasta el corte del ciclo

La cuota se reinicia al empezar el mes. Si la sustentación es después de esa
fecha, no hay que mudar nada: la base se desbloquea sola y el sitio vuelve a la
normalidad. Lo único que hay que resolver es que las páginas públicas no se vean
vacías entre tanto, y eso es RNF-27.

**La capa de respaldo se apaga sola.** No hay bandera que activar hoy ni
desactivar el día 1: `crearRastreador().q()` intenta siempre la base primero y
solo usa el reemplazo cuando la consulta lanza. En cuanto Turso vuelve a
responder, el reemplazo deja de ejecutarse. No hay nada que revertir.

Qué sirve cada página mientras dure el bloqueo:

| Página | Con la base caída |
|---|---|
| `/` | Los proyectos reales desde `src/data/instantanea.json` |
| `/status` | Estado y latencia **medidos en el momento**, sondeando los endpoints |
| `/engineering`, `/certifications`, `/security` | Su contenido; los datos de base se omiten (RNF-26) |

Para enriquecer la instantánea con los datos curados a mano (título en inglés,
descripción reescrita, captura de pantalla), que están en la base y no en
GitHub, hace falta el último backup:

```bash
# La URL sale del listado de Blob del proyecto en Vercel, o de /admin/backup
node --experimental-strip-types scripts/capturar-instantanea.mjs \
  --backup='https://<blob>.public.blob.vercel-storage.com/backups/portfolio-....json'

# Y cuando la base vuelva a responder, para dejar la instantánea al día:
node --experimental-strip-types scripts/capturar-instantanea.mjs --desde-db
```

Conviene volver a capturarla con `--desde-db` cada cierto tiempo una vez
restablecido el servicio: es el respaldo del próximo incidente.

## Recuperación alterna: mudar a una base nueva

La cuota de Turso es **mensual y por organización**, no por base: crear otra
base dentro de la misma cuenta sigue dando `BLOCKED`. Las salidas son esperar
al corte del ciclo (visible en el dashboard), subir de plan, o una organización
nueva.

Requisito previo: `ENCRYPTION_KEY` debe ser **la misma** en el destino, o los
secretos de la bóveda (`project_services.secrets`, AES-256-GCM) quedan
indescifrables. El backup los guarda ya cifrados.

```bash
source ~/.nvm/nvm.sh && nvm use 22

# 1. Esquema en la base nueva
export TURSO_DATABASE_URL='libsql://<nueva>.turso.io'
export TURSO_AUTH_TOKEN='<token>'
npx drizzle-kit migrate

# 2. Tablas de negocio, desde el último backup en Vercel Blob
#    (la URL está en /admin, o en el listado de Blob del proyecto)
node --experimental-strip-types scripts/restore-backup.mjs \
  --origen='https://<blob>.public.blob.vercel-storage.com/backups/portfolio-YYYY-MM-DD-....json' \
  --destino="$TURSO_DATABASE_URL" --token="$TURSO_AUTH_TOKEN" --dry-run

#    Sin --dry-run cuando el recuento cuadre. Se niega a escribir sobre tablas
#    que ya tienen filas, salvo --forzar.

# 3. Historial de monitoreo (sintético: no está en el backup)
node --experimental-strip-types scripts/seed-monitor-history.mjs --prod --dry-run
node --experimental-strip-types scripts/seed-monitor-history.mjs --prod

# 4. Variables de entorno del proyecto de Vercel que sirve el dominio.
#    OJO: es `dev-portfolio`, no `portfolio`. Confirmar con:
#    cat .vercel/project.json
```

## Qué se recupera y qué no

| Datos | Origen |
|---|---|
| Clientes, proyectos, finanzas, mensajes, servicios, ADRs, briefings | Backup en Vercel Blob, íntegros |
| Historial de uptime, latencia, SLO, incidentes | Regenerado por `seed-monitor-history.mjs` |
| `security_events` | No se restaura; se repuebla solo con el tráfico real |
| Sesiones de admin y portal | Efímeras por diseño; se rehacen al entrar |

## Sobre el historial sintético

`scripts/seed-monitor-history.mjs` no escribe los resúmenes a mano: genera
sondeos en memoria y los pasa por `aggregateChecks` del módulo real de rollup,
así que el histograma queda con los mismos cubos que escribe el cron en
producción.

Siembra 90 días de `monitor_daily` (~900 filas) pero solo 2 días de
`monitor_checks` (~5.700), porque lo único que lee el crudo es la mini-gráfica
EKG, que pide 40 puntos por monitor. Sembrar 90 días de crudo serían 260.000
filas escritas para alimentar 40 puntos: el mismo error de volumen que causó
el incidente.

El azar es determinista, derivado de `(monitor, instante)`. Dos corridas
producen cifras idénticas: un p95 que cambia entre ejecuciones delata el dato
inventado. Por la misma razón el perfil de latencia **no** se lee de
`monitors.last_response_ms`, columna que el propio script escribe al terminar
(realimentarse de ella hacía derivar el p95 de 210 a 1407 ms entre pasadas).

Los datos son declaradamente sintéticos. Si se presentan en una sustentación,
esa es la palabra que hay que usar: la máquina de SLO, el rollup y los
histogramas son reales y verificables; las mediciones que los alimentan, para
el periodo anterior a la mudanza, no.
