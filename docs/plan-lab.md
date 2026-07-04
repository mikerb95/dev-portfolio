# Plan: Módulo LAB + Ingeniería de Calidad para Sustentación

> Objetivo: demostrar ante el jurado del SENA prácticas de ingeniería de nivel profesional
> (CI/CD, observabilidad, chaos engineering, testing avanzado, pagos resilientes) integradas
> al panel de administración del portfolio, sin romper ninguna funcionalidad existente.
>
> Plazo: > 1 mes. Decisiones confirmadas: pasarela de pagos propia en este repo (checkout de
> donaciones/pagos dev), chaos con flags controlados y auto-expiración, Vitest + Stryker.

---

## Estado actual (auditado 2026-07-03)

| Área | Estado |
|---|---|
| Stack | Astro 6 (SSR, adapter Vercel) + Drizzle + Turso/libsql + auth-astro + Tailwind 4 |
| Tests | **Cero**. No hay Vitest/Jest ni script `test` |
| CI/CD | **No existe** `.github/workflows`. Deploy = auto-deploy de Vercel al push |
| Observabilidad | Motor propio: `src/lib/monitors.ts` (probe, SSL expiry), tablas `monitors/monitor_checks/monitor_incidents`, crons en `vercel.json`, ntfy en `notify.ts` |
| Admin | Sidebar agrupado (`Sidebar.astro`), APIs bajo `src/pages/api/admin/*` protegidas por auth |
| Pagos | No existen |

Implicación clave: **coverage y mutation testing requieren primero construir la suite de
tests**; el pipeline con badge y rollback requiere construir el workflow de GitHub Actions.
Ambos son prerequisitos de otras tarjetas → van en la Fase 0/1.

---

## Arquitectura del módulo LAB

Nuevo grupo **LAB** en el sidebar, entre "Sistema" y "Perfil":

```
LAB
├── /admin/lab               → Dashboard del laboratorio (tarjetas resumen)
├── /admin/lab/pipeline      → CI/CD en vivo (runs de GitHub Actions, badge, rollback)
├── /admin/lab/quality       → Coverage + mutation score + resultados de suite
├── /admin/lab/chaos         → Panel de inyección de fallos (flags con TTL)
├── /admin/lab/load          → Load testing k6 (histórico de corridas, gráficas p50/p95/p99)
├── /admin/lab/security      → SAST/DAST (hallazgos de ZAP + npm audit/Snyk, estado resuelto)
├── /admin/lab/slo           → SLO / Error budget (99.5% mensual sobre datos de monitor_checks)
└── /admin/lab/payments-lab  → Suite de resiliencia de pagos (idempotencia, races, webhooks)
```

Principios de diseño (para no romper nada):

1. **Aditivo, no invasivo**: el LAB vive en rutas/tablas/APIs nuevas. El único punto de
   contacto con código existente es el middleware de chaos (ver abajo), diseñado para ser
   un no-op absoluto cuando no hay flags activos.
2. **Chaos con cinturón de seguridad**: cada flag de caos tiene `expiresAt` obligatorio
   (máx. 15 min), scope por ruta específica, y kill-switch global. Si la lectura del flag
   falla, el request pasa limpio (fail-open hacia el comportamiento normal).
3. **Todo tras auth**: páginas LAB bajo el mismo guard de `/admin`; APIs de mutación
   verifican sesión + método + CSRF igual que las APIs admin existentes.
4. **Datos reales, no mocks en UI**: las tarjetas leen artefactos generados por CI
   (coverage JSON, reporte Stryker, resultados k6, SARIF de ZAP) subidos vía un endpoint
   `POST /api/lab/ingest` autenticado por token de CI (`LAB_INGEST_TOKEN`).

### Nuevas tablas (Drizzle → `drizzle-kit generate`, migración aditiva)

```
chaos_flags       (id, kind: latency|error500|db_fail_midtx|kill_service, targetRoute,
                   param, active, expiresAt, createdAt)
ci_runs           (id, sha, branch, status, conclusion, startedAt, durationMs, url,
                   coveragePct, mutationScore, testsPassed, testsFailed)
load_test_runs    (id, tool, scenario, vus, durationS, p50, p95, p99, rps, errorRate,
                   rawJson, createdAt)
security_findings (id, source: zap|npm-audit|snyk, severity, title, description, route,
                   status: open|resolved|accepted, resolvedAt, createdAt)
payments          (id, reference, amountCents, currency, status: pending|approved|declined|
                   error, provider, idempotencyKey UNIQUE, gatewayTxId, createdAt, updatedAt)
payment_events    (id, paymentId, type, payload, receivedAt, processedAt, outOfOrder)
lab_experiments   (id, kind, params, result, notes, ranAt)  ← bitácora de experimentos para
                   mostrar historial al jurado
```

---

## Fases

