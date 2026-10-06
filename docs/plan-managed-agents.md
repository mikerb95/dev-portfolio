# Plan: vigía del repo con Claude Managed Agents

Estado: **fase 1 ✅** (6 oct 2026); fases 2 a 6 pendientes. Material del workshop de Managed
Agents de la comunidad Claude Bogotá (sábado 24 oct 2026; propuestas hasta el
domingo 11 oct).

## Qué es

Un agente que cada noche clona el repositorio, corre `npm audit`, los tests y
`astro check`, mide los headers de codebymike.net y deja un informe priorizado.
No repite lo que ya dice el CI (`security.yml`, `a11y.yml`, `dast.yml`): cruza
esas listas con el código real y dice qué importa.

Corre en **Claude Managed Agents** (beta): Anthropic pone el bucle del agente
y un contenedor por sesión. Es la primera pieza del sitio que necesita un
contenedor de verdad (clonar, instalar, ejecutar), algo que una función de
Vercel no puede hacer.

## Qué NO cambia (decisión del 6 oct 2026)

Se evaluó migrar lo existente y se descartó:

| Pieza | Decisión | Por qué |
|---|---|---|
| Analista del SIEM (producción) | Se queda en Messages API con bucle propio | Sus herramientas leen Turso. Moverlas al contenedor obligaría a entregarle las claves de la base y rompería la seudonimización de IPs; dejarlas como custom tools no ahorra código y lo saca de `cron_runs`. |
| Asistente del panel | Igual | Comparte el bucle del analista. |
| Terminales con Agent SDK (`agents/analista-siem`, `agents/asistente`) | Se quedan | Corren contra la base local, muestran la IP real sin devolverla al modelo y sirven para depurar. Reemplazarlas por `ant beta:sessions connect` exigiría un manejador local de custom tools: más código, no menos. |
| Asesor público, Plano, resumen semanal | Igual | Llamadas sueltas o chat sin estado; no son agentes. |
| CI de seguridad | Igual | El vigía lo complementa, no lo sustituye. |

## Piezas

```
agents/vigia/agent.md          agente: frontmatter = config, cuerpo = prompt
agents/vigia/environment.yaml  contenedor en la nube, red cerrada
claude-lock.json               IDs que escribe `ant apply` (se versiona)
```

Se sincronizan con `ant apply agents/vigia/agent.md agents/vigia/environment.yaml`
(CLI `ant` 1.38.0, binario de GitHub releases; no está en npm). Para cambiar
el prompt: editar el archivo y volver a aplicar; el agente sube de versión.

## Decisiones de diseño

### 1. Red cerrada por defecto

`networking: limited` con salida solo a `github.com`, `codebymike.net`,
`nodejs.org` y los registros de paquetes. Las herramientas `web_search` y
`web_fetch` están apagadas aparte, porque corren en servidores de Anthropic y
la red del entorno no las gobierna. Los headers se miden con `curl` desde el
contenedor.

### 2. Fase 1 sin credenciales

El repo es público, así que el agente clona con `git` sin token. El recurso
`github_repository` de la API exige un token aunque el repo sea público; se
usará cuando haga falta escribir (fase 3). Sin credenciales en la sesión,
nada de lo que corra puede escribir fuera del contenedor, y por eso el toolset
puede ir en `auto` (el servidor evalúa cada comando).

### 3. Tope de gasto por sesión

Cada sesión lleva `budget` (US$2 en las pruebas). Al llegar al tope la sesión
se pausa con `stop_reason: budget_reached`; no se termina ni sigue gastando.
Lo que cuenta: tokens a precio de lista, US$0,08 por hora de contenedor y
US$10 por cada 1.000 búsquedas web (apagadas aquí).

### 4. Salida en dos formatos

`/mnt/session/outputs/informe.md` para leer y `informe.json` con una forma fija
(`estado`, `hallazgos[]` con `id` estable, `prioridad`, `categoria`,
`evidencia`, `arreglo`) para que el panel lo pueda ingerir sin parsear prosa.
El `id` estable es lo que permitirá a la memoria no repetir hallazgos.

### 5. Integración con la observabilidad propia (fase 2)

