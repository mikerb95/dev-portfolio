# LAB — Fases pendientes (detalle de implementación)

> Complemento de `docs/plan-lab.md`.
>
> **Estado a jul 24 2026**: Fases 0-4 completas (tests base, CI/CD + rollback,
> pasarela de pagos, chaos engineering, SLO/error budget), **Fase 6 completa**
> (SAST el 17 jul, DAST el 23 jul, a11y el 17 jul) y **Fase 7 completa**
> (mutation testing con score real 87.2 % + contratos Zod, 17 jul).
> **Queda solo la Fase 5** (load testing con k6), bloqueada por la falta de un
> target de preview/staging estable → `VERCEL_TOKEN`.
>
> Este documento detalla las Fases **5, 6 y 7** con alcance, archivos concretos,
> criterios de aceptación y notas de costo/seguridad.
>
> Convenciones ya establecidas que estas fases reutilizan:
> - **Ingesta de artefactos de CI**: `POST /api/lab/ingest` con `Authorization: Bearer LAB_INGEST_TOKEN` (timingSafeEqual). Hoy solo acepta `kind: 'ci_run'`; se amplía por fase.
> - **Páginas admin**: bajo `/admin/lab/*`, protegidas por `src/middleware.ts`. Datos siempre escapados con `esc()` antes de `innerHTML`.
> - **APIs de lectura admin**: `/api/admin/lab/*` (solo GET, tras el guard).
> - **Migraciones Drizzle**: solo aditivas (`npx drizzle-kit generate` + `migrate` con Node 22).
> - **Tests**: Vitest; lógica pura sin tocar BD, o BD libsql en archivo temporal (no `:memory:`, por las transacciones).

---

## Fase 5 — Load testing con k6

**Objetivo**: mostrar latencia y throughput bajo carga (100 / 500 / 1000 usuarios
concurrentes) con gráficas p50/p95/p99, y contar la historia de "cómo se comporta
el sistema cuando lo aprietan". Casi nadie a nivel tecnólogo lo hace.

### ⚠️ Restricción de costo (crítica)
La carga **NUNCA** va contra `codebymike.tech` (producción):
- Vercel factura por invocación + CPU activa; 1000 VUs contra prod = costo real + posible bloqueo del WAF/BotID.
- Turso tiene límite de filas leídas/escritas en el plan gratuito.

La carga va contra un **preview deployment** desechable o un target de staging.
El job de k6 es **manual** (`workflow_dispatch`), nunca en cada push.

### Entregables
1. **Scripts k6** en `lab/k6/`:
   - `home.js` — GET a la home pública (renderizado SSR).
   - `api-read.js` — GET a un endpoint público de lectura (p. ej. `/api/health`).
   - `checkout.js` — POST a `/api/payments/checkout` en modo mock (idempotency key única por VU/iteración) para medir la ruta de escritura + BD bajo carga.
   - Escenario con etapas (`stages`): ramp-up a 100 → 500 → 1000 VUs y ramp-down, con `thresholds` (p. ej. `http_req_duration: p(95)<800`).
2. **Tabla `load_test_runs`** (migración nueva):
   ```
   id, tool ('k6'), scenario, vus, durationS, p50, p95, p99, rps,
   errorRate, checksPassed, checksFailed, rawJson, target, createdAt
   ```
3. **Ingesta**: ampliar `POST /api/lab/ingest` para aceptar `kind: 'load_test'`.
   El job parsea el `summary.json` de k6 (`handleSummary` → métricas) y lo postea.
4. **Endpoint admin** `GET /api/admin/lab/load` — últimas corridas.
5. **Página** `/admin/lab/load`:
   - Tarjetas por corrida con p50/p95/p99, RPS y tasa de error.
   - Gráfica de latencia por nivel de carga (SVG inline o `<canvas>` sin libs externas; recordar CSP de artifacts si se exporta).
   - Comparativa 100 vs 500 vs 1000 VUs.
6. **Sidebar**: link "Load testing" en el grupo LAB.
7. **Workflow** `.github/workflows/load-test.yml`:
   - `workflow_dispatch` con inputs `target_url` y `max_vus`.
   - Instala k6 (`grafana/setup-k6-action` o binario), corre los scripts, sube el summary a la ingesta.
   - Guard: rechaza si `target_url` contiene `codebymike.tech`.

### Cómo se corre en la demo
Opción A (recomendada, sin gastar en CI): correr k6 **localmente** contra un
preview deploy (`k6 run lab/k6/home.js -e TARGET=https://<preview>.vercel.app`),
el script postea el summary a la ingesta y la tarjeta aparece en `/admin/lab/load`.
Opción B: disparar el `workflow_dispatch` desde la pestaña Actions en vivo.