### Fase 0 — Fundaciones de testing (prerequisito de todo)
1. Instalar Vitest + `@vitest/coverage-v8`; scripts `test`, `test:coverage`.
2. Escribir suite inicial sobre lo que ya existe y es puro/testeable:
   `money.ts`, `pnl.ts`, `crypto.ts`, `domains.ts` (cálculo "vence en Nd"), `monitors.ts`
   (probe con fetch mockeado), `notify.ts` (headerSafe — el bug del emoji ya corregido es
   un caso de test perfecto para contar en la sustentación).
3. Tests de timezone/DST y clock skew: casos sobre el cálculo de vencimientos con
   `America/Bogota`, cambios de día UTC vs local, y expiración JWT con reloj desfasado
   (usando `vi.setSystemTime`).
4. Meta: ≥80% cobertura en `src/lib/**` (el objetivo honesto es que mutation testing
   después lo valide).

> **Progreso**: Fase 0 ✅ (jul 3: 94 tests, 87% líneas en src/lib). Fase 1 ✅ (jul 4: workflow CI,
> /api/health, ingest, tabla ci_runs, página /admin/lab/pipeline). Falta el secret VERCEL_TOKEN
> en GitHub para habilitar el rollback automático (crear en vercel.com/account/tokens).
> Fase 2 ✅ (jul 4: pasarela propia — /pay con checkout idempotente, webhook Wompi con verificación
> de checksum, modo mock demo, máquina de estados con concurrencia optimista, panel
> /admin/lab/payments-lab con 4 ataques en vivo, 18 tests contra BD en memoria; 112 tests totales).
> Pendiente para pagos reales: crear cuenta Wompi sandbox y configurar WOMPI_PUBLIC_KEY,
> WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET en Vercel (sin ellas opera en modo mock).

### Fase 1 — Pipeline CI/CD en vivo
1. `.github/workflows/ci.yml`: push → `lint/typecheck (astro check)` → `vitest --coverage`
   → build → deploy Vercel (CLI con `--prebuilt`) → **health check post-deploy**
   (`GET /api/health`, nuevo endpoint que valida BD + versión).
2. **Rollback automático**: si el health check falla N veces, el job ejecuta
   `vercel rollback` al deployment anterior y notifica por ntfy. Para la demo: rama con bug
   intencional en `/api/health` → push en vivo → el jurado ve el pipeline fallar y revertir.
3. Al final de cada run, un step publica métricas a `POST /api/lab/ingest` → tabla `ci_runs`.
4. Badge de estado del workflow en el dashboard `/admin` y en `/admin/lab/pipeline`, con
   lista de runs en vivo (polling a la API de GitHub que ya usas en `/admin/repos`).

### Fase 2 — Pasarela de pagos propia (checkout de donaciones/pagos dev)
1. Página pública `/pay` (o `/donate`): checkout con Wompi sandbox (Colombia, tiene sandbox
   gratuito y widget embebible; MercadoPago como alternativa si prefieres).
2. Backend: `POST /api/payments/checkout` con **idempotency key obligatoria** (UNIQUE en
   BD; requests repetidos devuelven el mismo resultado, nunca doble cobro),
   `POST /api/payments/webhook` con verificación de firma, manejo de **webhooks duplicados
   y fuera de orden** (máquina de estados: un evento "approved" que llega antes que
   "created" se encola/reconstruye, nunca corrompe estado).
3. Concurrencia: actualización de estado con optimistic concurrency (columna `version` o
   `UPDATE ... WHERE status = ?`) para que dos webhooks simultáneos no pisen datos.
4. Panel `/admin/lab/payments-lab` con botones de ataque:
   - "Doble clic en pagar" → 2 requests concurrentes misma idempotency key → 1 solo cobro.
   - "Webhook duplicado" → reenvía el mismo evento firmado → procesado exactamente 1 vez.
   - "Webhooks desordenados" → dispara approved antes que created → estado final correcto.
   - "Race de inventario/saldo" → N updates concurrentes → invariante verificado.
   Cada botón muestra el resultado esperado vs. real y registra en `lab_experiments`.

### Fase 3 — Chaos engineering + recuperación
1. Middleware Astro (`src/middleware.ts`, nuevo): lee `chaos_flags` activos (cacheado
   ~5 s en memoria) y, solo si hay flag vigente para la ruta exacta, inyecta latencia,
   responde 500, o marca el contexto para fallo de BD. Sin flags → cero overhead extra
   (una lectura cacheada) y comportamiento idéntico al actual.
2. Panel `/admin/lab/chaos`: activar/desactivar flags con TTL, botón rojo "PÁNICO" que
   desactiva todo, y visor en vivo del monitor detectando la caída + push ntfy llegando
   al teléfono (guion de la demo: activar 500 en un endpoint monitoreado → esperar el
   check → mostrar la notificación en pantalla).
