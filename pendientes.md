# Pendientes — CodeByMike

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

Estado real de `dev-portfolio` (proyecto de Vercel que sirve `codebymike.tech`)
consultado el 24 jul 2026. **Todo lo que falta degrada en silencio** — ese es el
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
moría el 17 jul — con 12 días de retraso las gráficas de monitores se veían
muertas. Ahora: 51 tablas (migraciones al día), 90 días de historial que
terminan hoy, 4 clientes/proyectos/monitores ficticios.

Al re-sembrar apareció un bug real en `scripts/seed-demo.mjs`: `resetSchema()`
apagaba las FK con `pragma foreign_keys = off` en un `execute` suelto, pero
contra Turso por HTTP cada `execute` viaja en su propia sesión, así que el
pragma se perdía y los `drop table` fallaban por FOREIGN KEY. Arreglado con
`executeMultiple` (una sola conexión, sin transacción implícita — dentro de una
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

- [ ] **`VERCEL_TOKEN` en GitHub Secrets.** Es el único bloqueo real que queda en
      el LAB: sin él, el rollback automático solo avisa en vez de revertir, y la
      Fase 5 (load testing con k6) no tiene un target de preview estable contra
      el que correr.
- [ ] **Cron `security-rollup` en cron-job.org** con `Authorization: Bearer
      CRON_SECRET`. Sin él, los agregados de seguridad no se calculan y la
      detección de anomalías se queda sin baseline.
- [ ] **3 reglas custom del WAF** en el dashboard de Vercel (detalle en
      `docs/plan-security-observability.md`, Fase 6).
- [ ] **Altas en Google Search Console y Bing Webmaster Tools.** La capa técnica
      de SEO (JSON-LD, sitemap, RSS, IndexNow, manifest) está completa desde jul
      2026; falta el alta manual que ningún código puede hacer.
- [ ] **App de ntfy en el celular** suscrita al topic. Las alertas se envían
      igual; sin suscripción no se ven.
- [ ] Confirmar en el EDIT del job de uptime en cron-job.org que el header
      `Authorization` quedó guardado (si falta, el HISTORY muestra 401 en rojo).

## 3. Verificaciones pendientes en producción

- [ ] Bóveda de credenciales: crear un servicio con secreto en
      `/admin/projects/[id]` y confirmar que cifra y revela correctamente.
- [ ] P&L: comprobar que un costo en COP suma bien al total en `/admin/costs`.
- [ ] Cobros de campo: hacer un cobro real de punta a punta (`/cobrar` → mensaje
      de WhatsApp → `/c/[code]` → pago → `/mis-pagos`).

## 4. Trabajo de código pendiente

### Portal de clientes en tiempo real — plan cerrado, sin empezar

Es el gap más grande. El portal está completo y auditado (Fases 0–7), pero
**nada se actualiza solo**: un cliente con el portal abierto no ve la respuesta a
su mensaje ni que su monitor se cayó hasta que recarga a mano. El dato *es* de
tiempo real; la interfaz no.

Diseño ya decidido en `docs/plan-portal-tiempo-real.md`: polling de un digest
barato cada 20 s (no SSE ni WebSockets — Turso no tiene pub/sub, así que el
servidor tendría que sondear igual y encima pagaría la conexión abierta), con
pausa cuando la pestaña no está visible, backoff ante error y fail-open
silencioso.

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
el endpoint estuviera desplegado — ese orden importa: al revés, el primer
chequeo habría dado 404 → caída → incidente y push a ntfy por un servicio sano.
Verificado que `https://codebymike.tech/api/portal/health` responde 200 con el
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

### Monitor `ResidentialAccess` (id 5) — pausado, no borrado (24 jul 2026)

Llevaba en `down` desde el 20 jul con un incidente sin resolver. Comprobado a
mano: `https://residential-access.vercel.app` devuelve **HTTP 500**, así que el
monitor no daba un falso positivo — el servicio está realmente roto.

Se **pausó** (`paused=1`) en vez de borrarse: desaparece de `/status` (la página
filtra por monitor visible, así que su incidente abierto tampoco se muestra) y
conserva sus **6.447 chequeos y 6 incidentes** desde el 2 jul. El monitor está
atado al proyecto 5 del CRM, así que su historial es el registro de
disponibilidad de ese proyecto.

- [ ] Decidir el destino del proyecto: si se retoma, arreglar el 500 y despausar
      el monitor; si se archiva, borrar la fila (`delete from monitors where
      id=5`, que arrastra chequeos e incidentes por cascada).

### Versión en inglés — Fases 2 (resto) a 8

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
- **LAB y `/docs`** (Fases 5 y 6): incluyen refactor real —los textos de
  `src/lib/lab/findings.ts` deben pasar a claves de diccionario, no a frases.
- **Assets** (Fase 8): imágenes OG y CV en inglés sin generar.

> Regla operativa que salió de la corrección del 29 jul: traducir una página son
> **tres** pasos, no dos — texto al diccionario, cascarón en `src/pages/en/` y
> alta en `TRANSLATED_ROUTES`. Sin el tercero la página queda invisible; el
> tercero sin el segundo publica un 404 en el sitemap. `tests/i18n-routing.test.ts`
> cruza la lista contra los archivos reales para que no se separen.

- [ ] Alta de la propiedad en inglés en Search Console y Bing (ver §2).
- [ ] Artículo de `/notes` sobre el hallazgo de los guardas ciegos al prefijo
      (§14 del plan) — pendiente, con el riesgo de bypass como columna
      vertebral.

### Test lento en `tests/latency.test.ts`

`«supera el techo de 50 términos por compound SELECT de Turso»` siembra bastantes
filas en libSQL y tarda ~5 s, justo en el límite del `testTimeout` por defecto de
Vitest: falla de forma intermitente en `npm test` y pasa con
`--testTimeout=30000`. No es un fallo del código —la función se comporta bien—,
pero un test que falla por reloj entrena a ignorar el rojo.

- [ ] Darle timeout explícito a ese test (o bajar el volumen sembrado).

### LAB — Fase 5: load testing con k6

Última fase del laboratorio. Bloqueada por `VERCEL_TOKEN` (ver arriba). Detalle
en `docs/plan-lab-fases-pendientes.md`.

### Panel de briefings — Fases 2 a 5

La Fase 1 (checklist de ítems, soft delete, timeline de actividad) se entregó el
6 jul. Faltan, en el orden de valor acordado en `docs/plan-briefings.md`:

- **Fase 3** — link público `/briefing/[token]` con aprobación firmada
  (nombre + email + timestamp), comentarios del cliente y versionado.
- **Fase 2** — kanban, filtros y prioridad en el panel.
- **Fase 4** — intake público y conversión de briefing a proyecto.
- **Fase 5** — recordatorios por cron y funnel de conversión.

> Nota: parte de lo que la Fase 3 imaginaba como "portal del cliente" ya existe
> de otra forma —`/portal`, con cuentas reales— así que conviene releer el plan
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
pipeline en vivo) · landing comercial `/paginas-web`.

El historial narrado de cada iteración vive en
`src/data/iteraciones-portfolio.ts` y se ve en `/docs/kanban`.
