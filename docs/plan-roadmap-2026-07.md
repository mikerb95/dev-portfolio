# Roadmap — julio 2026 (plan maestro)

> Plan acordado el 15 jul 2026. Consolida: demo read-only del admin, fases LAB
> pendientes, remate de la vitrina de seguridad, `/lab` público, README, e2e con
> Playwright, changelog, página de arquitectura, briefing semanal con IA y los
> artículos de `/notes` que faltan.
>
> **Regla transversal**: cada etapa mayor termina con su artículo en `/notes`
> (el feature demuestra que sé hacerlo; el artículo, que sé explicarlo).
>
> Convenciones que TODO lo de este plan reutiliza (ya establecidas):
> - Migraciones Drizzle **solo aditivas** (`npx drizzle-kit generate` + migrate, Node 22 vía nvm).
> - Páginas públicas: SSR con queries agregadas directas (patrón `/status` y `/security`),
>   cache CDN `s-maxage=300 + SWR` que ya pone el middleware, y **OPSEC**: solo agregados,
>   nunca IPs crudas, secretos, URLs internas ni nombres de reglas.
> - Crons: endpoint `GET /api/cron/*` con `Authorization: Bearer CRON_SECRET`
>   (timingSafeEqual), disparado desde cron-job.org, **fail-open**.
> - Tests Vitest: lógica pura sin BD, o libsql en archivo temporal (no `:memory:`).
> - Notificaciones: `src/lib/notify.ts` (ntfy + Resend opcional), headers sin emoji.

---

## Orden de ejecución

> **Estado (17 jul 2026)**: etapas 1-5 ✅ implementadas y verificadas.
> Siguiente: etapa 6 (LAB Fase 7 — mutation + contratos).

| # | Etapa | Tipo | Esfuerzo |
|---|-------|------|----------|
| 1 | ✅ README renovado | mejora | ~1 h |
| 2 | ✅ `/lab` público (vitrina del LAB) | feature | ~1 sesión |
| 3 | ✅ Demo read-only del admin | feature grande | ~2-3 sesiones |
| 4 | ✅ Playwright e2e | infra de calidad | ~1-2 sesiones |
| 5 | LAB Fase 6 — SAST + a11y | LAB | ~2-3 días |
| 6 | LAB Fase 7 — Mutation + contratos | LAB | ~2 días |
| 7 | LAB Fase 5 — Load testing k6 | LAB | ~2 días |
| 8 | Remate vitrina seguridad | remate | ~1 h |
| 9 | Changelog público | feature | ~½ sesión |
| 10 | Página `/architecture` renovada | mejora | ~½ sesión |
| 11 | Briefing semanal con IA | feature | ~1 sesión |
| T | Artículos `/notes` faltantes | transversal | 1 por etapa |

Racional del orden: primero lo barato y visible (1-2), luego el feature estrella
(3), luego la red de seguridad e2e (4) que además cubre la demo y da la base para
axe (etapa 5). Las fases LAB van 6→7→5 porque la 6 reaprovecha Playwright recién
instalado y es casi gratis; la 7 explota los tests existentes; la 5 (k6) es la de
mayor fricción operativa (staging, workflow manual). El resto son piezas
independientes ordenadas por impacto.

---

## Etapa 1 — README renovado

**Problema**: el README describe el panel privado pero no enlaza nada de lo
público. Siendo el repo público "con fines de portafolio", el README es en sí
una pieza del portafolio.

Pasos:
1. Hero: qué es (portafolio + panel + LAB + micro-SIEM), stack, link a codebymike.tech.
2. Sección **"En vivo"** con tabla de superficies públicas: `/status`, `/tools`,
   `/notes`, `/docs`, `/security`, `/lab` (cuando exista, etapa 2), `/pay`.
3. Sección **LAB / ingeniería**: qué demuestra cada módulo (CI+rollback, chaos,
   SLO, pagos mock, micro-SIEM) con una línea por módulo y link al plan/página.
