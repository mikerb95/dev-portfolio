# Pendientes - CodeByMike

> Estado al **29 jul 2026**. Este archivo es el inventario vivo de lo que falta:
> acciones manuales (variables de entorno, altas en servicios externos,
> verificaciones en producción) y trabajo de código todavía sin hacer. Lo ya
> resuelto se resume al final, sin detalle, para no confundir historia con
> pendientes.
>
> Los planes de cada módulo viven en `docs/plan-*.md` y se actualizan al
> implementar. El roadmap general está en `docs/plan-roadmap-2026-07.md`.

---

## 1. Variables de entorno faltantes en producción

Estado real de `dev-portfolio` (proyecto de Vercel que sirve `codebymike.net`)
consultado el 24 jul 2026. **Todo lo que falta degrada en silencio** - ese es el
diseño, pero conviene saber qué está apagado:

| Variable | Qué pasa sin ella | Prioridad |
|---|---|---|
| `SECURITY_IP_SALT` | Los eventos del micro-SIEM guardan el hash de la IP sin salt: sigue sin haber IPs en claro, pero el hash es reversible por diccionario (hay ~4.300 millones de IPv4). | Media |
| `RESEND_API_KEY` + `ALERT_EMAIL_TO` | Las alertas solo salen por ntfy, sin canal de email de respaldo. | Baja |
| `PSI_API_KEY` | El analizador de sitios (`/lab/site-check`) pierde los datos de PageSpeed Insights. | Baja |

Ya están puestas y verificadas: `ENCRYPTION_KEY`, `CRON_SECRET`, `NTFY_TOPIC`,
`LAB_INGEST_TOKEN`, `COBRO_HISTORY_SECRET`, las tres de Wompi, las de GitHub
OAuth y las de Turso.

### ✅ Demo pública encendida (29 jul 2026)

`TURSO_DEMO_URL` y `TURSO_DEMO_AUTH_TOKEN` subidas a **Production y Preview**
(Preview a propósito: permite ver la demo en una URL de preview antes de que
toque el dominio). La base demo ya existía; se re-sembró porque su historial
moría el 17 jul - con 12 días de retraso las gráficas de monitores se veían
muertas. Ahora: 51 tablas (migraciones al día), 90 días de historial que
terminan hoy, 4 clientes/proyectos/monitores ficticios.

Al re-sembrar apareció un bug real en `scripts/seed-demo.mjs`: `resetSchema()`
apagaba las FK con `pragma foreign_keys = off` en un `execute` suelto, pero
contra Turso por HTTP cada `execute` viaja en su propia sesión, así que el
pragma se perdía y los `drop table` fallaban por FOREIGN KEY. Arreglado con
`executeMultiple` (una sola conexión, sin transacción implícita - dentro de una
transacción SQLite ignora ese pragma). Verificado en los dos backends: Turso y
base de archivo, dos corridas seguidas.

- [ ] Verificar tras el próximo build: `/demo` responde 200 (hoy 404), el POST
      deja la cookie `demo_session` y redirige a `/admin` con datos ficticios, y
      el revelador de secretos (`…/secrets`) da 403 aunque sea GET.
      `demoAvailable` se evalúa al cargar `src/db/index.ts`, así que la demo
      aparece con el build, no al guardar la variable.

- [ ] Limpieza opcional: `DEV_USER` y `DEV_PASSWORD` siguen en Vercel (Preview y
      Production) desde antes de que el login pasara a GitHub OAuth. Ya no las
      lee nadie.

## 2. Acciones manuales fuera del repo

### 🔴 SEO tras dar de baja `codebymike.tech` (decidido: no se renueva)

El `.tech` vencía el 6 sep 2026 23:59:59 UTC (registrador **Namify**) y se deja
caer. El 308 sigue respondiendo mientras el registrador mantenga el DNS, y esa
ventana es todo lo que hay para traspasar autoridad: sin dominio viejo vivo no
existe mecanismo de traspaso, y los backlinks externos apuntan a la nada.

Prioridad, de más a menos urgente:

- [ ] **Search Console, mientras el 308 siga vivo.** Verificar propiedad de
      `codebymike.net` (propiedad de DOMINIO, verificación por TXT en el DNS de
      Vercel, que cubre www y subdominios) y, si `codebymike.tech` sigue
      verificado, usar *Cambio de dirección* desde su propiedad. Es lo único
      que le dice a Google explícitamente que el sitio se mudó.
