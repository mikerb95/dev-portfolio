# Automatizaciones: publicar lo que corre solo, y anotar que corrió

Estado: **implementado** (1 sep 2026). Pendientes de alta declarados en §6.
Rediseño con motion y corrección de la ventana de la bitácora: §9 (28 sep 2026).

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

- [x] `/automatizaciones` en `STATIC_PATHS` de `src/pages/sitemap.xml.ts`
      (14 sep 2026). De paso entró `/paginas-web`, que existía en los dos
      idiomas desde hacía semanas y tampoco estaba anunciada. `/log` sigue
      fuera **a propósito**, y el motivo quedó escrito en el propio archivo.
- [x] Cascarón `src/pages/en/automatizaciones.astro` y alta en
      `TRANSLATED_ROUTES` (14 sep 2026). **El plan se equivocaba al decir que
      "el texto ya sale del diccionario"**: la página tenía todo el texto
      incrustado y el catálogo estaba solo en español, así que declarar la ruta
      sin más habría publicado una página inglesa escrita en español. La
      traducción fueron dos frentes:

      - El **chrome** de la página (título, entradilla, encabezados, cabeceras
        de tabla, etiquetas de disparador y los relativos "hace N min") pasó al
        diccionario, bloque `automatizaciones` de `src/i18n/{es,en}.ts`.
      - El **catálogo** (`src/data/automatizaciones.ts`) pasó a campos
        `Bilingual` con `tx()`, el mismo mecanismo de los módulos de `/docs`, y
        no a un archivo gemelo en inglés: aquí nace una entrada cada vez que
        nace una automatización, y dos archivos se separarían en semanas.
        Siguen SIN traducir los campos que además son identificadores -el
        nombre del workflow tal como aparece en Actions, el nombre del job y el
        del archivo-, porque son la clave con la que se cruza contra la API de
        GitHub y contra `cron_runs`; traducirlos rompería el cruce en silencio.

      Dos cosas que salieron al hacerlo: la entradilla escribía "seis" y "diez"
      a mano, contra RNF-14, y ahora se cuentan del catálogo (los crons por job
      distinto, porque `uptime-check` figura dos veces por tener dos
      disparadores); y `tests/cron-silencio.test.ts`, que cruza el horario
      publicado contra `cadaMin`, ahora lee el horario con `tx(..., 'es')` en
      vez de tratarlo como string suelto.
- [x] Aviso cuando un cron **falta**. Entregado el 7 sep 2026, tal como estaba
      previsto aquí: mismo umbral derivado del horario de cada job, mismo `ntfy`,
      misma tabla. Lo empujó el incidente descrito en la sección 7.

## 7. El detector de silencio (7 sep 2026)

La bitácora resolvió la mitad del problema: hizo visible el calendario real.
Seguía faltando la otra, que es que alguien lo mirara. Un cron que se cae no
falla, **desaparece**, y desaparecer no dispara nada.

Lo forzó un caso concreto. Al vencer `codebymike.tech`, su registrador retiró los
NS del dominio; los dos jobs de cron-job.org seguían apuntando ahí y empezaron a
fallar por DNS, hasta que el scheduler los deshabilitó solo. A las 05:00 UTC el
sitio se quedó sin sondeos cada 5 min y sin micro-SIEM, y ni el panel ni el
correo ni ntfy dijeron nada: todo lo que quedaba vivo seguía respondiendo 200.
El hueco se vio consultando `cron_runs` a mano.

Cómo funciona:

- **La cadencia se declara donde ya se publica.** `CRONS` gana un campo
  `cadaMin` junto al `horario` que pinta la página. Una sola fuente: el horario
  que se muestra y el que se vigila no pueden divergir.
- **La decisión es pura** (`src/lib/cron-silencio.ts`), sin BD ni reloj propio,
  porque "esto lleva demasiado callado" es exactamente lo que hay que poder
  probar con un reloj de mentira.
- **Tolerancia = triple del intervalo, con tope de 12 h extra.** El triple
  aguanta dos ejecuciones perdidas seguidas (un despliegue a medias, el jitter
  del scheduler) y salta a la tercera; el tope evita que un diario espere tres
  días antes de abrir la boca (avisa a las 36 h).
- **Con dos disparadores, manda el más estricto.** `uptime-check` es diario en
  Vercel y cada 5 min en cron-job.org. Vigilar el laxo habría dejado pasar
  justamente el incidente que motivó esto: el rápido muerto y el diario tapando
  el hueco.
- **El vigilante viaja dentro de `uptime-check`**, y no en un cron propio, por
  esa misma razón al revés: es el único endpoint con dos disparadores
  independientes, así que si uno cae el otro lo sigue trayendo. Un detector de
  silencio que solo corre cuando todo va bien no detecta nada.
- **Una revisión por hora como mucho**, con la marca guardada en `app_settings`.
  El endpoint entra cada 5 min; sin la guarda serían 288 lecturas diarias de un
  rango de la bitácora para responder casi siempre lo mismo, y en Turso se
  factura lo escaneado. El precio es hasta 60 min de retraso sobre la
  tolerancia, y por eso el aviso dice *desde cuándo* está callado.
- **Un aviso por episodio**, repetido cada 24 h mientras dure. Un job que se
  recupera se borra del estado, así que una recaída avisa enseguida en vez de
  quedar tapada por la marca vieja: la misma idea que el dedup de SSL.
