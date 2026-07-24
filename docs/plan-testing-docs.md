# Plan — `/docs/testing`: guía visual interactiva del pipeline de pruebas

> Estado: **implementado** (jul 22 2026) — Fases 1-5 completas, más las dos
> diapositivas en el deck y el KPI en el índice de `/docs`. Objetivo: una página dentro de
> `/docs` que explique **todo** el testing del proyecto a compañeros de
> clase que no conocen el repo, con un recorrido visual e interactivo del
> pipeline completo — desde `npm test` en el portátil hasta el rollback
> automático en producción.

---

## 1. Por qué esta página (y por qué una sola)

La documentación actual (`/docs`) cubre requerimientos, casos de uso y UML,
pero el testing aparece disperso: una línea en el stack técnico
(«Vitest + coverage v8»), la página de *usability testing*, el panel privado
`/admin/lab/pipeline`, la vitrina `/lab` y cuatro artículos en `/notes`.

Un compañero que quiere entender **cómo se prueba este sistema** no tiene un
punto de entrada. Esta página es ese punto de entrada: autocontenida,
pública, navegable en 10 minutos por encima y en 40 minutos a fondo.

Ruta: **`/docs/testing`**, pestaña «Testing» en `DocsNav`, justo antes de
«Usability testing» (que pasa a leerse como el capítulo de validación con
usuarios de esta misma historia).

---

## 2. Inventario real — el «TODO» que la página debe cubrir

Medido sobre el repo el 22 jul 2026 (no son cifras estimadas: salen de
correr la suite y leer los workflows).

### 2.1 Niveles de prueba que existen hoy

| # | Nivel | Herramienta | Dónde vive | Volumen real | Cuándo corre |
|---|-------|-------------|------------|--------------|--------------|
| 1 | Unitario / lógica pura | Vitest | `tests/*.test.ts` (40 archivos) | **521 tests**, 201 suites, 100% verdes | cada push y PR (`ci.yml`), y en local |
| 2 | Integración con BD real | Vitest + libSQL en archivo temporal | `tests/payments.test.ts`, `cobros-db.test.ts`, `security-blocklist-db.test.ts`, `portal-*` | 122 de los 521 | igual que arriba |
| 3 | Contratos de API | Vitest + Zod | `tests/contracts.test.ts` + `src/lib/contracts.ts` | 5 tests / 4 endpoints | `npm run test:contracts` y en CI |
| 4 | End-to-end | Playwright (Chromium) | `e2e/*.spec.ts` (6 specs) | **45 tests** | job `e2e` en `ci.yml` |
| 5 | Cobertura | `@vitest/coverage-v8` | `coverage/` (gitignored) | líneas **54.92%**, ramas 55.89%, funciones 53.95% sobre `src/lib/**` | con `--coverage` en CI |
| 6 | Mutation testing | Stryker + runner de Vitest | `stryker.config.json` | umbrales high 80 / low 60 / break 50 | `mutation.yml`: manual + domingos 08:00 UTC |
| 7 | SAST dependencias | `npm audit` → panel LAB | `scripts/npm-audit-scan.mjs` | hallazgos reales en `security_findings` | `security.yml`: push, PR y domingos 06:00 |
| 8 | SAST código | CodeQL (`javascript-typescript`) | `security.yml` | pestaña Security de GitHub | push y PR |
| 9 | Accesibilidad | axe-core + Playwright | `scripts/a11y-scan.mjs` | violaciones WCAG reales ingeridas al LAB | `a11y.yml`: push y PR |
| 10 | Verificación en producción | `curl` + `/api/health` + `vercel rollback` | job `verify-production` de `ci.yml` | 3 health checks, 2/3 para aprobar | solo push a `main` |
| 11 | Chaos engineering | flags en BD + middleware | `src/lib/chaos.ts`, `/admin/lab/chaos` | 12 tests que prueban al propio chaos | manual, TTL acotado |
| 12 | Monitoreo sintético continuo | monitores propios + cron externo | `/admin/monitors`, `/status` | 8 monitores, checks ~5 min | cron-job.org, 24/7 |
| 13 | Usabilidad con usuarios | metodología de 6 pasos | `/docs/usability-testing` | 1 flujo (descarga de CV) | manual |
| 14 | Carga (k6) | *pendiente* | `docs/plan-lab-fases-pendientes.md`, Fase 5 | — | bloqueado por `VERCEL_TOKEN` |

