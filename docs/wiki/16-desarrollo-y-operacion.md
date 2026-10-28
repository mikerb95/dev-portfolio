# 16 · Desarrollo y operación

## Entorno

- **Node ≥ 22.12**. El shell puede traer Node 20, que rompe `astro build` y
  `astro dev`: `source ~/.nvm/nvm.sh && nvm use 22`. La salida definitiva es el
  devcontainer (`.devcontainer/`, Node 22.12 + Chromium de Playwright).
- Variables en `.env` (no versionado). Ver la tabla de abajo.
- Leer cualquier variable nueva con **`serverEnv()`** (`src/lib/env.ts`): el dev
  server carga `.env` solo en `import.meta.env` y Vercel inyecta solo en
  `process.env`. Leer solo una de las dos funciona en un entorno y falla en
  silencio en el otro. Única excepción deliberada: `src/db/index.ts` da
  prioridad a `process.env` para que `npm run dev:carga` pueda redirigir la
  base desde la línea de comandos.

## Comandos

```bash
npm run dev               # astro dev (puede tomar 4322+ si 4321 está ocupado por otro proyecto)
npm run build             # astro build (adapter de Vercel)
npm test                  # vitest run
npm run test:coverage
npm run test:e2e          # playwright
npm run test:e2e:server   # e2e contra sqld en Docker
npm run test:mutation     # stryker
npm run test:contracts
npx astro check           # tipos

npm run db:up             # levanta los dos sqld (principal 8080, demo 8081) y espera
npm run db:seed           # siembra ambas bases locales
npm run db:reset          # borra volúmenes y vuelve a levantar
npm run dev:carga         # dev contra sqld local, puerto 4400 (para k6)

npm run seed:demo         # recrea y siembra la base demo (Turso)
npm run analista          # analista del SIEM en terminal (Agent SDK)
npm run asistente         # asistente del panel en terminal
npm run medidor:build     # genera medidor.mjs/.cjs desde medidor.ts
npm run og:generate       # imágenes OG
npm run seo:indexnow      # envío manual a IndexNow
npm run bpmn:export       # exporta los BPMN
npm run planteamiento:export   # regenera docs/planteamiento-del-problema.md
npm run guion:sync | guion:check
npm run sustentacion:check | sustentacion:precalentar
```

## Docker

Docker es **infraestructura de desarrollo y pruebas, nunca el runtime de
producción** (contenerizar perdería el edge, los previews por PR y el rollback
de `ci.yml`). `compose.yaml` levanta dos `sqld` con imágenes **pineadas por
digest**. Plan: [`docs/plan-docker.md`](../plan-docker.md) (fases 1-2 hechas).
Página pública: `/docs/docker`.

## Variables de entorno

Solo nombres y propósito. **Nunca** escribir valores en el repo ni en esta wiki.
Toda integración opcional **degrada en silencio** si falta su variable.

| Variable | Para qué | Si falta |
|---|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Base principal | El sitio no tiene datos |
| `TURSO_DEMO_URL`, `TURSO_DEMO_AUTH_TOKEN` | Base demo | `/demo` da 404; demo del portal apagada |
| `AUTH_SECRET`, `AUTH_URL` | Auth.js; también firma pases (demo, respaldo, Cotiza) | Sin login |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth del admin | Sin login por GitHub |
| `ALLOWED_GITHUB_IDS`, `ALLOWED_GITHUB_LOGINS` | Allowlist del admin | (tiene valor por defecto para el id) |
| `ENCRYPTION_KEY` | AES-256-GCM de la bóveda | Bóveda inutilizable |
| `CRON_SECRET` | Bearer de `/api/cron/*` | Crons rechazados |
| `NTFY_TOPIC` | Push al celular | Sin alertas push |
| `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `PORTAL_EMAIL_REPLY_TO` | Email | Sin correos |
| `MARKETING_SECRET`, `MARKETING_EMAIL_FROM`, `MARKETING_CUPO_DIARIO` | Correos promocionales | Marketing apagado |
| `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | Pasarela | Sin pagos reales |
| `PAYMENTS_MOCK_ENABLED` | Permite el pago simulado fuera de admin/demo | - |
| `COBRO_HISTORY_SECRET` | HMAC de `/mis-pagos` | Sin histórico firmado |
| `SECURITY_IP_SALT` | Hash de IPs para lo público | - |
| `SECURITY_IP_ALLOWLIST` | IPs que nunca se bloquean | - |
| `LAB_INGEST_TOKEN` | Ingesta de CI/SAST/DAST/k6 | El panel LAB no recibe corridas |
| `TRAINING_ACCESS_SECRET` | Pases del banco de capacitación | Material restringido cerrado |
| `ANTHROPIC_API_KEY` | Todas las funciones de IA | IA apagada |
| `ASESOR_TOPE_DIARIO_USD`, `ASISTENTE_TOPE_DIARIO_USD`, `ANALISTA_TOPE_DIARIO_USD` | Topes de gasto | Defaults 1 / 3 / 3 USD |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Webhook del vigía | 503 en el webhook (**pendiente en prod**) |
| `BLOB_READ_WRITE_TOKEN` | Backups, certificaciones | Sin backups/uploads |
| `DECK_ASSETS_BLOB_READ_WRITE_TOKEN` | Assets públicos de decks | - |
| `PRESENT_BUS_REST_URL`, `PRESENT_BUS_REST_TOKEN`, `PRESENT_BUS_READONLY_TOKEN` (o `UPSTASH_REDIS_*` / `KV_REST_API_*`) | Redis de presentaciones | Almacén en memoria (solo dev) |
| `PRESENT_SECRET` | Firma de sesiones de presentación/sustentación | Cae a `AUTH_SECRET` |
| `SUSTENTACION_PASSWORD` | Puerta por contraseña de la sustentación | Esa puerta no existe |
| `GITHUB_TOKEN` / `GITHUB_API_TOKEN` | API de GitHub (`/log`, repos, changelog) | Límite anónimo |
| `PSI_API_KEY` | PageSpeed Insights en `/lab/site-check` | Sin datos de PSI (**pendiente**) |
| `MONITOR_*`, `SEED_*`, `LOAD_*`, `INGEST_URL`, `REPORT_PATH`, `E2E_SENTINEL` | Scripts, k6 y e2e | - |
| `DEVTO_API_KEY`, `HASHNODE_*`, `LINKEDIN_*`, `IG_*` | Distribución de notas (workflow) | No se distribuye |
| `GOOGLE_INDEXING_SA` | Indexing API | - |

