# Plan: vigía del repo con Claude Managed Agents

Estado: **fases 1, 2 y 5 ✅, 3 lista y pausada, 4 preparada** (6 oct 2026). Material del workshop de Managed
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
| 2 | Webhook `/api/managed/webhook` (firma con `client.beta.webhooks.unwrap`), estado leído de la API, corrida en `vigia_corridas` (migración 0048) y en `cron_runs`, aviso ntfy, sección `#vigia` en `/admin/lab/security` | ✅ código; falta registrar el endpoint |
| 3 | Deployment `agents/vigia/deployment-nocturno.yaml`: 4:30 a. m. Bogotá, tope US$3, `user.define_outcome` con rúbrica de 9 criterios y `max_iterations: 2` | ✅ archivo; se aplica y queda pausado |
| 4 | Escritura con aprobación: token de GitHub en vault, MCP de GitHub en `always_ask`; aprobar o rechazar desde el panel (`/api/admin/vigia/decision`) | preparada: falta el token |
| 5 | Memory store `agents/vigia/memory_store.yaml` montado en el deployment; el prompt lleva `hallazgos.md` y `notas.md` | ✅ archivo |
| 6 | RF-510 en `src/data/documentacion.ts` ✅; entrada en `CRONS` al activar el deployment; artículo en `/notes` después del workshop | parcial |

## Fases 2 a 5: qué quedó (6 oct 2026)

- **Webhook** (`src/pages/api/managed/webhook.ts`): sin `ANTHROPIC_WEBHOOK_SIGNING_KEY`
  responde 503 y no procesa nada (un aviso sin verificar no se distingue de uno
  inventado). Atiende `session.status_idled` y `session.status_terminated`;
  ignora sesiones de otros agentes del workspace comparando con el ID de
  `claude-lock.json`.
- **Lógica pura** en `src/lib/vigia/informe.ts` (valida el informe.json con
  Zod; un informe con otra forma cuenta como corrida fallida pero guarda el
  .md) y `src/lib/vigia/desenlace.ts` (qué significa cada `stop_reason` y
  cuándo anunciar: una sola vez por corrida aunque el aviso llegue duplicado,
  y un `terminated` tardío no pisa el informe).
- **`cron_runs`**: el `detail` es neutro ("informe entregado", "tope de gasto")
  porque esa tabla la lee una página pública; los hallazgos solo viven en
  `vigia_corridas` y en el panel.
- **Aprobaciones**: `/api/admin/vigia/decision` solo confirma eventos que el
  webhook registró como pendientes de esa corrida, y se audita como
  `vigia.accion_aprobada` / `vigia.accion_rechazada` (categoría de rastro).
- **Prompt v2**: lee y actualiza la memoria, y no valida arreglos a fondo (la
  primera corrida casi llegó al tope por simular el `npm audit fix` completo).
- **Tests**: `tests/vigia.test.ts` (10, con el informe real como fixture) y
  `tests/vigia-sesion-db.test.ts` (6, libSQL temporal y cliente falso).
- **Aplicado en Anthropic** (6 oct 2026): agente v2, memoria
  `memstore_0193a1KHJkLgrAZ83Q8vxnei` y deployment
  `depl_01LkirG8vctAohi2Jn282Jmk`, **pausado** a mano justo después de
  crearse (nunca disparó). Gotcha: `ant apply` resuelve rutas en `agent` y
  `environment_id`, pero no en `memory_store_id`; ahí va el `memstore_...`.
- **Gotcha de `ant`**: el token OAuth se renueva solo, pero el renovado puede
  salir sin scopes y la API responde 403 `scope requirement`. Se arregla con
  `ant auth login`.

## Para activar la corrida nocturna

1. Aplicar la migración 0048 en las dos bases Turso (principal y demo).
2. Console → Manage → Webhooks: endpoint `https://codebymike.net/api/managed/webhook`,
   eventos `session.status_idled` y `session.status_terminated`. Guardar el
   `whsec_` en Vercel (`dev-portfolio`) como `ANTHROPIC_WEBHOOK_SIGNING_KEY`.
3. Desplegar (el webhook tiene que existir en producción antes del paso 4).
4. Probar con una corrida manual: `ant beta:deployments run --deployment-id depl_01LkirG8vctAohi2Jn282Jmk`
   y comprobar que llega el push y aparece en el panel.
5. Despausar: `ant beta:deployments unpause --deployment-id depl_01LkirG8vctAohi2Jn282Jmk`.
6. Añadir la entrada `vigia-nocturno` a `CRONS` en `src/data/automatizaciones.ts`
   (`cadaMin: 1440`, con un origen nuevo para Anthropic). Va al final a
   propósito: antes de despausar, el detector de silencio avisaría cada día que
   el job "nunca apareció".

## Fase 4: cómo se activa

1. Token de GitHub de grano fino sobre `mikerb95/dev-portfolio`: Contents
   (lectura y escritura), Issues y Pull requests. No va en el chat ni en el repo.
2. Vault: `agents/vigia/vault.yaml` con `type: vault` y `display_name`, `ant apply`,
   y la credencial con `ant beta:vaults:credentials create` (MCP de GitHub,
   `https://api.githubcopilot.com/mcp/`).
3. En `agent.md`: `mcp_servers: [{type: url, name: github, url: https://api.githubcopilot.com/mcp/}]`
   y en `tools` un `{type: mcp_toolset, mcp_server_name: github}` **sin** cambiar
   su política por defecto (`always_ask`). En el entorno, `allow_mcp_servers: true`.
4. En el deployment: `vault_ids: [vlt_...]` y el recurso `github_repository`
   con el token (el agente deja de clonar a mano).
5. Quitar del prompt la línea "Fase 1: solo lectura" y pedirle que abra como
   máximo un issue por hallazgo nuevo de prioridad alta.

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