4. Diagrama corto de arquitectura (texto o mermaid) y mapa de directorios clave.
5. Conservar intactas las secciones de Seguridad y Licencia.
6. **No** incluir: nombres de env vars sensibles nuevas, rutas honeypot, detalles OPSEC.

Aceptación: todos los links funcionan en prod; `grep` sin secretos; se entiende
el proyecto en 60 segundos sin abrir el código.

## Etapa 2 — `/lab` público

**Objetivo**: versión pública read-only de lo que hoy solo se ve en `/admin/lab/*`.
Hoy `/lab` solo tiene `fingerprint/`.

Pasos:
1. `src/pages/lab/index.astro` (pública, SSR): reusar las MISMAS funciones de
   agregación que usan las páginas admin (o extraer a `src/lib/` lo que esté
   inline en ellas), nunca duplicar queries:
   - **Pipeline CI**: últimas corridas de `ci_runs` (estado, duración, cobertura,
     mutation score cuando exista). Sin URLs de preview ni SHAs completos (7 chars).
   - **SLO / error budget**: reusar `src/lib/slo.ts` — los mismos números que `/status`.
   - **Chaos**: experimentos históricos de `lab_experiments` (qué se rompió, qué
     se observó); flags activos NO se muestran (OPSEC: no anunciar fallos inyectables).
   - **Pagos (mock)**: contadores agregados de `payments` (transacciones de
     laboratorio, tasa de éxito) marcado claramente como sandbox.
   - **Fingerprint demo**: tarjeta-link a `/lab/fingerprint` (interactivo, ya público).
   - Tarjetas "próximamente" para load testing / SAST / mutation (etapas 5-7),
     que se van encendiendo al completarlas.
2. Copy: explicar en 2-3 líneas por sección QUÉ demuestra (la narrativa vale
   tanto como los datos). Mismo tono que `/security`.
3. Enlaces: tarjeta en `/tools`, link en Footer, link en `/status` si aplica.
4. SEO: title/description/OG (reusar pipeline `og:generate` si es barato; si no, OG genérica).
5. OPSEC check: grep del HTML servido — sin tokens, sin URLs vercel.app de
   preview, sin rutas admin.

Aceptación: `/lab` carga sin sesión con datos reales; sin fugas (grep);
lighthouse a11y sin regresiones; link visible desde home/tools/footer.

## Etapa 3 — Demo read-only del admin ✅ IMPLEMENTADA (15 jul 2026)

**Entregado**: base Turso `portfolio-demo` creada y poblada con
`scripts/seed-demo.mjs` (4 clientes, 4 proyectos, 8 servicios, 4 monitores con
90 días de checks, incidente sembrado, corridas de CI y los 5 experimentos del
LAB). `src/lib/demo.ts` (pase HMAC con TTL de 2h + listas de método/ruta, 12
tests), proxy de BD con `AsyncLocalStorage` en `src/db/index.ts` (los 88 módulos
que importan `db` no se tocaron), rama de demo en `src/middleware.ts`, página
`/demo`, banner en `AdminLayout`, enlaces desde `/login` y `/tools`.

**Hallazgo que cambió el diseño**: los endpoints que revelan la bóveda
(`…/services/<id>/secrets`) y las variables de entorno (`…/projects/<id>/envvars`)
son **GET**, así que "solo lectura" NO los habría detenido. Por eso la lista de
bloqueo va por patrón y se testea explícitamente.

**Verificado end-to-end**: 17 páginas del panel responden 200 con datos
ficticios; 19 centinelas de datos reales (nombres de proyectos y servicios de la
base real) buscados en 3.2 MB de HTML servido en modo demo → **cero fugas**;
POST/PUT/PATCH/DELETE → 403; los 6 reveladores/rutas sensibles → 403; las
páginas públicas siguen mostrando datos reales; flujo completo ejercido en
Chromium (form → `/admin`, banner presente).