Un compañero debe salir entendiendo **por qué son 15 cosas distintas y no
una sola llamada «pruebas»**: cada nivel responde una pregunta que ninguno
de los otros responde.

### 2.2 Las decisiones de ingeniería que hay que contar

Esto es lo que diferencia la página de un tutorial genérico. Cada una es una
decisión real, tomada por un motivo, documentada en los comentarios del repo:

1. **libSQL en archivo temporal, nunca `:memory:`.** Una transacción abre
   otra conexión y una BD en memoria no comparte tablas entre conexiones.
   Los tests de concurrencia/UNIQUE fallarían de forma incomprensible.
   (`tests/payments.test.ts`, `cobros-db.test.ts`.)
2. **Migrar los tests con el migrador de producción**, no con DDL a mano.
   Ya mordió una vez: el DDL manual se desincronizó del esquema cuando otro
   trabajo agregó columnas. (`tests/contracts.test.ts`.)
3. **Sembrar los e2e en `webServer.command`, no en `globalSetup`.**
   Playwright levanta el webServer *antes* de `globalSetup`; sembrar allí
   llega tarde y el servidor arranca contra una base que no existe.
4. **`astro dev` y no `astro preview` en e2e.** El adaptador de Vercel no
   soporta `preview`; el middleware —que es justo lo que los e2e verifican—
   corre igual en dev.
5. **Bases desechables con centinela.** La base «principal» de e2e se siembra
   con el prefijo `CENTINELA-REAL `; un test afirma que ese texto **jamás**
   aparece en la demo. Es un test de aislamiento de datos, no de UI.
6. **Módulos isomorfos separados.** Un módulo que se importa desde el
   navegador no puede importar `node:crypto` ni `../db`: por eso existen
   `cobros.ts` / `cobros-crypto.ts` y `payments-state.ts` puro. El testing
   condicionó la arquitectura, no al revés.
7. **Cobertura ≠ calidad; por eso hay mutation testing.** Cobertura dice
   «esta línea se ejecutó»; el mutation score dice «si la rompo, ¿algún test
   se entera?». Un porcentaje alto puede convivir con tests que no afirman nada.
8. **Mutation testing NO corre en cada push, a propósito.** Mutar cada línea
   y re-ejecutar la suite contra cada mutante son miles de test-runs. Manual
   o semanal; nunca bloqueando un PR.
9. **Los scanners no rompen el pipeline (`continue-on-error`).** El objetivo
   es registrar y hacer visible, no bloquear. El semáforo real vive en
   `/admin/lab/security`.
10. **Todos los secrets de CI son opcionales.** Sin `VERCEL_TOKEN` no hay
    rollback pero el pipeline no falla; sin `LAB_INGEST_TOKEN` no se reporta
    al panel pero el scan corre igual. Mismo principio *fail-open* que el
    middleware.
11. **El último test corre en producción.** `verify-production` espera a que
    el SHA del commit aparezca en `/api/health` (máx 8 min), hace 3 health
    checks, exige 2/3 sanos y si no, `vercel rollback` + push a ntfy.
12. **Chaos engineering: probar que el sistema falla bien.** Inyectar
    latencia o 500 en rutas concretas, con TTL acotado y rutas protegidas que
    no se pueden romper nunca.

### 2.3 Restricción OPSEC (no negociable)