### Criterios de aceptación
- [ ] `lab/k6/*.js` corren local con k6 y generan summary.
- [ ] `load_test_runs` poblada vía ingesta autenticada.
- [ ] `/admin/lab/load` muestra p50/p95/p99 y gráfica por nivel de VUs.
- [ ] Ningún script apunta a producción por defecto; guard en el workflow.
- [ ] Tests: parser del summary de k6 (función pura) + validación del payload de ingesta `load_test`.

### Esfuerzo estimado: ~2 días

---

## Fase 6 — Seguridad (SAST / DAST) + Accesibilidad (a11y)

**Objetivo**: correr análisis de seguridad automáticos y de accesibilidad, y
mostrar hallazgos → estado (abierto / resuelto / aceptado). La narrativa
"encontré X y lo resolví" vale más ante el jurado que un scan vacío.

### 6.1 SAST (análisis estático) — ✅ implementado
- **Job de CI** `security.yml` (en PRs y push a main):
  - `npm audit --json` → parse de vulnerabilidades de dependencias.
  - **Semgrep** (`returntocorp/semgrep-action`) o **Snyk** (free tier) con reglas para JS/TS.
  - CodeQL de GitHub (gratis en repos públicos como `dev-portfolio`) como opción nativa.
- Resultados → `POST /api/lab/ingest` con `kind: 'security_finding'`.

### 6.2 DAST (análisis dinámico) — ✅ implementado (jul 23 2026)
- **OWASP ZAP baseline** (`zaproxy/action-baseline`) contra el **preview deployment**
  de cada PR (`.github/workflows/dast.yml`), nunca contra producción.
- La URL del preview se obtiene sondeando la API de Deployments de GitHub
  (`actions/github-script` + `GITHUB_TOKEN`), sin depender de `VERCEL_TOKEN`
  — a diferencia de la Fase 5, este job no está bloqueado por ese secret.
- Decisión de diseño: `spider.parseRobotsTxt=false` para que ZAP se comporte
  como el "crawler legítimo" que `public/robots.txt` le pide y nunca trate
  las rutas honeypot (`/wp-login.php`, `/admin.php`, `/admin`, `/api`) como
  objetivos. Si las pisara, el rate limiter durable bloquearía la IP del
  runner y el resto del scan perdería cobertura — no sería una
  vulnerabilidad real, sería un autogol de configuración.
- Salida JSON (`report_json.json`) → `scripts/zap-ingest.mjs` → ingesta con
  `source: 'zap'`, `autoResolve: true`. Cada alerta × instancia es un
  hallazgo, acotado a 15 instancias por alerta.
- Pendiente de verificar en un PR real (no se ha corrido aún contra un
  preview vivo): confirmar tiempos de espera del deployment y que
  `zaproxy/action-baseline` no necesite ajustes de `cmd_options` adicionales.

### 6.3 Accesibilidad (a11y)
- **`@axe-core/playwright`** o **Lighthouse CI** sobre las páginas públicas
  (`/`, `/projects`, `/contact`, `/pay`).
- Verifica contraste, roles ARIA, navegación por teclado, alt text.
- Score + violaciones → ingesta.

### Entregables
1. **Tabla `security_findings`** (migración):
   ```
   id, source ('npm-audit'|'semgrep'|'snyk'|'zap'|'codeql'|'axe'|'lighthouse'),
   severity ('critical'|'high'|'medium'|'low'|'info'),
   title, description, route, ruleId,
   status ('open'|'resolved'|'accepted'), resolvedAt, firstSeenAt, createdAt
   ```
   - Dedup por `(source, ruleId, route)` para no duplicar el mismo hallazgo entre corridas.
2. **Ampliar ingesta** con `kind: 'security_finding'` (acepta lote).
3. **Endpoint admin** `GET /api/admin/lab/security` + `PATCH` para marcar
   resuelto/aceptado (con nota).
4. **Página** `/admin/lab/security`:
   - Resumen por severidad (contadores tipo semáforo).
   - Lista filtrable por estado/fuente; acción "marcar resuelto".
   - Tarjeta de a11y con score de Lighthouse/axe.
5. **Sidebar**: link "Seguridad".
6. **Workflows**: `security.yml` (SAST), extensión DAST en `ci.yml` o job aparte, `a11y.yml`.

### Criterios de aceptación
- [ ] `npm audit` + un SAST (Semgrep/CodeQL) reportan a `security_findings`.
- [ ] ZAP baseline corre contra preview, nunca contra prod.
- [ ] a11y con score visible en el panel.
- [ ] Hallazgos se pueden marcar resueltos y persisten (dedup funciona).
- [ ] Tests: parser de SARIF/JSON, dedup de findings, transición de estado.

### Esfuerzo estimado: ~2-3 días

---

## Fase 7 — Mutation testing + Contract testing (remate)

**Objetivo**: demostrar **calidad de las pruebas mismas**, no solo cobertura.
Casi nadie a nivel tecnólogo conoce mutation testing; sorprende.