- [ ] Enviar `https://codebymike.net/sitemap.xml` y pedir indexación manual de
      la portada, `/notes`, `/docs`, `/status`, `/tools`, `/paginas-web` y las
      notas con tráfico.
- [ ] **Bing Webmaster Tools**: alta de `codebymike.net` (se puede importar la
      configuración desde GSC). IndexNow no necesita nada: el cron diario ya
      manda el sitemap del dominio nuevo y el archivo de clave responde 200.
- [ ] **Recuperar backlinks a mano**, que es lo que sustituye al 301 perdido.
      Cada sitio de terceros que enlace al `.tech` hay que editarlo: perfil de
      LinkedIn, cross-posts en dev.to / Hashnode / Medium (su `canonical_url`
      apunta al `.tech`, ver `instrucciones-redes.md`), firmas, directorios,
      material de Platzi. El campo *blog* del perfil de GitHub hoy tiene un
      correo, no la web: es un enlace gratis que conviene aprovechar.
      Ya hecho: `homepage` del repo `dev-portfolio` en GitHub → `.net`.
- [ ] Vigilar cobertura e impresiones en GSC las primeras semanas. Un desplome
      sostenido tras la baja del `.tech` es esperable; lo que hay que detectar
      es que el `.net` no suba.
- [ ] Cuando el `.tech` deje de resolver, quitarlo del proyecto en Vercel y de
      `HOSTS_A_REDIRIGIR` (`src/lib/canonical-host.ts`), junto con su fila en
      `project_services` (id 5). Mientras responda, se deja: cada 308 servido
      es un enlace viejo que todavía funciona.
- [ ] Si alguien registra el `.tech` después, no hay acción técnica: solo dejar
      de referenciarlo en cualquier material propio.

### Resto del cambio de dominio

- [ ] **Callback de GitHub OAuth** → `https://codebymike.net/api/auth/callback/github`
      (y *Homepage URL* → `https://codebymike.net`). No se puede verificar desde
      fuera: GitHub difiere la validación del `redirect_uri` hasta después del
      login, así que la comprobación es entrar a `/admin`.
- [ ] **Passkeys**: volver a registrarlas en `.net`. El `rpID` de WebAuthn es el
      host, así que el autenticador no ofrece las del `.tech`. La puerta de
      GitHub sigue funcionando mientras tanto.
- [x] **Repuntar los jobs de cron-job.org** a
      `https://codebymike.net/api/cron/*`. Dejó de ser opcional el 7 sep: al
      vencer el `.tech` su registrador retiró los NS (una consulta pública ya no
      devuelve ningún NS del dominio), los dos jobs empezaron a fallar por DNS y
      el scheduler los deshabilitó solo. La bitácora lo fecha: ni `uptime-check`
      ni `security-rollup` vuelven a aparecer en `cron_runs` después de las
      05:00 UTC del 7 sep (00:00 Bogotá), mientras los siete crons de
      `vercel.json` siguieron corriendo (esos van por la URL del despliegue, no
      por el dominio). Mientras siga así, el monitoreo baja de un sondeo cada
      5 min a uno diario y el micro-SIEM se queda sin auto-block por ráfaga, sin
      rollups, sin baseline y sin purga.

      Los dos jobs a editar, ambos `GET` con `Authorization: Bearer <CRON_SECRET>`:
      - `https://codebymike.net/api/cron/uptime-check` cada 5 min
      - `https://codebymike.net/api/cron/security-rollup` cada 15 min
        (`5,20,35,50 * * * *`)

      Los dos endpoints quedaron verificados contra `.net` con el secreto de
      producción el 7 sep: `200 {"ok":true,"monitors":9,"events":0}` y
      `200 {"ok":true,"candidates":1,...}`. El fallo estaba solo en la URL
      guardada en el scheduler, no en el sitio ni en `CRON_SECRET`.

      **Hecho el 7 sep**: las dos URLs repuntadas a `.net`, jobs habilitados de
      nuevo, header `Authorization` confirmado intacto en los dos (el valor
      guardado coincide con `CRON_SECRET`) y el método sigue en `GET` con zona
      America/Bogota. El scheduler ya muestra próxima ejecución para ambos.