Estado real de producción y faltantes: [`pendientes.md`](../../pendientes.md) §1.
Proyecto de Vercel correcto: **`dev-portfolio`**; confirmar
`cat .vercel/project.json` antes de `vercel env`.

## Servicios externos

| Servicio | Uso | Plan |
|---|---|---|
| Vercel | Hosting, CDN, WAF, Cron, Blob, dominio | Hobby |
| Turso | Bases libSQL | Free (cuota de lecturas por organización) |
| Upstash Redis | Bus de presentaciones | Free |
| cron-job.org | Crons frecuentes | Free |
| ntfy.sh | Push | Free |
| Resend | Email (dominio `codebymike.net` verificado) | Free |
| Wompi | Pagos | Comisión |
| Anthropic | API de Claude, Managed Agents | Por uso, con topes |
| GitHub | Repo, Actions, OAuth, API | Free |

## Runbooks

- **Cuota de Turso agotada (`BLOCKED`)**:
  [`docs/runbook-cuota-turso.md`](../runbook-cuota-turso.md). Reinicia el día 1
  de cada mes. Migraciones pendientes durante el bloqueo: aplicar y verificar
  después.
- **Sustentación**: [`docs/runbook-sustentacion.md`](../runbook-sustentacion.md).
- **Me bloqueé a mí mismo**: borrar la fila de la IP en `blocked_ips`
  (incidente del 10 sep 2026); asegurar `SECURITY_IP_ALLOWLIST`.
- **Restaurar backup**: `scripts/restore-backup.mjs`.
- **Demo con datos viejos**: `npm run seed:demo` (las gráficas se ven muertas si
  el historial sembrado termina días atrás).
- **WAF**: `vercel firewall rules` (3 reglas propias, sep 2026).

## Trampas conocidas del entorno

1. **Sesiones concurrentes**: puede haber más de un agente trabajando en el
   mismo checkout. Si los archivos cambian solos o hay un `astro dev` que no
   arrancaste, revisa `ps aux` antes de depurar.
2. **Nunca `git stash`** en este repo: puede capturar cambios de otra sesión.
   Para comparar, `git diff <archivo>` o `git log -p -- <archivo>`.
3. **Build que falla por contención**: si otra sesión limpia `dist/` mientras
   compilas, el adaptador muere con `ENOENT ... dist/server/entry.mjs`.
   `pgrep -af "astro build"` y esperar.
4. **Puerto**: 4321 puede ser de otro proyecto; Astro toma el siguiente libre.
5. **HMR y singletons**: un singleton de módulo se duplica al recargar en dev.
   Ante estado compartido intermitente, sospechar de eso primero.
6. **`curl -I`** manda HEAD y siempre da MISS de caché; probar con GET.

## Regenerar el índice de requisitos

La tabla de [18](18-requisitos.md) se generó desde `src/data/documentacion.ts`
con un script de `tsx` que importa `REQUISITOS_FUNCIONALES` y
`REQUISITOS_NO_FUNCIONALES` y escribe una fila por requisito
(`id | titulo | estado | prioridad | origen`). Esquema mínimo:

```ts
// npx tsx este-archivo.mts > salida.md
const m = await import(process.cwd() + '/src/data/documentacion.ts')
for (const mods of [m.REQUISITOS_FUNCIONALES, m.REQUISITOS_NO_FUNCIONALES])
  for (const mod of mods) {
    console.log(`### ${mod.nombre}\n\n| ID | Requisito | Estado | Prioridad | Dónde vive |\n|---|---|---|---|---|`)
    for (const r of mod.items) console.log(`| ${r.id} | ${r.titulo} | ${r.estado} | ${r.prioridad} | ${r.origen ?? ''} |`)
  }
```

## Deploys y commits

Los dispara **exclusivamente el usuario**. Un agente no hace commits, no hace
push, no dispara deploys y no los ofrece ni los menciona como siguiente paso.
Ver [17](17-convenciones.md).