**Notas de operación**:
- El seed **arrasa y recrea** el esquema con el migrador de drizzle. Un runner
  casero de migraciones no sirve: la migración 0009 lleva un paso de datos que
  no tolera re-ejecución. Salvaguarda: aborta si `TURSO_DEMO_URL` es la base real.
- Re-ejecutar `node scripts/seed-demo.mjs` tras cada migración nueva, o el
  esquema de la demo queda desfasado.
- Falta subir `TURSO_DEMO_URL` y `TURSO_DEMO_AUTH_TOKEN` a Vercel (Production):
  sin ellas la demo simplemente no existe (`/demo` → 404) y el panel se comporta
  como antes.

### Diseño (referencia)

**Objetivo**: que cualquiera explore el panel con datos ficticios y cero
capacidad de escritura. El pendiente de mayor impacto (todo el trabajo del panel
hoy es invisible sin login).

Diseño (decidir en implementación, pero este es el enfoque recomendado):
1. **Datos**: base Turso separada (`TURSO_DEMO_URL`/`TURSO_DEMO_TOKEN`) con el
   mismo esquema, poblada por `scripts/seed-demo.mjs` (clientes/proyectos/costos/
   monitores/interacciones ficticios pero verosímiles; secretos de la bóveda =
   placeholders cifrados con una `ENCRYPTION_KEY` demo). Ventaja: imposible tocar
   datos reales por diseño, sin `WHERE is_demo` en cada query.
2. **Selección de BD por request**: `AsyncLocalStorage` en `src/db/index.ts` —
   el export `db` se vuelve un proxy que resuelve al cliente demo cuando el
   contexto del request lo marca. Cero cambios en las ~30 páginas admin.
   (Plan B si el proxy se complica con Drizzle: factory `getDb(locals)` y tocar
   los imports de las páginas admin — más ruido, misma seguridad.)
3. **Entrada**: página pública `/demo` que explica qué es y pone cookie firmada
   (HMAC con `AUTH_SECRET`, TTL 2 h) `demo_session`, luego redirige a `/admin`.
4. **Middleware** (`src/middleware.ts`, rama `isAdmin`): si no hay sesión real
   pero hay cookie demo válida → entra en modo demo:
   - Solo `GET`/`HEAD`; cualquier otro método → 403 con mensaje "modo demo".
   - Bloquear también los GET peligrosos: revelado de bóveda, backup/export,
     `/admin/passkeys`, `/admin/sessions` (lista blanca o negra explícita de rutas).
   - `locals.demo = true` + activar el ALS de BD demo.
5. **UI**: banner fijo "🔍 Demo — datos ficticios, solo lectura" en el layout
   admin cuando `locals.demo`; ocultar/deshabilitar botones de acción (los POST
   igual están bloqueados server-side — el banner y los disabled son cortesía).
6. **Headers**: en demo quitar `noindex`… NO — mantener `noindex` (no queremos
   el panel demo indexado), pero permitir frame-ancestors igual que admin.
7. **Entradas públicas**: tarjeta en home/`/tools` + botón "Ver demo" en `/login`.
8. **Tests**: unit del verificador de cookie firmada; e2e (etapa 4): GET ok,
   POST 403, revelado de bóveda 403, datos reales inalcanzables (marcador
   centinela en BD real que NUNCA debe aparecer en HTML demo).

Aceptación: sin sesión GitHub se navega todo el panel con datos fake; ningún
método de escritura pasa; el revelado de secretos está bloqueado; con sesión
real todo sigue exactamente igual; e2e cubriendo los 3 puntos anteriores.

## Etapa 4 — Playwright e2e ✅ IMPLEMENTADA (16 jul 2026)

**Entregado**: `playwright.config.ts` + `e2e/` con 5 specs (36 tests):
`public` (render sin errores + cabeceras + sitemap), `auth` (gate de /admin),
`demo` (las tres garantías de aislamiento), `contact` y `payments` (escritura
real + rate limit + idempotencia). Job `e2e` en `ci.yml` (instala Chromium,
sube el reporte si falla). Scripts `test:e2e` / `test:e2e:ui` / `seed:demo`.