- [x] **`sena-recordatorio` no estaba dado de alta en ninguna parte.** Lo
      destapó el detector de silencio antes incluso de estar desplegado: el
      catálogo lo declaraba diario desde cron-job.org, pero no existía como job
      allí (solo había dos), no estaba en `vercel.json` y no tenía ni una fila en
      `cron_runs`. Nunca corrió, y por eso ninguna de las 0 suscripciones activas
      había fallado todavía: el fallo estaba armado para el día que se creara la
      primera.

      **Resuelto el 7 sep**: job dado de alta en cron-job.org, diario a las 07:00
      America/Bogota (12:00 UTC, sin choque con los crons de Vercel, que caen
      entre las 03:00 y las 09:00 UTC). Se creó clonando `security-rollup`, así
      que el header `Authorization` es literalmente el mismo valor ya probado.
      Endpoint verificado antes de agendarlo: 401 sin cabecera y
      `200 {"ok":true,"suscripciones":0,"avisados":0}` con ella.
- [ ] Repuntar la URL de eventos de **Wompi** a `.net`. El mismo vencimiento se
      llevó la red de seguridad que hacía esto opcional (`/api` estaba exento del
      redirect para que un 308 no degradara un POST firmado): ahora un webhook
      que siga apuntando al `.tech` no llega a ninguna parte.
- [ ] **Search Console / Bing**: alta de `codebymike.net` y herramienta de
      *cambio de dirección* desde la propiedad `.tech` (depende de que el `.tech`
      siga vivo).
- [x] `mikerb95.vercel.app` servía una copia indexable del sitio: añadido a
      `HOSTS_A_REDIRIGIR`, redirige 308 desde el siguiente despliegue.
- [ ] Menor: ni `.net` ni `.tech` están en la lista de **HSTS preload**, pese a
      que la cabecera declara `preload`. Viene de antes del cambio de dominio.
- [ ] Ajeno al dominio, detectado de paso: `tests/present-pin.test.ts` está en
      rojo porque `present-tablet` no está en `RESERVED_ROOT_SEGMENTS`.

- [ ] **`VERCEL_TOKEN` en GitHub Secrets.** Es el único bloqueo real que queda en
      el LAB: sin él, el rollback automático solo avisa en vez de revertir, y la
      Fase 5 (load testing con k6) no tiene un target de preview estable contra
      el que correr.
- [x] **Cron `security-rollup` en cron-job.org** - `GET
      https://codebymike.net/api/cron/security-rollup` con header
      `Authorization: Bearer <CRON_SECRET>`, **cada 15 min** (`5,20,35,50 * * * *`).

      **Ya estaba dado de alta**: `cron_runs` lo registra corriendo cada 15 min
      desde que existe la bitácora (1 sep 2026), 521 ejecuciones sin un solo
      fallo, hasta que el vencimiento del `.tech` lo deshabilitó el 7 sep.
      Repuntarlo a `.net` es el punto de §2 de arriba, no un alta nueva.

      Se deja escrito por qué importa, que es lo que hace urgente ese repunte:
      es el único disparador de seis tareas del micro-SIEM (verificado por grep:
      nada más en el repo las ejecuta). Sin él quedan sin correr: el auto-block
      por **ráfaga** high/critical ≥ umbral, los rollups horarios/diarios que
      alimentan `/admin/security` y `/security`, la baseline sin la cual no hay
      detección de anomalías, las alertas push/email, y la purga (eventos > 90 d,
      buckets y bloqueos vencidos).

      Dos cosas que **no** se rompen, para no sobredimensionarlo: los honeypots
      sí se bloquean sin cron (inline en el middleware desde el 19 jul, que se
      añadió justo porque este cron nunca se dio de alta), y los TTL de bloqueo
      sí se respetan (`isBlocked` filtra por `gt(expiresAt, now)`) - la purga es
      higiene de tabla, no corrección funcional.

      Cada 15 min es seguro aunque los rollups sean horarios: `writeRollups`
      hace delete-then-insert por `(bucket, at)` sobre una hora ya cerrada
      (idempotente) y `persistAnomalies` solo devuelve las nuevas, así que no
      re-alerta. Ya no está en `vercel.json` (se removió por el límite de crons
      del plan), así que cron-job.org es el único disparador posible - y por eso
      un job deshabilitado allí apaga el micro-SIEM entero sin producir un solo
      error.

      Antes de agendarlo se puede probar el pipeline completo con el botón de
      disparo manual de `/admin/security` (el `PUT` del mismo endpoint, bajo
      sesión admin): si devuelve `{ok:true, anomalies:N}`, solo falta agendarlo.
