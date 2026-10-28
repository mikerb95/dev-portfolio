# 15 · Testing y calidad

Guía pública de los niveles de prueba: `/docs/testing` (datos en
`src/data/testing.ts`). Verificación y validación: `/docs/verificacion-validacion`
(`src/data/vyv.ts`). Plan de pruebas SENA: `docs/plan-pruebas-codebymike.pdf`.

## Cifras (foto del 28 oct 2026)

- **Vitest**: ~190 archivos en `tests/`, ~2.700 casos `it`/`test`.
- **Playwright**: 14 specs en `e2e/`, ~80 tests.
- **Stryker**: mutation testing sobre `src/lib/**` (umbrales high 80 / low 60 /
  break 50; score reportado en el README: 87,2 %).

(El README dice "1.530 tests en 88 archivos" y "50 e2e en 6 specs": son cifras
de una etapa anterior.)

## Pirámide

| Nivel | Herramienta | Dónde | Notas |
|---|---|---|---|
| Unitario (lógica pura) | Vitest | `tests/*.test.ts` | La mayoría. Módulos de `src/lib` sin BD. |
| Integración con BD real | Vitest + libSQL en **archivo temporal** | `tests/payments.test.ts`, `cobros-db.test.ts`, `plano-db.test.ts`… | Mock de `../src/db` con `vi.mock`, `CREATE TABLE` en `beforeAll`, limpieza en `beforeEach`. Nunca `:memory:`. |
| Contratos de API | Zod | `tests/contracts.test.ts`, `src/lib/contracts.ts` | Congela la forma de las respuestas. |
| Geometría y notación de diagramas | Vitest | `tests/uml-*.test.ts`, `bpmn.test.ts`, `red.test.ts` | Todo motor de diagrama propio lleva test de geometría **y** de notación. |
| Motion | Vitest | `tests/motion-*.test.ts` | Se prueba la parte pura (datos, geometría, guiones). |
| Guardas de seguridad | Vitest | `security-*.test.ts`, `i18n-routing-guards.test.ts`, `portal-isolation.test.ts`, `private-headers.test.ts` | Las garantías del middleware, una por una. |
| E2E | Playwright (Chromium) | `e2e/*.spec.ts` | Bases libSQL desechables sembradas en `webServer.command`. |
| Mutation | Stryker | `stryker.config.json`, workflow semanal | ¿Algún test se entera si rompo esta línea? |
| SAST | npm audit + CodeQL | `security.yml` | Push, PR y semanal. |
| DAST | OWASP ZAP baseline | `dast.yml` | Contra el preview de cada PR. |
| Accesibilidad | axe-core | `a11y.yml`, `scripts/a11y-scan.mjs` | Páginas públicas. |
| Carga y estrés | k6 | `lab/k6/`, `load-test.yml` | Contra `sqld` local, no contra un preview. |
| Usabilidad | Manual guiada | `/docs/usability-testing` | Datos en `documentacion.ts`. |
| Producción | Health check post-deploy + rollback | `ci.yml` | Ver abajo. |

Todos los resultados de SAST, DAST, a11y, mutation, k6 y CI se ingieren al
panel (`/api/lab/ingest`) como hallazgos o corridas con estado, y alimentan
`/lab` y `/admin/lab/*`.

## CI/CD (`.github/workflows/ci.yml`)

1. **Test + Build** (`quality`): `npm ci` → `npm run guion:check` (guion de la
   sustentación alineado con el mazo) → `npx astro check` → Vitest con
   cobertura → `npm run build` → métricas.
2. **E2E (Playwright)**: Chromium, sube el reporte si falla.
3. **Verificar deploy + rollback** (solo push a `main`): espera a que Vercel
   despliegue ese commit, hace **health check**, y si falla hace **rollback
   automático** al deploy anterior, avisa por ntfy, reporta la corrida al panel
   LAB y falla el job.

Otros workflows: `security.yml`, `a11y.yml`, `dast.yml`, `mutation.yml`
(domingos), `load-test.yml` (manual), `distribute-note.yml` (distribuye una nota
nueva de `/notes` a otras plataformas).

## E2E en detalle

Specs: `analista`, `asesor-vivo`, `asistente`, `auth`, `computo`, `contact`,
`cotizador-hero`, `demo`, `infra`, `marketing`, `payments`, `portal`,
`public`, `resumen`.

- Bases desechables: se siembran en `webServer.command` (no en `globalSetup`,
  que corre después de que el servidor arrancó).
- `npm run test:e2e:server` corre contra `sqld` en Docker en vez de archivo.
- `e2e/fake-anthropic.mjs` simula la API de Claude.
- **Centinela** en la base real para demostrar que la demo no la ve.
- Cada test usa su propia IP (por el rate limit).
- Trampa conocida: sin GPU, clics y capturas en `/admin` pueden expirar; usar
  `click({ force: true })` y lanzar Chromium con `--use-angle=gl-egl` para que
  produzca frames.

## Verificación visual del motion

Las páginas con motion se verifican con **capturas reales** antes de entregar
(no basta con que compile). Chrome oculto da `requestAnimationFrame` 0; usar
Playwright headless con `--use-angle=gl-egl`. Lenis ignora `scrollTo` nativo.

## Informes

- `npm run test` + `scripts/report-tests.mjs` → `src/data/ejecucion-pruebas.json`
  → `/docs/ejecucion-pruebas`.
- `informes/tests.html`, `informes/tests-junit.xml`.
- `/docs/reportes-pruebas`: referencia de reporters.
- Trazabilidad HU ↔ casos de prueba: `docs/matriz-trazabilidad.md`.

Artículos: `/notes/e2e-que-prueban-lo-que-de-verdad-importa`,
`/notes/mutar-el-codigo-para-saber-si-mis-tests-sirven`,
`/notes/no-solo-un-scan-verde`, `/notes/el-bloqueo-que-no-era-una-credencial`
(k6), `/notes/chaos-engineering-que-no-puede-hacerte-dano`.