### 7.1 Mutation testing (Stryker)
- **Stryker** con `@stryker-mutator/vitest-runner` sobre `src/lib/**`
  (donde vive la lógica pura: money, pnl, payments, chaos, slo, domains…).
- Config `stryker.config.json`: `mutate: ['src/lib/**/*.ts']`, `testRunner: 'vitest'`,
  `reporters: ['json', 'clear-text']`, thresholds (high 80 / low 60 / break 50).
- **Es lento** → job **manual/semanal** (`workflow_dispatch` o `schedule` cron),
  nunca en cada push.
- El `mutation-report.json` → parse del `mutationScore` → ingesta `kind: 'mutation_run'`.
- Mostrar junto a cobertura en `/admin/lab/quality` (o `/admin/lab/pipeline`):
  *"87% cobertura, 74% mutation score — y sé explicar la diferencia"*.
  - La diferencia es el gancho: cobertura dice "esta línea se ejecutó"; mutation
    dice "si rompo esta línea, ¿algún test se da cuenta?". Un mutation score bajo
    con cobertura alta = tests que no verifican de verdad.

### 7.2 Contract testing
- Front y API viven en el **mismo repo Astro** → Pact (consumer/provider entre
  repos separados) es sobredimensionado. Versión honesta y defendible:
  - **Esquemas Zod compartidos** para las respuestas de `/api/*` clave
    (health, payments checkout, monitors, slo).
  - **Tests de contrato**: snapshot del *shape* de cada respuesta; si un endpoint
    cambia su forma sin actualizar el esquema, el test falla → "el contrato se rompió".
  - Documentar que **Pact aplicaría a SlideHub/microservicios** separados como extensión.

### Entregables
1. **Dependencias dev**: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `zod`.
2. **`stryker.config.json`** + script `npm run test:mutation`.
3. **Tabla `mutation_runs`** (o reutilizar `ci_runs` con columna `mutationScore` ya existente
   — decidir: hay `coveragePct` y `mutationScore` en `ci_runs`, quizá basta ampliar el ingest de `ci_run`).
4. **Esquemas Zod** en `src/lib/contracts.ts` + tests `tests/contracts.test.ts`.
5. **Workflow** `mutation.yml` (`workflow_dispatch` + `schedule` semanal).
6. **UI**: tarjeta de mutation score en el panel (junto a cobertura del pipeline).

### Criterios de aceptación
- [ ] `npm run test:mutation` corre Stryker sobre `src/lib` y produce score.
- [ ] Mutation score visible en el panel, reportado vía ingesta.
- [ ] Esquemas Zod cubren las respuestas de al menos 4 endpoints `/api/*`.
- [ ] Un cambio de shape en un endpoint rompe su test de contrato.
- [ ] Job de mutation es manual/semanal (no en cada push).

### Esfuerzo estimado: ~2 días

---

## Resumen y orden sugerido

| Fase | Entrega clave | Tablas nuevas | Workflows | Esfuerzo | Impacto jurado |
|---|---|---|---|---|---|
| 5 Load testing | Gráficas p50/p95/p99 bajo 100-1000 VUs | `load_test_runs` | `load-test.yml` (manual) | ~2d | Alto |
| 6 SAST/DAST + a11y | Hallazgos → resueltos, score a11y | `security_findings` | `security.yml`, `a11y.yml`, ZAP | ~2-3d | Medio-alto |
| 7 Mutation + contratos | Mutation score + Zod contracts | (reusar `ci_runs`) | `mutation.yml` (semanal) | ~2d | Alto (nadie lo conoce) |

**Recomendación de orden**: 5 → 7 → 6.
- La 5 es visual y autocontenida (buen impacto por esfuerzo).
- La 7 refuerza el mensaje de "calidad real" que ya vienes contando con los tests.
- La 6 es la más dependiente de infra externa (preview deploys, ZAP, tokens Snyk) y
  la que más tiempo de setup consume; dejarla al final evita bloqueos.

## Trabajo transversal pendiente (no atado a una fase)
- **VERCEL_TOKEN en GitHub Secrets**: sigue faltando (`gh secret list` no lo muestra).
  Sin él, el rollback de la Fase 1 solo avisa, no revierte. Subirlo con
  `gh secret set VERCEL_TOKEN --repo mikerb95/dev-portfolio`.
- **Llaves Wompi reales** (Fase 2): `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`,
  `WOMPI_EVENTS_SECRET` en Vercel + registrar el webhook `https://codebymike.tech/api/payments/webhook`.
  Sin ellas la pasarela opera en modo mock (suficiente para la demo).
- **Dashboard `/admin` consolidado**: tarjetas resumen que ya tienen datos
  (badge CI, cobertura, SLO/error budget, último mutation score) en la portada del panel
  para el arranque de la sustentación.
- **Guion de sustentación** (ya esbozado en `plan-lab.md`): ensayar la secuencia
  push-con-bug → rollback → chaos → payments-lab → k6/ZAP.