Los webhooks de Managed Agents son avisos delgados (tipo + ID), firmados, sin
orden garantizado, y se **pierden** tras tres intentos fallidos. Por eso:
- El webhook registra la corrida en `cron_runs` como un cron más
  (`vigia-nocturno`, intervalo esperado 24 h). Si un aviso se pierde, el
  detector de silencio (`src/lib/cron-silencio.ts`) lo nota como cualquier
  otro cron callado.
- El estado se lee siempre de la sesión (`sessions.retrieve` y la lista de
  eventos), nunca del orden de llegada.
- Fail-open: si el webhook falla, el sitio no se entera.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 1 | Agente + entorno con `ant apply`, corrida manual con tope, informe real | ✅ 6 oct 2026 |
| 2 | Webhook `/api/managed/webhook` (firma con `client.beta.webhooks.unwrap`, dedupe por `webhook-id`), registro en `cron_runs`, costo en tabla nueva, informe a `/admin/lab/security` vía la ingesta existente, aviso ntfy | pendiente |
| 3 | Deployment programado cada noche (`America/Bogota`, fuera de la franja 1-3 a. m.), con tope por corrida; kickoff con `user.define_outcome` y rúbrica para que el evaluador lo haga iterar hasta que el informe cumpla | pendiente |
| 4 | Escritura con aprobación: token de GitHub en vault, MCP de GitHub en `always_ask` para abrir issues o PRs en borrador; aprobar o rechazar desde el panel (el webhook recibe `session.status_idled` con `requires_action`) | pendiente |
| 5 | Memoria entre noches (memory store) para no repetir hallazgos ya reportados | pendiente |
| 6 | Requisito en `src/data/documentacion.ts`, entrada en `src/data/automatizaciones.ts`, artículo en `/notes` después del workshop | pendiente |

## Pendiente del administrador

- Fase 2: registrar el endpoint del webhook en la Console (Manage → Webhooks;
  no hay API para esto) y guardar el `whsec_` en Vercel como
  `ANTHROPIC_WEBHOOK_SIGNING_KEY`.
- Fase 4: crear un token de GitHub de grano fino (Contents read/write, Issues,
  Pull requests) y guardarlo en el vault, no en el chat ni en el repo.

## Fase 1: qué quedó

- Agente `agent_01VQEHvBqYrvnGc2CGSfdfgR` (v1) y entorno
  `env_01F5UhGfQe4GPNCwKY8PKRg6`, creados el 6 oct 2026 con `ant apply` en el
  workspace Default.
- Primera corrida ✅: sesión `sesn_01SQcrKSjaDPKkgB9WtDL8k3`, tope US$2,
  gasto real US$1,91, unos 10 minutos de contenedor. Terminó con `end_turn`
  (no por el tope) y dejó `informe.md` (12 KB) e `informe.json` (8 KB).
- Estado del informe: **amarillo**. Hallazgos principales:
  1. Alta: `/docs/presentacion` muestra "NaN commits" en cuatro lugares. Tres
     iteraciones nuevas (`pf-halloween`, `pf-plano`, `pf-dashboard-asistente`)
     no tienen `commits` y `presentacion.astro:40` los suma sin `?? 0`.
     Verificado a mano contra el código.
  2. Media: `npm audit fix` (sin `--force`) sube Astro a 7.3.6 y quita el
     crítico de AVIF. El agente lo probó en una copia: tests, tipos y build en
     verde, y los avisos de producción bajan de 21 a 6. En Vercel no era
     explotable (el servicio de imágenes no usa sharp).
  3. Media: el 302 de `/admin` y los demás `return` tempranos del gate salen
     sin los headers endurecidos (`src/middleware.ts:699`).
  4. Baja: 22 errores de `astro check` (12 del script de prueba del asistente),
     `@auth/core` bloqueado por el peer de `auth-astro`, `X-Frame-Options` en
     páginas públicas.
- Lección para el prompt: con `effort: high` el agente se va a fondo (simuló
  el arreglo completo) y casi llega al tope. Se le mandó un `user.message`
  pidiendo cerrar, que entró en cola y lo atendió en el siguiente turno. Para
  la corrida nocturna: tope de US$3 o pedir en el prompt que no valide
  arreglos, solo los proponga.
