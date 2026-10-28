# Wiki de codebymike.net

Wiki de referencia del repositorio `dev-portfolio`: qué es el sitio, cómo está
construido, qué hace cada parte, por qué se decidió así y qué no se debe romper.
Está escrita para que **cualquier lector** (una persona nueva, un jurado, un LLM
o un agente de código) pueda entender el sistema completo sin haber estado en
las sesiones donde se construyó.

> **Foto del 28 oct 2026** (último commit revisado: `c31edc1d`, 3.303 commits
> desde el 26 abr 2026). El código manda: si algo de aquí contradice al código,
> el código tiene razón y esta wiki está desactualizada en ese punto.

## Por dónde empezar

| Si eres… | Lee en este orden |
|---|---|
| **Un agente de código que va a editar el repo** | [17 Reglas y convenciones](17-convenciones.md) → [02 Arquitectura](02-arquitectura.md) → [03 Mapa del código](03-mapa-del-codigo.md) → [16 Desarrollo y operación](16-desarrollo-y-operacion.md) → la página del área que vas a tocar |
| **Un LLM que tiene que responder preguntas sobre el sitio** | [01 Visión y contexto](01-vision-y-contexto.md) → [04 Sitio público](04-sitio-publico.md) → [20 Glosario](20-glosario.md) → la página del tema |
| **Una persona que llega al proyecto** | [01](01-vision-y-contexto.md) → [02](02-arquitectura.md) → [19 Historia](19-historia-e-iteraciones.md) → lo que te interese |
| **Jurado / evaluador académico** | [01](01-vision-y-contexto.md) → [15 Testing y calidad](15-testing-y-calidad.md) → [18 Requisitos](18-requisitos.md) → [12 Presentaciones y sustentación](12-presentaciones-y-sustentacion.md) |

## Índice

| # | Página | De qué trata |
|---|---|---|
| 01 | [Visión y contexto](01-vision-y-contexto.md) | Quién es Mike, qué problema resuelve el sitio, modelo de negocio, contexto SENA |
| 02 | [Arquitectura](02-arquitectura.md) | Stack, recorrido de un request, middleware paso a paso, bases de datos, caché, headers |
| 03 | [Mapa del código](03-mapa-del-codigo.md) | Directorios y módulos de `src/lib` agrupados por dominio |
| 04 | [Sitio público](04-sitio-publico.md) | Cada página pública, qué demuestra, i18n `/en`, SEO y AEO |
| 05 | [Panel de administración](05-panel-admin.md) | Las secciones de `/admin` y qué hace cada una |
| 06 | [Portal de clientes](06-portal-clientes.md) | `/portal`: aislamiento multi-tenant, facturas, mensajes, tiempo real, demo y respaldo |
| 07 | [Autenticación y accesos](07-autenticacion-y-accesos.md) | Las puertas del sitio: admin, portal, demo, PINs, tokens firmados |
| 08 | [Seguridad y micro-SIEM](08-seguridad-micro-siem.md) | Clasificador, rate limit durable, blocklist, anomalías, auditoría, headers, OPSEC |
| 09 | [Observabilidad y automatizaciones](09-observabilidad-y-automatizaciones.md) | Monitores, SLOs, crons, bitácora, detector de silencio, notificaciones |
| 10 | [Dinero: pagos, cobros y cotización](10-dinero.md) | Pasarela Wompi, cobros de campo, cuentas de cobro, Plano, Cotiza, tarifario, cómputo |
| 11 | [IA y agentes](11-ia-y-agentes.md) | Asesor público, asistente del panel, analista del SIEM, vigía, resumen semanal |
| 12 | [Presentaciones y sustentación](12-presentaciones-y-sustentacion.md) | Decks con PIN, control remoto, escenario de sustentación, `/final.html` |
| 13 | [Base de datos](13-base-de-datos.md) | Turso/libSQL, las ~90 tablas agrupadas, migraciones, coste de lectura |
| 14 | [Catálogo de API](14-api.md) | Todos los endpoints de `src/pages/api`, agrupados y con su protección |
| 15 | [Testing y calidad](15-testing-y-calidad.md) | Vitest, Playwright, CI/CD con rollback, SAST, DAST, mutation, a11y, k6 |
| 16 | [Desarrollo y operación](16-desarrollo-y-operacion.md) | Entorno, comandos, Docker, variables de entorno, runbooks, trampas conocidas |
| 17 | [Reglas y convenciones](17-convenciones.md) | Reglas no negociables, estilo de código, escritura, diseño |
| 18 | [Requisitos](18-requisitos.md) | Índice completo RF/RNF con estado y ubicación en el código |
| 19 | [Historia e iteraciones](19-historia-e-iteraciones.md) | Línea de tiempo, 54 iteraciones, incidentes reales y lo que enseñaron |
| 20 | [Glosario](20-glosario.md) | Vocabulario propio del proyecto (beat, Plano, Cotiza, vigía, fail-open…) |
| 21 | [Documentos relacionados](21-documentos-relacionados.md) | Planes vivos, runbooks, artículos de `/notes` y entregables SENA |

## Fuentes de verdad (no duplicar, enlazar)

Esta wiki resume y conecta; no reemplaza a las fuentes primarias:

| Tema | Fuente de verdad |
|---|---|
| Reglas para agentes | [`CLAUDE.md`](../../CLAUDE.md) |
| Requisitos, casos de uso, actores | [`src/data/documentacion.ts`](../../src/data/documentacion.ts) |
| Iteraciones y kanban | [`src/data/iteraciones-portfolio.ts`](../../src/data/iteraciones-portfolio.ts) |
| Esquema de base de datos | [`src/db/schema.ts`](../../src/db/schema.ts) |
| Precios | [`src/data/tarifario.ts`](../../src/data/tarifario.ts) |
| Catálogo de automatizaciones | [`src/data/automatizaciones.ts`](../../src/data/automatizaciones.ts) |
| Menú del panel | [`src/data/panel-nav.ts`](../../src/data/panel-nav.ts) |
| Rutas traducidas | `TRANSLATED_ROUTES` en [`src/i18n/routing.ts`](../../src/i18n/routing.ts) |
| Pendientes manuales | [`pendientes.md`](../../pendientes.md) |
| Diseño y decisiones de cada módulo | `docs/plan-*.md` (ver [21](21-documentos-relacionados.md)) |

## Nota de OPSEC sobre esta wiki

El repositorio es **público** en GitHub. Esta wiki describe la arquitectura de
seguridad a nivel de diseño, pero a propósito **no** lista las rutas señuelo,
los identificadores de reglas de detección ni valores de variables de entorno.
Quien necesite ese detalle lo encuentra en el código; la wiki no lo convierte en
un manual. Al editarla, mantén ese criterio (ver [17](17-convenciones.md#opsec)).