- [ ] **3 reglas custom del WAF** en el dashboard de Vercel (detalle en
      `docs/plan-security-observability.md`, Fase 6).
- [ ] **Altas en Google Search Console y Bing Webmaster Tools.** La capa técnica
      de SEO (JSON-LD, sitemap, RSS, IndexNow, manifest, `hreflang`) está
      completa desde jul 2026; falta el alta manual que ningún código puede
      hacer. Incluye dar de alta también la versión en inglés.
- [ ] **App de ntfy en el celular** suscrita al topic. Las alertas se envían
      igual; sin suscripción no se ven.
- [x] Confirmar en el EDIT del job de uptime en cron-job.org que el header
      `Authorization` quedó guardado (si falta, el HISTORY muestra 401 en rojo).
      Quedó bien: 1570 ejecuciones anotadas en `cron_runs` entre el 1 y el 7 sep,
      todas HTTP 200. Al repuntar la URL hay que conservar ese header.

## 3. Verificaciones pendientes en producción

- [ ] Bóveda de credenciales: crear un servicio con secreto en
      `/admin/projects/[id]` y confirmar que cifra y revela correctamente.
- [ ] P&L: comprobar que un costo en COP suma bien al total en `/admin/costs`.
- [ ] Cobros de campo: hacer un cobro real de punta a punta (`/cobrar` → mensaje
      de WhatsApp → `/c/[code]` → pago → `/mis-pagos`).

## 4. Trabajo de código pendiente

### ✅ Portal en tiempo real - Fase A entregada (30 jul 2026)

El portal ya se actualiza solo. `src/lib/portal/live.ts` (digest sobre los
helpers existentes, cero SQL nuevo) + `GET /api/portal/live` (10/min por sesión,
`no-store`) + un único ciclo de 20 s en `PortalLayout` que emite
`CustomEvent('portal:live')`. Lo escuchan tres suscriptores compartiendo una
sola petición: campana, dashboard y hilo abierto. Pausa con la pestaña oculta,
backoff 20→300 s y fail-open silencioso. Detalle y decisiones en
`docs/plan-portal-tiempo-real.md`.

**Fase B entregada el 30 jul 2026**: migración `0024` aplicada a producción,
`recordActivity()` cableado en los 5 puntos que notifican, columna en `/portal`,
página `/portal/actividad` con filtro y paginación por cursor, `activityLastAt`
en el digest y `/admin/portal/actividad` para apagar entradas sin borrarlas.

- [ ] **Entradas de tipo `deploy`**: bloqueadas por el modelo - `ci_runs` no
      tiene `projectId` (es el CI de este repo, no el de los proyectos de
      clientes). Hace falta decidir entre añadir esa columna y que cada proyecto
      reporte su CI, o derivar "hay movimiento" de `monitors`, que sí lo tienen.
- [ ] **Documentos e incidentes en el feed**: no hay dónde cablearlos todavía
      porque ninguno de los dos notifica hoy (no existe endpoint de subida de
      documentos ni emisión de incidentes al cliente).
- [ ] e2e del anuncio en vivo (`aria-live`) - los specs nuevos de
      `e2e/portal.spec.ts` cubren el 401 y el digest sobre la base de demo, pero
      no se pudieron correr localmente (ver nota de puertos abajo).

> **Nota de entorno:** el e2e no corre en esta máquina por dos choques ajenos al
> código: el puerto 4331 (`playwright.config.ts`) lo ocupa un proceso del
> proyecto `github.com/eko`, y con `reuseExistingServer` Playwright lanza la
> suite contra ese servidor, que devuelve 404 a todo (fallan hasta los tests
> preexistentes). Además Astro no levanta un segundo `astro dev` si ya hay uno.
> Verificado a mano contra un dev server real: `/api/portal/live` → 401 sin
> sesión, `/portal` → 302, `/api/portal/health` → 200.

