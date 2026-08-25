# Plan de Implantación: módulo de Load Testing (Fase 5 - LAB)

> Plantilla aplicada: `docs/PlanImplantacion.pptx` (SENA). Caso de estudio: la
> parte de la Fase 5 de `docs/plan-lab-fases-pendientes.md` que sigue
> pendiente - persistencia, panel y workflow del load testing con k6 - porque
> es la única fase del roadmap LAB con una dependencia externa bloqueante
> (`VERCEL_TOKEN`) y por tanto la que mejor ejercita alcance, riesgos y punto
> de control de una implantación real.
>
> Los scripts k6 (`lab/k6/carga.js`, `lab/k6/estres.js`) ya están
> implementados y corridos localmente (ver hallazgos H-01..H-05 en
> `plan-lab-fases-pendientes.md`). Lo que este plan cubre es llevar sus
> resultados de "JSON en el disco de un dev" a "dato persistido y visible en
> `/admin/lab/load`", de forma controlada.

---

## 1. Qué es y alcance del plan

Documento que describe cómo pasar la integración del load testing (k6 → BD →
panel admin) de código ya escrito y probado en local a una feature operando en
`codebymike.tech`, con validación, soporte y reversa si algo falla.

**Sistema**: portfolio + panel de control (Astro 7 SSR + Turso/libSQL +
Drizzle), desplegado en Vercel (`dev-portfolio`).
**Ambiente de destino**: producción (`codebymike.tech`), tras validar en un
preview deployment de Vercel.

## 2. Alcance

| Incluido | Fuera de alcance | Restricciones |
|---|---|---|
| Migración aditiva: tabla `load_test_runs` | Scripts de escritura bajo carga contra `/api/payments/checkout` (pendiente, sin fecha) | La carga de k6 **nunca** apunta a `codebymike.tech` - solo a un preview desechable |
| `POST /api/lab/ingest` acepta `kind: 'load_test'` | Cluster/worker pool en Astro para subir el punto de quiebre (hallazgo H-02, es mejora de producto, no de este plan) | Job de k6 es `workflow_dispatch` manual, nunca en cada push (costo) |
| `GET /api/admin/lab/load` + página `/admin/lab/load` | Alertas automáticas por SLO de carga (hoy los `monitors` existentes no cubren load testing) | Requiere `VERCEL_TOKEN` en secrets de GitHub Actions antes de activar `load-test.yml` |
| Link "Load testing" en el sidebar del grupo LAB | Guardarraíl de dos mitades en `lab/k6/lib/perfil.js` (`objetivo()` + `exigirBaseLocal()`) | |

## 3. Objetivos y entregables verificables

**Objetivo general**: persistir y mostrar en el panel admin los resultados de
las corridas de k6, garantizando que ninguna corrida pueda escribir en la
base de producción ni ejecutarse contra `codebymike.tech`.

| Entregable | Criterio de aceptación |
|---|---|
| Migración `load_test_runs` | `npx drizzle-kit generate` + `migrate` aplicados contra Turso, SQL revisado a mano (regla del repo: solo aditivo) |
| Ingesta `kind: 'load_test'` | Un `POST` con `Authorization: Bearer LAB_INGEST_TOKEN` y un `summary.json` de k6 real inserta una fila correcta; un token inválido devuelve 401 |
| `/admin/lab/load` | Tarjetas con p50/p95/p99/RPS/error, gráfica por nivel de VUs, protegida por el guard admin existente (`isAdmin` en `middleware.ts`) |
| `load-test.yml` | `workflow_dispatch` con `target_url`/`max_vus`; rechaza el job si `target_url` contiene `codebymike.tech` |
| Tests | Parser puro del `summary.json` de k6 + validación del payload `load_test` en Vitest, sin BD real |

## 4. Cronograma de implantación

