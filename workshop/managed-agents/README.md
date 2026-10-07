# Tu primer agente que trabaja de noche

Plantilla del workshop de **Claude Managed Agents** · Comunidad Claude Bogotá · 24 oct 2026.

Al terminar tienes un agente que revisa tu repositorio (dependencias, tests, tipos y headers de tu sitio), te deja un informe priorizado y queda programado para correr solo cada noche con un tope de gasto.

Es la versión genérica del vigía que corre sobre codebymike.net. Su primera corrida encontró "NaN commits" publicado en un deck de sustentación, por US$1,91.

## Antes del taller (15 min)

1. **Cuenta en [platform.claude.com](https://platform.claude.com)** con saldo de API. Cada sesión de práctica cuesta entre US$0,50 y US$2; el tope de cada una lo pones tú.
2. **CLI `ant`** (no está en npm; es un binario):
   - macOS: `brew install anthropics/tap/ant`
   - Linux: baja el `.tar.gz` de tu arquitectura desde [los releases](https://github.com/anthropics/anthropic-cli/releases) y pon `ant` en tu PATH.
   - Comprueba con `ant --version` (1.34 o más).
3. `ant auth login` (abre el navegador) y `ant auth status` para ver que quedó en tu organización.
4. **`jq`** instalado (lo usa `sesion.sh`).
5. Un **repositorio tuyo en GitHub**, público para la práctica 1.

## Mapa mental (lo que se explica en los primeros 25 min)

| | Quién corre el bucle del agente | Dónde se ejecutan las herramientas |
|---|---|---|
| Messages API + tool use | Tu código | Tu servidor |
| Claude Agent SDK | El SDK, en tu máquina o servidor | Tu servidor |
| **Managed Agents** | Anthropic | Un contenedor por sesión, en Anthropic |

Piezas: **agent** (configuración versionada: modelo, prompt, herramientas), **environment** (el contenedor y su red), **session** (cada ejecución, con eventos en vivo), **vault** (credenciales que el agente nunca ve), **deployment** (ejecución programada), **outcome** (una rúbrica que un evaluador aparte usa para hacerlo iterar).

## Práctica 1: tu primera sesión (50 min)

1. Copia esta carpeta a un repo propio o trabaja aquí mismo.
2. Edita `agents/vigia/agent.md`: cambia `REPO_URL` y `SITIO_URL`.
3. Edita `agents/vigia/environment.yaml`: cambia `mi-sitio.com` por tu dominio y ponle un nombre único al entorno.
4. Mira el plan sin crear nada:
   ```bash
   ant apply --dry-run -v agents/vigia/agent.md agents/vigia/environment.yaml
   ```
5. Créalos (escribe los IDs en `claude-lock.json`):
   ```bash
   ant apply agents/vigia/agent.md agents/vigia/environment.yaml
   ```
6. Lanza la sesión con un tope de US$1,50 y míralo trabajar:
   ```bash
   ./sesion.sh 150
   ant beta:sessions connect <sesn_...>
   ```
   `Ctrl+O` muestra las herramientas que usa, `Esc` lo interrumpe, `Ctrl+C` te desconecta sin detenerlo.
7. Baja el informe:
   ```bash
   ant beta:files list --scope-id <sesn_...> --beta managed-agents-2026-04-01
   ant beta:files download --file-id <file_...> > informe.md
   ```

**Para pensar:** ¿qué encontró que tu CI ya decía? ¿Qué encontró que no? ¿Cuánto costó (`ant beta:sessions retrieve --session-id <sesn_...> --transform usage.list_cost`)?

## Práctica 2: credenciales y aprobación humana (40 min)

El agente de la práctica 1 no puede escribir nada fuera del contenedor porque no tiene credenciales. Ahora le das permiso de abrir issues, pero solo con tu aprobación.

1. Crea un token de GitHub de grano fino sobre tu repo con permisos de Issues.
2. Crea un vault (`agents/vigia/vault.yaml` con `type: vault` y `display_name`), `ant apply`, y agrega la credencial del MCP de GitHub con `ant beta:vaults:credentials create`. El token se queda en Anthropic: el contenedor nunca lo ve.
3. En `agent.md` agrega el servidor MCP de GitHub y su `mcp_toolset` **sin tocar su política**: por defecto es `always_ask`.
4. Lanza otra sesión pidiéndole que abra un issue por el hallazgo más importante. Cuando lo intente, `ant beta:sessions connect` te pregunta **Allow tool call?**: prueba a rechazarlo con un motivo y mira cómo ajusta.

**La idea que importa:** `auto` deja que el servidor decida qué es seguro; `always_ask` es el único punto de control humano. Lo que no podrías deshacer va en `always_ask`.

## Práctica 3: que corra solo (25 min)

1. Revisa `agents/vigia/deployment-nocturno.yaml`: hora, zona horaria, tope y rúbrica.
2. Aplícalo y pruébalo con una corrida manual antes de dejarlo programado:
   ```bash
   ant apply agents/vigia/deployment-nocturno.yaml
   ant beta:deployments run --deployment-id <depl_...>
   ```
3. Si no lo vas a usar, páusalo (`ant beta:deployments pause --deployment-id <depl_...>`): un deployment activo gasta cada noche.

**Siguiente paso, en casa:** un webhook (Console → Manage → Webhooks) para que cada corrida te avise, y un memory store para que no te repita los hallazgos de anoche. El vigía de codebymike.net tiene las dos cosas; el código está en `src/pages/api/managed/webhook.ts` y `src/lib/vigia/` del mismo repositorio.

## Limpieza

- `ant beta:deployments pause` o `archive` para detener lo programado.
- Archivar agentes, entornos o vaults es **permanente** (no hay deshacer): hazlo solo con lo que ya no vas a usar.
- `claude-lock.json` guarda tus IDs: versiónalo en tu repo para que el próximo `ant apply` actualice en vez de duplicar.

## Errores frecuentes

| Síntoma | Causa |
|---|---|
| `403 permission_error ... scope requirement` | El token de `ant` se renovó sin permisos: `ant auth login` otra vez. |
| La sesión no puede clonar o instalar | Falta el dominio en `allowed_hosts` o `allow_package_managers: true`. |
| `409` al crear el entorno | El nombre del entorno ya existe en tu workspace. |
| La sesión queda en `idle` con `budget_reached` | Llegó al tope: súbelo con `ant beta:sessions update` o empieza otra. |
| Un `ant apply` crea un duplicado | Lo creaste antes desde la Console o con otro lock: `ant apply` no adopta recursos ajenos. |