Los dos puntos de higiene del mismo plan ya están cubiertos:
- [x] Artículo en `/notes`: **"Dos logins en el mismo sitio, y ninguno conoce al
      otro"** (24 jul), sobre por qué el portal no reutiliza la auth del admin.
      Junto con "El clientId nunca viene de la URL" cubre las dos decisiones de
      diseño del portal que valía la pena contar.
- [x] **Monitor propio** (24 jul): endpoint público `/api/portal/health` que
      ejerce el join real de tres tablas del portal, más
      `scripts/register-portal-monitor.mjs` para darlo de alta. Ver el paso
      pendiente justo abajo.

### ✅ Alta del monitor del portal (24 jul 2026)

Dado de alta con `node scripts/register-portal-monitor.mjs` **después** de que
el endpoint estuviera desplegado - ese orden importa: al revés, el primer
chequeo habría dado 404 → caída → incidente y push a ntfy por un servicio sano.
Verificado que `https://codebymike.net/api/portal/health` responde 200 con el
`"ok":true` que el monitor espera.

Al hacerlo aparecieron **dos** monitores del portal: otra sesión ya había creado
uno apuntando a `/portal/login`. Se conservaron ambos con nombres distintos
porque cazan fallos distintos, y `/status` es público:

| id | Nombre | URL | Qué caza |
|---|---|---|---|
| 10 | `Portal (página de login)` | `/portal/login` | que esa página concreta renderice con su contenido |
| 11 | `Portal de clientes` | `/api/portal/health` | que la cadena de datos del portal funcione |

- [ ] Confirmar en `/status` que el id 11 pasa de `unknown` a verde tras el
      primer disparo del cron (~5 min).
- [x] Cifra de monitores sincronizada en `README.md`, `src/data/testing.ts`,
      `src/data/documentacion.ts` y `plan-testing-docs.md`. **Son 9 visibles**
      (10 filas menos el id 5, pausado).

### Monitor `ResidentialAccess` (id 5) - pausado, no borrado (24 jul 2026)

Llevaba en `down` desde el 20 jul con un incidente sin resolver. Comprobado a
mano: `https://residential-access.vercel.app` devuelve **HTTP 500**, así que el
monitor no daba un falso positivo - el servicio está realmente roto.

Se **pausó** (`paused=1`) en vez de borrarse: desaparece de `/status` (la página
filtra por monitor visible, así que su incidente abierto tampoco se muestra) y
conserva sus **6.447 chequeos y 6 incidentes** desde el 2 jul. El monitor está
atado al proyecto 5 del CRM, así que su historial es el registro de
disponibilidad de ese proyecto.

- [ ] Decidir el destino del proyecto: si se retoma, arreglar el 500 y despausar
      el monitor; si se archiva, borrar la fila (`delete from monitors where
      id=5`, que arrastra chequeos e incidentes por cascada).

### Versión en inglés - Fases 2 (resto) a 8

`/en` está en producción con la infraestructura completa (Fases 0 y 1) y 7
páginas de marca traducidas: `/`, `/engineering`, `/tools`, `/security`,
`/contact`, `/certifications` y `/architecture`. Falta el grueso del contenido,
detallado en `docs/plan-i18n-en.md`:

- **Resto de páginas de marca** (`/status`, `/log`, `/demo`, `/hola`,
  `/platziconf`, `/cv/descargar`, `/paginas-web`).
- **Contenido en BD** (Fase 3): columnas `_en` en `projects` y
  `education_milestones` con fallback al español. Migración aditiva, sin
  empezar.
- **Notas técnicas** (Fase 4): 14 artículos, 11 383 palabras. Es el activo de
  más valor internacional y el más caro; hoy `/en/rss.xml` es un canal vacío
  a propósito.
- **LAB y `/docs`** (Fases 5 y 6): incluyen refactor real -los textos de
  `src/lib/lab/findings.ts` deben pasar a claves de diccionario, no a frases.
- **Assets** (Fase 8): imágenes OG y CV en inglés sin generar.

> Regla operativa que salió de la corrección del 29 jul: traducir una página son
> **tres** pasos, no dos - texto al diccionario, cascarón en `src/pages/en/` y
> alta en `TRANSLATED_ROUTES`. Sin el tercero la página queda invisible; el
> tercero sin el segundo publica un 404 en el sitemap. `tests/i18n-routing.test.ts`
> cruza la lista contra los archivos reales para que no se separen.