| # | Etapa | Actividad | Responsable | Producto esperado |
|---|---|---|---|---|
| 1 | Preparación | Cargar `VERCEL_TOKEN` en secrets de GitHub Actions; backup lógico de Turso (export) | DevOps | Secret disponible, backup verificado |
| 2 | Configuración | Migración `load_test_runs`; ampliar `ingest.ts` con `kind: 'load_test'` | Desarrollo / DBA | Migración aplicada en Turso (prod y demo) |
| 3 | Migración | No aplica migración de datos (tabla nueva, sin datos previos que migrar) | - | - |
| 4 | Pruebas | Vitest del parser + payload; corrida real de `k6` contra un preview, verificar que la fila llega a `/admin/lab/load` | QA (autovalidación) | Suite en verde + tarjeta visible en preview |
| 5 | Puesta en marcha | Merge a `main`; Vercel despliega producción; el `load-test.yml` queda disponible pero **no se dispara automáticamente** | Líder de implantación | Feature activa en prod, sin tráfico de carga generado |
| 6 | Soporte | Primera corrida real vía `workflow_dispatch` contra un preview, confirmar ingesta y monitoreo de costos en Turso/Vercel | Soporte / DevOps | Corrida de referencia documentada en `plan-lab-fases-pendientes.md` |

**Punto de control**: no se hace merge a `main` si el guard de
`lab/k6/lib/perfil.js` no rechaza una URL de `codebymike.tech`, o si la
migración no es reversible (columna nueva sin `NOT NULL` sin default).

## 5. Gestión preventiva de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Contingencia |
|---|---|---|---|---|
| Correr k6 sin querer contra producción y disparar el WAF/BotID o generar costo real de invocaciones | Baja | Crítico | Guard de dos mitades en `perfil.js` (URL + `checks.db.local` de `/api/health`); job manual, nunca en push | Revocar el preview, revisar `security_events` y facturación de Vercel/Turso del día |
| Migración deja la tabla en un estado no reversible | Baja | Alto | Migración aditiva únicamente, revisar SQL generado antes de `migrate` (regla ya establecida en `CLAUDE.md`) | `DROP TABLE load_test_runs` es seguro porque no la usa ninguna otra feature |
| `VERCEL_TOKEN` mal configurado bloquea el workflow indefinidamente | Media | Medio | Verificar el secret con una corrida de prueba de `workflow_dispatch` antes del criterio de aceptación final | Corrida manual local (opción A del plan-lab: `k6 run ... -e TARGET=<preview>`) sin depender del workflow |
| El summary de k6 no matchea el shape esperado por la ingesta y falla silenciosamente | Media | Bajo | Test de validación del payload `load_test` con un `summary.json` real de referencia | Ingesta ya es fail-open (patrón del repo); revisar `security_events`/logs y reprocesar el JSON a mano |

## 6. Roles y RACI

Equipo real: una sola persona (Mike) ejerciendo los distintos roles - el plan
los separa igual, porque cada actividad necesita su encabezado claro aunque
la ejecute la misma persona.

| Actividad | R (Responsable) | A (Aprobador) | C (Consultado) | I (Informado) |
|---|---|---|---|---|
| Migración `load_test_runs` | DBA | Líder de implantación | - | - |
| Ingesta + endpoint admin | Desarrollo | Líder de implantación | DBA | - |
| Página `/admin/lab/load` | Desarrollo | Líder de implantación | QA | - |
| Workflow `load-test.yml` + secret `VERCEL_TOKEN` | DevOps | Líder de implantación | - | Soporte |
| Corrida de referencia y validación de costo | QA | Líder de implantación | DevOps | - |

## 7. Recursos y herramientas

| Rol | Qué hace en este plan |
|---|---|
| Líder de implantación | Aprueba el paso a `main`, decide si se dispara `load-test.yml` |
| DevOps | Secret `VERCEL_TOKEN`, revisión del workflow y de costos Vercel/Turso |
| Desarrollo | Ingesta, endpoint, página admin |
| DBA | Migración Drizzle, revisión del SQL generado |
| QA | Corre `k6` contra el preview, valida que los criterios de aceptación queden en verde |

**Canal**: bitácora de la corrida de referencia en
`docs/plan-lab-fases-pendientes.md` (ya es el patrón del repo para dejar
evidencia de hallazgos, ver H-01..H-05 de `estres.js`).

## 8. Evidencia de cierre

- [ ] Migración aplicada en Turso (prod + demo)
- [ ] Tests del parser/payload en verde
- [ ] Corrida de k6 real contra un preview con fila visible en `/admin/lab/load`
- [ ] `load-test.yml` verificado con `workflow_dispatch` de prueba
- [ ] Este documento actualizado con la fecha de la corrida de referencia y cualquier hallazgo nuevo
