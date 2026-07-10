# Plan — Módulo de Documentación del proyecto (`/admin/docs`)

> Estado: **Fase 1 implementada** (jul 2026). Este plan es el documento vivo del módulo:
> alcance, arquitectura, contenido de cada subpágina, fuentes de verdad y fases futuras.

## 1. Objetivo

Centralizar en el panel admin la documentación de ingeniería del portfolio
(codebymike.tech) con el mismo rigor que un proyecto formal: requerimientos,
casos de uso, diagramas UML y un tablero kanban XP del propio proyecto,
replicando el patrón ya probado en DobleYo (`IteracionesBoard`).

## 2. Alcance

Una sección **Documentación** en la sidebar del admin con estas subpáginas:

| Ruta | Contenido | Fuente de verdad |
|---|---|---|
| `/admin/docs` | Hub: visión del sistema, alcance, mapa de subpáginas, stack | `src/data/documentacion.ts` |
| `/admin/docs/requerimientos-funcionales` | RF por módulo, con prioridad y estado | `src/data/documentacion.ts` |
| `/admin/docs/requerimientos-no-funcionales` | RNF por categoría ISO/IEC 25010, con métrica verificable | `src/data/documentacion.ts` |
| `/admin/docs/casos-de-uso` | Actores + catálogo de CU + diagrama de casos de uso | `src/data/documentacion.ts` |
| `/admin/docs/casos-de-uso-extendidos` | CU en formato extendido (pre/post, flujos, excepciones) | `src/data/documentacion.ts` |
| `/admin/docs/diagrama-secuencia` | Secuencias: login OAuth, check de monitor→alerta, middleware de seguridad, contacto | Mermaid inline |
| `/admin/docs/diagrama-componentes` | Componentes/despliegue: browser → Vercel (Astro SSR + middleware + APIs) → Turso/Blob/GitHub/ntfy/cron-job.org | Mermaid inline |
| `/admin/docs/diagrama-clases` | Clases/entidades derivadas de `src/db/schema.ts` (CRM, observabilidad, seguridad, lab) | Mermaid inline |
| `/admin/docs/diagrama-objetos` | Instantáneas concretas de instancias reales (proyecto+servicios, pago+eventos+IP bloqueada) | Mermaid inline |
| `/admin/docs/kanban` | Tablero XP del proyecto portfolio (iteraciones reales del historial git) | `src/data/iteraciones-portfolio.ts` |

## 3. Decisiones de arquitectura

- **Datos como código**: RF/RNF/CU viven en `src/data/documentacion.ts` tipados;
  las páginas solo renderizan. Un cambio de requerimiento = un commit revisable.
- **Kanban sin duplicación**: `IteracionesBoard.astro` se parametrizó con props
  (`pares`, `columnas`, `iteraciones`, `commitsPorMes`, `repo`, `subtitle`,
  `showBiblio`) manteniendo los datos de DobleYo como default, así
  `/projects/dobleyo` no cambia y `/admin/docs/kanban` reutiliza el mismo motor
  con `src/data/iteraciones-portfolio.ts`.
- **Iteraciones ancladas al historial real**: rangos y conteos de commits salen
  de `git log` de `mikerb95/dev-portfolio` (abr: 80, may: 21, jun: 104,
  jul 1–5: 126, jul 6–9: 107). Cada historia lleva DoD inferido de lo entregado.
- **Diagramas con Mermaid 11 (dependencia npm, no CDN)**: el CSP de `/admin` es
  `script-src 'self'`, así que `mermaid` se instaló como dependencia y se
  importa localmente (`import mermaid from 'mermaid'`) en cada página de
  diagrama; Vite lo bundlea con el resto del JS del sitio. Texto de los
  diagramas versionable en el repo, render en el cliente, sin costo en el
  sitio público (solo se carga en páginas admin).
- **Navegación**: una sola entrada "Documentación" en la sidebar (grupo
  *Proyecto*); las subpáginas se navegan con `DocsNav.astro` (tabs horizontales
  con estado activo por ruta).
- **Protección**: las rutas cuelgan de `/admin/*`, cubiertas por el middleware
  existente (sesión GitHub + allowlist). No requieren cambios de auth.

## 4. Convenciones de IDs

- `RF-<módulo><nn>`: 0x público, 1x auth, 2x CRM, 3x finanzas, 4x observabilidad,
  5x LAB, 6x seguridad, 7x sistema.
- `RNF-<nn>` agrupados por categoría ISO 25010.
- `CU-<nn>` con trazabilidad a RF (`rf: []`).
- Historias del kanban: `PF-<iter>-<nn>`.

## 5. Checklist de la Fase 1 (esta entrega)

- [x] Grupo "Documentación" en `Sidebar.astro` con enlace a `/admin/docs`
- [x] `DocsNav.astro` compartido entre las 10 subpáginas
- [x] `documentacion.ts`: ~45 RF, ~18 RNF, 6 actores, 18 CU, 6 CU extendidos
- [x] Páginas de RF, RNF, CU y CU extendidos (render desde datos)
- [x] 4 diagramas de secuencia, 1 de componentes, 3 de clases, 2 de objetos (Mermaid)
- [x] `mermaid` instalado como dependencia npm (bundle local, respeta CSP `script-src 'self'`)
- [x] `iteraciones-portfolio.ts` con 5 iteraciones e historias con DoD
- [x] `IteracionesBoard` parametrizado (default DobleYo intacto)
- [x] Página kanban montando el board con datos del portfolio
- [ ] Build de producción verificado (`npm run build`)

## 6. Fases futuras

- **Fase 2 — Vivo**: derivar el estado de RF desde los tests (cada RF apunta a
  su spec en `tests/`); commits por iteración vía API de GitHub en runtime.
- **Fase 3 — Trazabilidad completa**: matriz RF ↔ CU ↔ historias ↔ tests en el hub.
- **Fase 4 — Export**: exportar la documentación como PDF/HTML estático para
  entregas académicas (SENA) o comerciales, reutilizando el patrón `export/` de DobleYo.
- **Fase 5 — Demo pública**: versión read-only de `/admin/docs` en la vitrina
  pública (`/tools`), alineada con el pendiente "demo read-only del admin".

## 7. Mantenimiento

- Nuevo requerimiento → añadirlo a `documentacion.ts` (estado `planeado`),
  promoverlo a `parcial`/`implementado` al entregarlo.
- Cierre de iteración → nueva entrada en `iteraciones-portfolio.ts` con
  `git rev-list --count --since --until` para el conteo de commits.
- Cambio de schema → actualizar el diagrama de clases en la misma PR.