**Decisiones que conviene recordar** (documentadas en los archivos):
- **Bases desechables libsql en archivo** (`.e2e/`), nunca Turso: los e2e
  escriben y no deben tocar datos reales ni gastar cuota. `scripts/seed-e2e.mjs`
  las siembra en el arranque del `webServer` — **no** en `globalSetup`, porque
  Playwright levanta el servidor ANTES de correr globalSetup.
- La base "principal" se siembra con un **prefijo centinela** (`SEED_PREFIX` en
  `seed-demo.mjs`, ahora parametrizable); el spec de la demo afirma que ese
  prefijo NUNCA aparece en `/admin` → prueba el aislamiento de datos de verdad.
- **`astro dev`, no `astro preview`**: el adaptador de Vercel no soporta preview.
  El middleware (lo que estos tests verifican) corre igual en dev.
- `e2e/fixtures.ts`: corta toda petición a hosts externos (sin esto `page.goto`
  cuelga esperando fuentes de Google), filtra errores de consola de terceros, y
  da a cada test una **IP `x-forwarded-for` aleatoria** para que los tests de
  rate limit no se envenenen entre sí (el límite es por IP).
- Peticiones autenticadas por `page.request`, no el fixture `request`: este
  último vive en otro contexto y no lleva la cookie del pase.

**Verificado**: 36/36 en frío con `CI=1` (dos veces). Nota: reutilizando el
servidor local entre corridas seguidas los tests de rate limit pueden acumular
estado en la base compartida; en CI y en arranque limpio se re-siembra, así que
no aplica.

### Diseño (referencia)

**Objetivo**: cerrar la pirámide de testing (hoy: 280+ unit tests, 0 e2e) y
proteger la demo recién construida. Playwright ya está en devDependencies.

Pasos:
1. `playwright.config.ts`: proyecto chromium, `webServer` que levanta
   `astro preview` (build previo) con env de test: BD libsql `file:` temporal con
   migraciones aplicadas + seed mínimo (script compartido con el seed demo donde
   se pueda). Verificar cómo `src/db/index.ts` resuelve la conexión para
   inyectar la URL por env.
2. Directorio `e2e/` (separado de `tests/` para que Vitest no los recoja;
   revisar `vitest.config.ts` excludes).
3. Specs iniciales:
   - `public.spec.ts`: home, `/status`, `/security`, `/notes`, `/lab` renderizan
     (status 200, h1 visible, sin errores de consola).
   - `auth.spec.ts`: `/admin` anónimo → redirect a `/login`; POST a `/api/admin/*` → 302/403.
   - `demo.spec.ts`: flujo demo completo (etapa 3).
   - `contact.spec.ts`: envío de formulario de contacto (mock) + rate limit tras N envíos.
   - `payments.spec.ts`: checkout mock end-to-end.
4. Scripts npm: `test:e2e`, `test:e2e:ui`.
5. CI: job nuevo en `ci.yml` (después del build; `npx playwright install
   --with-deps chromium`; artefacto de traces solo en fallo). Que NO bloquee el
   deploy más de ~3 min: paralelizar o marcar los lentos como smoke nocturno.

Aceptación: `npm run test:e2e` verde local y en CI; los specs de demo prueban
las 3 garantías de seguridad de la etapa 3.

## Etapas 5-7 — LAB Fases 6, 7 y 5

El detalle completo (entregables, tablas, workflows, criterios) ya está en
`docs/plan-lab-fases-pendientes.md`. Aquí solo el orden nuevo y los ajustes:

**Etapa 5 = LAB Fase 6 (SAST + a11y primero, DAST después)**
- Arrancar por lo gratis y rápido: `npm audit` parseado + **CodeQL** (repo
  público = gratis) + **axe-core sobre Playwright** (sinergia directa con la
  etapa 4: mismos specs, mismas páginas públicas).
