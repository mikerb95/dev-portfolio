# Automatizaciones: publicar lo que corre solo, y anotar que corrió

Estado: **implementado** (1 sep 2026). Pendientes de alta declarados en §6.

Este proyecto hace tres cosas sin que nadie las pida: seis workflows de GitHub
Actions, nueve endpoints de tarea programada y media docena de automatismos que
dispara el propio tráfico. Ninguna de las tres categorías estaba publicada, y
lo peor: **la ejecución de un cron no dejaba rastro**, solo su efecto.

---

## 1. El problema que lo motiva

Un cron que deja de dispararse **no produce un error**. Produce silencio, y el
silencio no se nota. Los sondeos de monitores del sitio se cortaron tres semanas
de 2026 y el hueco apareció mirando el historial semanas después, no por una
alerta. El backup, antes, pasó un mes sin escribir un solo archivo: la ruta
existía y Vercel pintaba el cron en verde porque el `302` del gate de sesión es
una respuesta perfectamente válida (eso lo cerró `RNF-28` con
`tests/crons.test.ts`).

Las dos mitades de la respuesta:

- **Anotar cada ejecución** (`cron_runs`), para que la ausencia sea visible.
- **Publicar el calendario** (`/automatizaciones`), para poder mirarlo sin
  entrar al panel ni al dashboard de Vercel.

## 2. La página

`/automatizaciones` es **pública**, con el mismo criterio OPSEC de `/status` y
`/security`: se describe **qué** hace cada automatismo y **qué se pierde** si
deja de correr, nunca umbrales de bloqueo, rutas señuelo ni nombres de reglas de
detección.

Tres secciones, tres fuentes:

| Sección | Catálogo | Estado vivo |
|---|---|---|
| Workflows | `WORKFLOWS` | API de GitHub Actions |
| Tareas programadas | `CRONS` | tabla `cron_runs` |
| Automatismos del producto | `AUTOMATISMOS` | ninguno: son continuos |

El catálogo entero vive en `src/data/automatizaciones.ts`. La página **no
escribe a mano ni un horario ni un nombre de workflow** (RNF-14), igual que
`/docs`.

### 2.1 Una petición, no seis

Se piden las últimas 40 corridas de `main` en **una** llamada y se reduce en
memoria a la más reciente de cada nombre. Preguntar el último run workflow por
workflow serían seis peticiones contra la cuota anónima de 60/hora de la API de
GitHub, y esta página la puede abrir cualquiera: bastarían diez visitantes por
hora para dejarla ciega.

### 2.2 Fail-open, por separado

Si GitHub no responde (cuota, caída) o la base no contesta, esa sección se pinta
con lo que hay y **declara** que no se pudo leer; la otra sigue completa. Una
página de observabilidad que devuelve 500 cuando lo observado falla no sirve
para nada, que es justo cuando más se la mira.

## 3. La bitácora (`cron_runs`)

```
job          último segmento de la ruta: backup, uptime-check…
ok           si el handler terminó bien
duration_ms  cuánto tardó
detail       resumen corto (o el mensaje de error), recortado a 300 caracteres
created_at   índice: la consulta pide las últimas N por fecha
```

`conRegistro(job, handler)` en `src/lib/cron-runs.ts` envuelve los nueve
endpoints. Cuatro decisiones que no son obvias:

1. **Fail-open.** Si el insert falla (base caída, cuota agotada), el cron
   devuelve lo que iba a devolver. Un registro que puede tumbar la tarea que
   observa es una superficie de fallo nueva, no observabilidad.
2. **Se `await`ea**, al contrario que `recordSecurityEvent`. Aquí no hay un
   usuario esperando la respuesta, y la función serverless puede morir después
   del `return`: el fire-and-forget perdería justo las filas de los crons que
   peor terminan.
3. **Los `401`/`403` no se registran.** `/api/cron/*` es público y recibe
   escaneo constante; anotar los rechazos llenaría la tabla de ruido y
   enterraría lo único que se quiere ver, que es el calendario real. Solo cuenta
   lo que pasó la puerta.
4. **El detalle nunca lleva cuerpos ni secretos**, y se recorta. Esa tabla la
   lee una página pública.

El índice por `created_at` no es cosmético: Turso factura filas **escaneadas**,
no devueltas (RNF-25), así que la consulta pide las últimas N y reduce a "última
de cada job" en memoria, en vez de agrupar sobre la tabla entera.

## 4. La puerta, en un solo sitio

La comprobación del `CRON_SECRET` estaba copiada en los nueve handlers. Ahora
vive en `cronSecretOk` (`src/lib/cron-auth.ts`): `timingSafeEqual` sobre
longitudes iguales, rechazo si no hay secreto en el entorno, y ningún `throw`
con un header de cualquier longitud. `tests/crons.test.ts` la prueba una vez y
vale para los nueve, además de seguir recorriendo `vercel.json` para exigir que
cada ruta declarada exista, exporte `GET`, compruebe el secreto y no cuelgue del
gate de `/api/admin` (RNF-28).

## 5. Vercel Hobby y cron-job.org

El plan Hobby permite **una ejecución diaria por cron**. Todo lo que necesita
más frecuencia (el sondeo de uptime cada ~5 min, el rollup de seguridad cada
~15) se dispara desde **cron-job.org** contra el mismo endpoint y con el mismo
secreto. Por eso `uptime-check` aparece dos veces en el catálogo: mismo
endpoint, dos disparadores y dos frecuencias, y el diario de Vercel es la red de
seguridad si el externo cae.

## 6. Pendiente

- [ ] `/automatizaciones` en `STATIC_PATHS` de `src/pages/sitemap.xml.ts`. Es
      contenido propio y estable, no una utilidad: cumple el criterio de
      inclusión, solo falta darla de alta.
- [ ] Cascarón `src/pages/en/automatizaciones.astro` y alta en
      `TRANSLATED_ROUTES`. El texto ya sale del diccionario, pero mientras la
      ruta no esté declarada no debe anunciarse en inglés (publicaría un 404).
- [ ] Aviso cuando un cron **falta**: hoy se ve su última corrida, pero nadie
      avisa si lleva dos días sin aparecer. Es el paso natural sobre la misma
      tabla, con `ntfy` y el umbral por job derivado de su propio horario.

## 7. Archivos

```
src/data/automatizaciones.ts    catálogo: WORKFLOWS, CRONS, AUTOMATISMOS
src/lib/cron-runs.ts            registrarCronRun, conRegistro
src/lib/cron-auth.ts            cronSecretOk
src/pages/automatizaciones.astro
src/pages/api/cron/*.ts         los nueve, envueltos
tests/crons.test.ts             vercel.json + cronSecretOk
```

Requisitos: **RF-019** (página), **RF-407** (bitácora), **RNF-28** (crons
verificables sin desplegar), **CU-20**. Iteración: Fase 43 en
`src/data/iteraciones-portfolio.ts`.