- **Fail-open**, como todo lo demás: si el vigilante revienta, devuelve lista
  vacía y el sondeo sigue.

Lo que la página muestra sale de la misma función (`toleranciaMin`), no de una
copia del criterio: si divergieran, la tabla diría que todo va bien mientras el
push dice lo contrario, y se cree siempre a la que se está mirando.

**Hallazgo de paso, y su cierre.** El detector señaló `sena-recordatorio` antes
incluso de estar desplegado: figuraba en el catálogo como diario desde
cron-job.org, pero no estaba en `vercel.json`, no existía como job allí, y no
tenía una sola fila en `cron_runs`. Nunca se había dado de alta. No había fallado
nada todavía porque hay 0 suscripciones activas: el fallo estaba armado para el
día que se creara la primera, y habría sido silencioso (el panel diciendo
"activa", el correo sin llegar nunca).

Se dio de alta el 7 sep, diario a las 07:00 America/Bogota (12:00 UTC, sin choque
con los crons de Vercel), clonando `security-rollup` para que el header
`Authorization` fuera el mismo valor ya probado en vez de volver a escribirlo.
Sirve como estreno del detector: el primer silencio que encontró no fue una
avería, fue una automatización que llevaba meses anunciada y nunca conectada.

## 9. Motion y la ventana de 48 h (28 sep 2026)

**El bug que destapó.** La tabla leía las últimas 150 filas de `cron_runs`.
Con el sondeo cada 5 min y el agregado cada 15 entran ~16 filas por hora, así
que la ventana real era de unas 9 h: en producción, 7 de las 11 tareas salían
"sin registro" aunque corrían todos los días, justo en la página que promete
"el último resultado real". Ahora se lee un **rango de 48 h** sobre el índice
de fecha (techo de 1400 filas). 48 h cubren la tolerancia más larga (36 h de un
diario), así que la tabla ya puede acusar un silencio de verdad; si el techo
cortara la consulta, la ventana efectiva se mide y nadie se acusa sin historia
suficiente (`estadoFila`). Coste: ~800 filas por render, cacheadas 5 min en la
CDN, la misma magnitud que la cinta de la portada con 24 h.

**Las piezas** (RF-029):

- **Partitura** (hero). Un renglón por job, una marca por corrida real de las
  últimas 24 h, la hora declarada como raya punteada y cada silencio mayor a
  lo tolerado como tramo teñido con su duración. Modelo puro en
  `src/lib/motion/partitura.ts`, compartido por el servidor (pinta el SVG en
  reposo) y el navegador.
- **Simulacro de corte.** Reproduce el 7 sep sobre los datos del día: se
  callan los disparadores de cron-job.org, siguen los de Vercel a su hora, y
  el aviso sale cuando el vigilante real saldría. No hay lógica copiada:
  `simularCorte` llama a `tocaChequear`, `jobsEnSilencio`, `decidirAvisos` y
  `describirSilencio` de `cron-silencio.ts`, y respeta que `conRegistro`
  anota la corrida del vigilante DESPUÉS de revisar.
- **Selector de eventos de CI.** Push, pull request, domingo y a mano; cada uno
  despierta los workflows que lo declaran en `disparadores`. CI muestra sus
  tres jobs (`etapas` en el catálogo, espejo de `ci.yml`), con la verificación
  que solo corre en push a main.
- **Tabla** con medidor de silencio consumido (raya en el intervalo declarado,
  final en la tolerancia) que sigue contando con el reloj de quien mira.
- **Escenas** ilustrativas de los seis automatismos (`id` en el catálogo).

**Lo que el simulacro enseña sin adornar.** El vigilante vive dentro de
`uptime-check` porque es el único endpoint con dos disparadores. Si muere el
rápido, lo despierta el diario de las 07:00 UTC: un corte a las 23:30 se avisa
~7,5 h después, y uno a las 06:58 al día siguiente (la revisión horaria de las
07:00 no toca porque la anterior es de hace dos minutos). Es el comportamiento
real, no un fallo de la animación; si algún día molesta, la mejora es darle al
vigilante un segundo disparador independiente, no retocar la página.

## 8. Archivos

```
src/data/automatizaciones.ts    catálogo: WORKFLOWS, CRONS, AUTOMATISMOS, cadaMin
src/lib/cron-runs.ts            registrarCronRun, conRegistro, silenciosPorAvisar
src/lib/cron-silencio.ts        decisión pura: tolerancia, dedup, throttling
src/lib/cron-auth.ts            cronSecretOk
src/pages/automatizaciones.astro
src/components/automatizaciones/  Partitura, DisparadoresCI, EscenaAutomatismo
src/lib/motion/partitura.ts     modelo puro de la partitura y del simulacro
src/lib/motion/disparos.ts      evento de CI -> workflows
src/lib/motion/{partitura-viva,automatizaciones,automatizaciones-escenas}.ts
tests/motion-automatizaciones.test.ts
src/pages/api/cron/*.ts         los nueve, envueltos
tests/crons.test.ts             vercel.json + cronSecretOk
tests/cron-silencio.test.ts     tolerancia, avisos, catálogo vs. endpoints
```

Requisitos: **RF-019** (página), **RF-029** (motion), **RF-407** (bitácora), **RF-408** (aviso de
cron en silencio), **RNF-28** (crons verificables sin desplegar), **CU-20**. Iteración: Fase 43 en
`src/data/iteraciones-portfolio.ts`.