- ZAP baseline contra preview queda como sub-fase 6b (la más dependiente de
  infra; no bloquear lo demás por ella).
- Tabla `security_findings` + ingesta `kind:'security_finding'` + página
  `/admin/lab/security` según el plan original. Encender la tarjeta
  correspondiente en `/lab` público (agregados: "N hallazgos, M resueltos").

**Etapa 6 = LAB Fase 7 (mutation + contratos)**
- Stryker + `@stryker-mutator/vitest-runner` sobre `src/lib/**`; workflow
  manual/semanal; score vía ingesta (reusar columna `mutationScore` de `ci_runs`
  si el análisis lo confirma). Contratos Zod para ≥4 endpoints.
- Encender mutation score en `/lab` público y en `/admin/lab/pipeline`.

**Etapa 7 = LAB Fase 5 (k6)**
- Según plan original (scripts en `lab/k6/`, tabla `load_test_runs`, ingesta
  `kind:'load_test'`, página admin, workflow manual con guard anti-prod).
- Prerrequisito operativo: target de preview/staging estable. Recordatorio:
  `VERCEL_TOKEN` en GitHub Secrets sigue pendiente (transversal).
- Encender tarjeta de load testing en `/lab` público.

## Etapa 8 — Remate vitrina de seguridad

El micro-SIEM está implementado (Fases 0-6, ver plan propio). Falta solo:
1. Caso de estudio / tarjeta en `/tools` apuntando a `/security` (formato de las
   tarjetas existentes).
2. Verificar que el artículo de `/notes` del micro-SIEM enlaza a la vitrina viva.
3. **Acción manual de Mike** (no código): 3 custom rules del WAF en el dashboard
   de Vercel + alta del cron `security-rollup` en cron-job.org (detalle en
   `docs/plan-security-observability.md`, Fase 6).

## Etapa 9 — Changelog público

**Objetivo**: `/changelog` generado desde los commits de main — barato porque la
integración GitHub ya existe (`/api/github`).

Pasos:
1. `src/lib/changelog.ts`: fetch de commits de main vía API GitHub (token ya
   configurado para `/admin/repos`), parse de conventional commits
   (`feat:`/`fix:`/`perf:`/`docs:`…), agrupación por semana. **Función de parse
   pura y testeada.** Filtrar: solo feat/fix/perf visibles; excluir chore/ci y
   cualquier mensaje que matchee patrones sensibles (nombres de env vars, "secret",
   "key", "token").
2. Cache: la CDN ya cachea 5 min; añadir cache en memoria/app_settings si el
   rate limit de GitHub molesta (60/h sin token no aplica: hay token).
3. `src/pages/changelog.astro`: timeline agrupado por semana, tipo con badge
   (feat/fix), link al commit en GitHub (repo es público).
4. Link en Footer + entrada en sitemap/RSS si encaja.

Aceptación: refleja los últimos commits reales; un commit `chore:` no aparece;
test del parser.

## Etapa 10 — `/architecture` renovada ("cómo está construido esto")

Revisar `src/pages/architecture.astro` (176 líneas actuales) y convertirla en el
tour guiado del sistema:
1. Diagrama de capas real y actualizado: edge Vercel → middleware (SIEM/chaos/
   auth/rate limit) → SSR Astro → Turso/Drizzle → crons externos (cron-job.org)
   → ntfy/Resend. Reusar el patrón SVG inline que ya se usó en `/docs` (el
   commit reciente reemplazó Mermaid por SVG — mantener esa decisión).
2. Por cada pieza: 2 líneas de "por qué así" + **link a la pieza viva**
   (`/status`, `/security`, `/lab`, `/changelog`) y al artículo de `/notes` que
   la cuenta. Esta página se vuelve el índice narrativo de todo el portafolio.