`/docs` es público. El `CLAUDE.md` del repo prohíbe publicar en páginas
públicas rutas honeypot, nombres exactos de reglas de detección o cualquier
cosa que sirva de manual de ataque.

Consecuencia concreta para esta página: los tests de
`security-honeypot.test.ts`, `security-classify.test.ts` y
`security-blocklist*.test.ts` se describen **por lo que garantizan**
(«49 tests fijan el comportamiento del clasificador de amenazas: qué se
considera sospechoso, qué no, y que un falso positivo no bloquea a un
usuario legítimo») y **nunca** citando patrones, rutas ni umbrales
literales. Nada de copiar fragmentos de esos archivos a la página.

---

## 3. Arquitectura de la página

### 3.1 Archivos

```
src/data/testing.ts              # datos tipados: niveles, decisiones, etapas del pipeline, glosario
src/pages/docs/testing.astro     # la página
src/components/docs/PipelineMap.astro    # mapa interactivo del pipeline (SVG/CSS, sin libs)
src/components/docs/TestAnatomy.astro    # anatomía de un test, con capas conmutables
src/components/DocsNav.astro     # + pestaña «Testing»
src/pages/docs/index.astro       # + tarjeta en el mapa de documentación + KPI de tests
```

Se respeta la convención del repo: **el contenido vive como datos tipados**
en `src/data/`, la `.astro` solo pinta. Un cambio de contenido es un commit
revisable.

### 3.2 Datos: qué es estático y qué es real-time

| Dato | Fuente | Por qué |
|------|--------|---------|
| Nº de tests, cobertura, mutation score, último resultado | **SSR contra la tabla `ci_runs`** (última corrida de `main`) | `coverage/` está gitignored, así que no se puede leer en build. `ci_runs` ya recibe `testsPassed`, `testsFailed`, `coveragePct`, `mutationScore`, `conclusion`, `healthOk` desde `ci.yml`. Mismo patrón que `/status`: query agregada directa en SSR, cache `s-maxage=300` que ya pone el middleware. |
| Hallazgos SAST/a11y (conteo por severidad) | SSR agregado sobre `security_findings` | Solo agregados por severidad y fuente — nunca el detalle, por OPSEC. |
| Inventario de niveles, decisiones, glosario | `src/data/testing.ts` | Es prosa curada, no métrica. |
| Nº de archivos de test y de e2e | `import.meta.glob` sobre `tests/` y `e2e/` en build | Se cuenta solo, no se desactualiza. *(Alternativa si `glob` fuera de `src/` da problemas: constante en `testing.ts` con fecha de medición.)* |

Fallback obligatorio: si `ci_runs` está vacía o la query falla, la página
muestra los valores de referencia de `testing.ts` con una nota «última
medición manual: 22 jul 2026». **Fail-open**, como todo lo demás del repo.

---

## 4. Secciones de la página (guion completo)

### § 0 — Hero: «¿Qué pasa cuando hago `git push`?»

Una franja con 6 números en vivo: tests, cobertura, mutation score, e2e,
hallazgos abiertos, y el resultado del último deploy (con su SHA corto y
enlace al run de GitHub Actions). Debajo, una frase que fija el marco:

> «Este proyecto tiene 521 pruebas automáticas repartidas en 15 niveles
> distintos. Ninguno sobra: cada uno responde una pregunta que los otros no
> pueden responder.»

### § 1 — La pirámide de pruebas, con los números de este proyecto

Pirámide interactiva (no una imagen): 4 estratos —unitarias, integración,
contratos, e2e— dimensionados proporcionalmente a los tests reales. Al pasar
el cursor o tocar un estrato: cuántos hay, qué preguntan, cuánto tardan, qué
NO detectan. Encima de la pirámide, una banda aparte para lo que no encaja
en ella (SAST, a11y, chaos, carga, monitoreo, usabilidad), porque
presentarlos como «más pruebas» sería mentir sobre su naturaleza.

### § 2 — El mapa del pipeline (el corazón de la página)