- [ ] Alta de la propiedad en inglés en Search Console y Bing (ver §2).
- [ ] Artículo de `/notes` sobre el hallazgo de los guardas ciegos al prefijo
      (§14 del plan) - pendiente, con el riesgo de bypass como columna
      vertebral.

### Test lento en `tests/latency.test.ts`

`«supera el techo de 50 términos por compound SELECT de Turso»` siembra bastantes
filas en libSQL y tarda ~5 s, justo en el límite del `testTimeout` por defecto de
Vitest: falla de forma intermitente en `npm test` y pasa con
`--testTimeout=30000`. No es un fallo del código (la función se comporta bien),
pero un test que falla por reloj entrena a ignorar el rojo.

- [ ] Darle timeout explícito a ese test (o bajar el volumen sembrado).

### LAB - Fase 5: load testing con k6

Última fase del laboratorio. Bloqueada por `VERCEL_TOKEN` (ver arriba). Detalle
en `docs/plan-lab-fases-pendientes.md`.

### Panel de briefings - Fases 2 a 5

La Fase 1 (checklist de ítems, soft delete, timeline de actividad) se entregó el
6 jul. Faltan, en el orden de valor acordado en `docs/plan-briefings.md`:

- **Fase 3** - link público `/briefing/[token]` con aprobación firmada
  (nombre + email + timestamp), comentarios del cliente y versionado.
- **Fase 2** - kanban, filtros y prioridad en el panel.
- **Fase 4** - intake público y conversión de briefing a proyecto.
- **Fase 5** - recordatorios por cron y funnel de conversión.

> Nota: parte de lo que la Fase 3 imaginaba como "portal del cliente" ya existe
> de otra forma (`/portal`, con cuentas reales) así que conviene releer el plan
> antes de implementarlo y decidir qué se comparte con el portal y qué sigue
> siendo un link público sin sesión.

### Etapas del roadmap sin empezar

De `docs/plan-roadmap-2026-07.md`, quedan las etapas 9 a 11:
`/changelog` público generado desde los commits, `/architecture` renovada como
tour guiado del sistema, y el briefing semanal con IA.

### Mejora menor arrastrada

- [ ] `src/pages/admin/projects/[id].astro`: quedan grises `zinc-*` internos sin
      migrar a la paleta `ink-*` (visualmente cercanos; los badges de estado y
      los tabs ya se migraron).

---

## 5. Cómo retomar (entorno)

- **Node ≥22.12.** El shell por defecto puede traer v20, que rompe Astro:
  ```sh
  source ~/.nvm/nvm.sh && nvm use 22
  ```
- Build / dev: `npm run build` · `npm run dev` (localhost:4321).
- Migraciones (solo aditivas):
  ```sh
  export $(grep -E '^TURSO_' .env | xargs) && npx drizzle-kit generate   # y luego migrate
  ```
- Antes de depurar algo raro en dev (sobre todo el aislamiento de la demo),
  revisar `ps aux` por sesiones de agente concurrentes sobre este mismo checkout
  y reiniciar `astro dev` desde cero: el HMR no es fiable para verificar
  aislamiento.

## 6. Lo ya resuelto (resumen, sin detalle)

Panel de control completo (costos y P&L multi-moneda, bóveda AES-256-GCM,
seguimiento comercial, backups) · monitoreo propio con 8 monitores y alertas
push · micro-SIEM completo (clasificador, rate limit durable, blocklist con
escalado, anomalías por z-score, vitrina pública) · LAB Fases 0–4, 6 y 7
(CI/CD con rollback, pagos idempotentes, chaos, SLOs, SAST, DAST, a11y,
mutation testing y contratos) · demo read-only del panel · portal de clientes
Fases 0–7 · cobros de campo por WhatsApp · suite e2e con Playwright en CI ·
documentación pública en `/docs` (requisitos, UML, kanban, testing, V&V,
pipeline en vivo, diagramas BPMN con versión imprimible) · landing comercial
`/paginas-web` · infraestructura de internacionalización con `/en` y 7 páginas
de marca traducidas · optimización de las consultas de latencia de `/status`
(índices compuestos en `monitor_checks` y `ci_runs`, lectura por lotes que
respeta el techo de 50 ramas por compound SELECT de Turso).

El historial narrado de cada iteración vive en
`src/data/iteraciones-portfolio.ts` y se ve en `/docs/kanban`.