3. Sección de decisiones/trade-offs (fail-open, Turso free tier, sin frameworks
   de front, crons externos vs Vercel cron) — honesta, con límites conocidos.

## Etapa 11 — Briefing semanal con IA

**Objetivo**: uso de IA con criterio — pequeño, útil, sobre infra propia, sin
chatbot genérico.

Pasos:
1. `src/lib/weekly-briefing.ts`: recolector que arma un JSON agregado de la
   semana: uptime por monitor, incidentes, eventos de seguridad por categoría
   (agregados — NUNCA IPs ni rutas señuelo al LLM), web vitals p75, corridas CI,
   pagos lab, hallazgos SAST abiertos. **Función pura y testeada** (el JSON de
   entrada al LLM es un contrato).
2. Llamada a la API de Anthropic (`claude-haiku-4-5`, barato; `ANTHROPIC_API_KEY`
   en env, patrón no-op de `notify.ts` si falta la key): prompt fijo en español →
   briefing corto (qué pasó, qué vigilar, 1 recomendación). Sin SDK si con
   `fetch` basta (mantener deps mínimas).
3. Persistencia: reusar la tabla `briefings` existente (evaluar si su shape
   encaja; si no, tabla `weekly_briefings` aditiva) → visible en `/admin/briefings`.
4. Entrega: push ntfy con el resumen de 3 líneas + link al briefing completo.
5. Trigger: `GET /api/cron/weekly-briefing` (Bearer CRON_SECRET) + job semanal
   en cron-job.org (lunes 7:00 America/Bogota).
6. Guardas: presupuesto (1 llamada/semana ≈ centavos), truncado del JSON de
   entrada, fail-open total (si la API falla, se guarda el briefing "crudo" sin
   redacción IA).

Aceptación: cron manual produce briefing + push; sin key el endpoint degrada a
briefing sin IA; test del recolector y del truncado.

## Transversal — Artículos `/notes` faltantes

Existentes: monitor propio, micro-SIEM, chaos, SLOs, sesiones revocables, RAG.
Cola de artículos (escribir cada uno al cerrar su etapa):

1. **Pasarela de pagos mock**: idempotencia, webhooks firmados, por qué mock (tras etapa 2, ya se puede — el feature existe).
2. **Bóveda AES-256-GCM**: cifrado por servicio, revelado bajo demanda, qué NO hacer.
3. **Demo read-only** (tras etapa 3): aislar por diseño (BD separada) vs filtrar por query.
4. **E2E con Playwright** (tras etapa 4): la pirámide completa en un repo solo.
5. **Mutation testing** (tras etapa 6): "87% cobertura, ¿y si los tests no verifican nada?".
6. **k6** (tras etapa 7): carga contra preview, nunca contra prod facturado.
7. **Briefing con IA** (tras etapa 11): IA con criterio, contratos de entrada, fail-open.

Cada artículo: mismo formato del content collection actual, OG image
(`og:generate`), submit IndexNow (`seo:indexnow`), distribución vía workflow
`distribute-note.yml`.

## Acciones manuales pendientes (solo Mike, no código)

- [ ] `VERCEL_TOKEN` en GitHub Secrets (rollback Fase 1 LAB + k6).
- [ ] Altas en Google Search Console y Bing Webmaster (capa SEO ya lista).
- [ ] 3 custom rules WAF en dashboard Vercel (etapa 8).
- [ ] Cron `security-rollup` en cron-job.org con `CRON_SECRET`.
- [ ] App ntfy en el celular suscrita al topic.
- [ ] Verificar bóveda/P&L COP en prod (pendientes.md).
- [ ] (Opcional) limpiar `DEV_USER`/`DEV_PASSWORD` de env.
- [ ] **`TURSO_DEMO_URL` + `TURSO_DEMO_AUTH_TOKEN` en Vercel (Production)** — ya
      están en `.env` local; sin ellas la demo no existe en prod (etapa 3).