Diagrama horizontal con 6 etapas: **local → push → CI → deploy → verificación
en prod → operación continua**. Cada etapa es un nodo clicable; al abrirlo se
despliega un panel con:

- qué corre exactamente (con el comando real y el archivo del workflow),
- cuánto tarda,
- qué lo dispara,
- qué pasa si falla (¿bloquea? ¿solo registra? ¿revierte?),
- enlace al archivo del repo en GitHub.

Un control **«Simular una corrida»** anima el recorrido etapa por etapa con
tres finales seleccionables:
1. **Todo verde** — llega a producción y se queda.
2. **Un test falla** — el pipeline para en CI; nada llega a producción.
3. **Deploy insano** — pasa CI, falla el health check post-deploy, se ejecuta
   `vercel rollback` y sale un push a ntfy. Este es el escenario que a nadie
   le enseñan en clase y es el que mejor se cuenta visualmente.

Implementación: SVG inline + clases CSS conmutadas por un script pequeño con
`data-*` attributes. Sin librerías, sin `innerHTML` con datos de BD (o con
`esc()` si hace falta), compatible con la CSP en modo enforce.

### § 3 — Anatomía de un test, en vivo

Se toma **un** test real —`tests/payments.test.ts`, idempotencia de cobros—
y se disecciona con 4 capas conmutables sobre el mismo bloque de código:

1. *arrange* (BD temporal + migración con el migrador de producción),
2. *act* (dos llamadas concurrentes con la misma idempotency key),
3. *assert* (un único pago creado),
4. *por qué importa* (cobrarle dos veces a un cliente es un bug con
   consecuencias legales, no un bug de UI).

Cada capa se resalta en el código y muestra su explicación al lado. Es la
sección que enseña *cómo se escribe* un test, no solo que existen.

### § 4 — Los 15 niveles, en fichas

Una ficha por nivel, filtrable por **«¿cuándo corre?»** (en cada push /
semanal / manual / continuo) y por **«¿bloquea el deploy?»** (sí / no).
Cada ficha: pregunta que responde, herramienta, volumen real, coste
(velocidad), y su punto ciego. Sin `border-left` de color — se distingue con
un *dot* de color junto al título y tinte de fondo en hover.

### § 5 — Las 12 decisiones (§ 2.2), como tarjetas «problema → decisión»

Formato fijo: **el síntoma** («los tests de concurrencia fallaban sin
sentido») → **la causa** → **la decisión** → **dónde vive en el repo**. Estas
son las tarjetas que hacen que la página valga para un compañero, no el
listado de herramientas.

### § 6 — Cobertura vs. mutation score

Comparación lado a lado con un ejemplo mínimo y real: una función con 100%
de cobertura cuyo test no afirma nada, y el mutante que sobrevive. Se
muestra el reporte de Stryker acotado a `money.ts` (el mismo recorte que ya
usa `tests/mutation.test.ts` como fixture) y se explican los estados
*Killed / Survived / NoCoverage / Timeout*.

### § 7 — Lo que aún no está

Honestidad explícita: k6 (Fase 5, bloqueada por `VERCEL_TOKEN`), la columna
de evidencia de usabilidad pendiente de participantes reales, y la ausencia
de tests de regresión visual. Un proyecto que declara sus huecos es más
creíble que uno que finge cobertura total — y en una sustentación, es la
diferencia entre parecer honesto y parecer ingenuo.

### § 8 — Cómo correrlo tú mismo

Bloque de comandos copiables (`npm test`, `test:coverage`, `test:e2e`,
`test:e2e:ui`, `test:mutation`, `test:contracts`) con el aviso de Node ≥22.12
vía nvm. Más los enlaces a los artículos de `/notes` que cuentan cada pieza
en largo (`e2e-que-prueban-lo-que-de-verdad-importa`,
`mutar-el-codigo-para-saber-si-mis-tests-sirven`, `no-solo-un-scan-verde`,
`chaos-engineering-que-no-puede-hacerte-dano`).