3. **Caída de BD a mitad de transacción**: experimento en el LAB que ejecuta una
   transacción de pago de prueba y aborta a mitad (rollback forzado / conexión cortada
   simulada), luego verifica y muestra que la BD quedó consistente (sin pagos huérfanos,
   sin doble conteo). Conecta con la optimistic concurrency de Fase 2.
4. Para el cron `uptime-check` diario: durante demos usar el trigger manual existente de
   cron-job.org o un botón "check ahora" para que la detección sea inmediata.

### Fase 4 — SLO / Error budget
1. Cálculo sobre datos reales de `monitor_checks`: uptime mensual por monitor, objetivo
   99.5%, presupuesto de error restante en minutos (como Google SRE).
2. Tarjeta en `/admin` + página `/admin/lab/slo` con gráfica de burn rate.
   Sin dependencias nuevas: es una query de agregación + una vista.

### Fase 5 — Load testing (k6)
1. Scripts k6 en `lab/k6/` (escenarios: home, API pública, checkout) con etapas de
   100/500/1000 VUs. Se corren localmente o en GitHub Actions (job manual
   `workflow_dispatch` para no gastar minutos en cada push).
2. `k6 --out json` → parseo → `POST /api/lab/ingest` → tabla `load_test_runs` → gráficas
   de latencia p50/p95/p99 y RPS en `/admin/lab/load`.
3. ⚠️ Solo contra preview deployments o con rate razonable contra prod (Vercel cobra por
   invocación; 1000 VUs contra prod = costo + posible firewall).

### Fase 6 — Seguridad (SAST/DAST) + a11y
1. **SAST**: job de CI con `npm audit --json` + Snyk free tier (o Semgrep) → hallazgos a
   `security_findings`.
2. **DAST**: OWASP ZAP baseline scan (acción oficial `zaproxy/action-baseline`) contra el
   preview deployment en cada PR → SARIF → ingest. Panel muestra hallazgo → fix → resuelto
   (la narrativa "encontré X y lo resolví" vale más que un scan limpio).
3. **a11y**: `@axe-core/playwright` o Lighthouse CI sobre las páginas públicas, con
   score y violaciones en una tarjeta de `/admin/lab/quality`.

### Fase 7 — Mutation testing + contract testing (remate)
1. Stryker (`@stryker-mutator/vitest-runner`) sobre `src/lib/**`: mutation score como
   tarjeta junto a coverage ("87% coverage, 74% mutation score — y sé explicar la
   diferencia"). Corre en CI como job semanal/manual (es lento).
2. Contract testing: como front y API viven en el mismo repo Astro, la versión honesta
   aquí es **schema validation con Zod compartido** entre endpoints y consumidores + tests
   de contrato sobre las respuestas de `/api/*` (snapshot del shape). Pact aplica si
   sustentas con SlideHub/microservicios separados — se documenta como extensión.

---

## Garantías de no-regresión

- Migraciones **solo aditivas** (tablas nuevas; ninguna columna existente cambia).
- Middleware de chaos: fail-open, TTL obligatorio, kill-switch, y test dedicado que
  verifica byte-a-byte que sin flags la respuesta es idéntica.
- Cada fase termina con: `astro check` + `vitest` + build local + smoke manual de las
  rutas admin existentes antes de push (y desde Fase 1, el propio pipeline lo hace).
- Nada del LAB es importado por código público existente; si el LAB se rompe, el
  portfolio y el admin actuales siguen intactos.
- Secretos nuevos (`LAB_INGEST_TOKEN`, llaves Wompi sandbox, `VERCEL_TOKEN` para CI) van
  a Vercel env + GitHub Secrets, nunca al repo.

## Orden recomendado y esfuerzo estimado

| Fase | Esfuerzo | Impacto en jurado |
|---|---|---|
| 0 Tests base | 2-3 días | Medio (habilita todo) |
| 1 CI/CD + rollback | 2-3 días | **Alto** (demo en vivo) |
| 2 Pasarela + payments-lab | 4-6 días | **Muy alto** (oro puro) |
| 3 Chaos + recuperación | 3-4 días | **Muy alto** (dramático) |
| 4 SLO / error budget | 1 día | Alto (barato y vistoso) |
| 5 k6 load testing | 2 días | Alto |
| 6 SAST/DAST + a11y | 2-3 días | Medio-alto |
| 7 Mutation + contratos | 2 días | Alto (nadie lo conoce) |

## Guion sugerido de la sustentación (10 min)

1. Dashboard: badge CI verde, coverage, mutation score, SLO con error budget.
2. Push en vivo con bug → pipeline detecta → rollback automático → ntfy en el teléfono.
3. Chaos: activar 500 → monitor detecta → push → botón PÁNICO → recuperación.
4. Payments-lab: doble clic / webhook duplicado / fuera de orden → todo resiste.
5. Cierre: gráfica k6 bajo 1000 VUs + hallazgo ZAP resuelto + experimento de caída de BD
   a mitad de transacción con verificación de consistencia.