### § 9 — Glosario

12–15 términos (flaky, mutante, fixture, seed, SAST, e2e, error budget,
idempotencia, fail-open, health check, rollback, contrato) con definición de
una línea. Un compañero de clase no necesariamente sabe qué es un mutante.

---

## 5. Interactividad — inventario y coste

| Interacción | Complejidad | Valor |
|-------------|-------------|-------|
| Pirámide con estratos conmutables | baja | alto |
| Mapa de pipeline clicable | media | **el más alto** |
| Simulación de corrida (3 finales) | media-alta | **el más alto** — es lo que se recuerda |
| Anatomía de test por capas | media | alto |
| Filtros de las fichas de nivel | baja | medio |
| Números en vivo desde `ci_runs` | baja | alto (prueba que no es una maqueta) |
| Diagrama Mermaid de flujo de datos de CI → panel LAB | baja (ya hay patrón) | medio |

Todo en JS propio y CSS. Sin dependencias nuevas: el repo ya tiene Mermaid
para los diagramas y no hace falta nada más.

**Accesibilidad** (el repo corre axe en cada push, así que esta página tiene
que pasar su propio escáner): nodos del pipeline como `<button>` reales con
`aria-expanded`, navegación por teclado, la animación de la simulación
respetando `prefers-reduced-motion`, y todo el contenido de los paneles
presente en el DOM (no inyectado) para que sea legible sin JS.

---

## 6. Fases de implementación

| Fase | Alcance | Entregable verificable |
|------|---------|------------------------|
| **1** | `src/data/testing.ts` con los 15 niveles, 12 decisiones y glosario; página estática con §§ 1, 4, 5, 8, 9; pestaña en `DocsNav` | página navegable y completa en contenido, sin interactividad |
| **2** | `PipelineMap.astro`: mapa clicable + simulación de 3 finales | § 2 funcionando |
| **3** | Números en vivo desde `ci_runs` + `security_findings` con fallback | § 0 con datos reales |
| **4** | `TestAnatomy.astro` (§ 3) y § 6 cobertura vs. mutación | páginas de detalle |
| **5** | § 7, enlaces a `/notes`, tarjeta en `/docs`, KPI de tests en el índice, y pasada de axe local | página cerrada |

Cada fase deja la página en un estado publicable; ninguna deja algo a medias
en producción.

---

## 7. Riesgos y cómo se mitigan

- **Desactualización.** Mitigado atando las métricas a `ci_runs` en vez de
  a constantes. Lo que sí queda estático (inventario de niveles) cambia
  pocas veces al año y va con fecha visible.
- **OPSEC.** Regla explícita en § 2.3: la sección de seguridad describe
  garantías, no reglas. Revisión manual antes de publicar.
- **Página demasiado larga.** Mitigado con un índice lateral pegajoso y con
  la promesa del hero: se puede leer en dos profundidades.
- **CSP.** Nada de `innerHTML` con datos de BD sin `esc()`, nada de scripts
  externos.

---

## 8. Preguntas abiertas

1. **¿Pública o tras login?** La propuesta es pública (como el resto de
   `/docs`), lo que además la hace enlazable desde el portafolio. La
   alternativa es tratarla como `/docs/presentacion` y exigir sesión.
2. **¿Un artículo en `/notes` además de la página?** Por la regla del repo
   («cada etapa mayor termina con su artículo»), esto lo merecería. Pero
   ya hay 4 artículos sobre testing; quizá aquí el entregable es la página
   y no un quinto artículo.
3. **¿Entra en `/docs/presentacion`?** Si esta página es material de
   sustentación, convendría una o dos diapositivas nuevas en el deck
   apuntando al mapa del pipeline.
4. **¿Se incluye la simulación de corrida en la Fase 1** o se acepta que la
   primera versión publicada sea estática?
