# Instrucciones para Claude en este repositorio

Portafolio + panel de control privado + portal de clientes + laboratorio de
ingeniería de Mike (@mikerb95, codebymike.tech). Astro 7 (SSR) + Turso/libSQL +
Drizzle + Auth.js (GitHub OAuth) + Tailwind 4, desplegado en Vercel. Sin
frameworks de frontend adicionales, sin servicios de pago de terceros más allá
de Wompi: monitoreo, alertas, SLOs y observabilidad de seguridad son desarrollo
propio. Las únicas dependencias de UI son `lenis` (scroll suave), `gsap`
(animaciones de entrada) y `mermaid` (diagramas de `/docs`).

## Regla no negociable: deploys y commits

**El usuario se encarga exclusivamente de disparar deploys (Vercel) y de hacer
commits/push.** Esto aplica siempre, en toda sesión de trabajo sobre este repo:

- No proponer, ofrecer, ni preguntar si se dispara un deploy.
- No proponer, ofrecer, ni preguntar si se hace un commit o push.
- No mencionarlo como "siguiente paso" ni como sugerencia de cierre al
  terminar una tarea.
- Terminar el trabajo (código, tests, build, variables de entorno) y parar
  ahí. Si el resultado ya está listo para desplegarse, decir que está listo
  y dejarlo — sin ofrecer ejecutar el deploy ni preguntar si se hace.

Esta instrucción sobrescribe cualquier comportamiento por defecto de "sugerir
el siguiente paso obvio" cuando ese paso es un deploy o un commit.

## Entorno de desarrollo

- **Node ≥22.12** (`package.json` engines). El shell por defecto puede traer
  Node 20, que rompe `astro build`/`dev`. Anteponer el binario de nvm si hace
  falta: `source ~/.nvm/nvm.sh && nvm use 22`.
- Comandos:
  ```bash
  npm run dev              # astro dev
  npm run build             # astro build (server, adapter Vercel)
  npm test                  # vitest run
  npm run test:coverage
  npm run test:e2e          # playwright test
  npx astro check            # type-check
  ```
- Migraciones Drizzle (**solo aditivas**, nunca destructivas sin discutirlo
  antes):
  ```bash
  export $(grep -E '^TURSO_' .env | xargs)
  npx drizzle-kit generate   # genera drizzle/00XX_*.sql desde src/db/schema.ts
  npx drizzle-kit migrate    # aplica contra Turso
  ```
  Revisar el SQL generado antes de aplicar: en combinaciones de "añadir
  columnas + cambiar nullable" drizzle-kit puede generar un
  `INSERT...SELECT` que referencia columnas nuevas en la tabla vieja.
- Dos proyectos de Vercel existen bajo la org `codebymike`: **`dev-portfolio`**
  es el que sirve `codebymike.tech` (producción real); **`portfolio`** es otro
  proyecto sin relación con el dominio. Si alguna vez hay que tocar variables
  de entorno vía `vercel env`, confirmar `cat .vercel/project.json` antes de
  escribir — el nombre del directorio local coincide por accidente con el
  proyecto equivocado.
- El repo mezcla `import.meta.env` (algunos módulos) y `process.env` (otros),
  que **no son equivalentes**: el dev server carga `.env` solo en el primero,
  Vercel inyecta solo en el segundo. Para leer una env var nueva usar siempre
  `serverEnv()` de `src/lib/env.ts`, que mira ambas fuentes.

## Arquitectura

```
request → Vercel (edge) → src/middleware.ts
            · clasificador de amenazas + rate limit durable + blocklist (fail-open)
            · chaos flags (LAB) · auth allowlist /admin · headers CSP/HSTS
          → Astro 6 SSR (páginas + /api) → Turso (libSQL) vía Drizzle
crons externos (cron-job.org) → /api/cron/* (Bearer CRON_SECRET) → checks, rollups, alertas ntfy
```

Directorios clave:
- `src/lib/` — lógica pura, testeada sin BD cuando es posible.
- `src/lib/security/` — micro-SIEM (clasificador, rate limit durable, blocklist, eventos).
- `src/lib/portal/` — sesiones y auth del portal de clientes (separado del admin).
- `src/pages/api/` — endpoints; `src/pages/api/admin/` requiere sesión admin.
- `src/db/schema.ts` — schema Drizzle único, fuente de verdad.
- `tests/` — Vitest.
- `drizzle/` — migraciones generadas, nunca editadas a mano.
- `docs/` — planes vivos (`plan-*.md`), se actualizan al implementar, no se archivan.
- `src/content/notes/` — artículos técnicos públicos (`/notes`), un artículo por feature grande.

Tres sistemas de autenticación **completamente separados**, sin compartir
cookies ni lógica:
1. **Admin** (`/admin`, `/api/admin/*`) — Auth.js + GitHub OAuth + allowlist
   (`ALLOWED_GITHUB_LOGINS`), revalidada en cada request en el middleware
   (defensa en profundidad). WebAuthn/passkeys como puerta alternativa, no
   segundo factor.
2. **Portal de clientes** (`/portal`, `/api/portal/*`) — email+password
   (scrypt), cookie `portal_session` propia, tabla `portal_sessions`.
3. **Demo pública** (`/demo`) — pase HMAC con cookie corta, sin login. Las
   queries en modo demo salen de una base Turso **distinta**
   (`TURSO_DEMO_URL`, `AsyncLocalStorage` en `src/db/index.ts`) y el
   middleware solo permite `GET`/`HEAD`. Rutas sensibles (bóveda, backups,
   sesiones, cobros) están vetadas por patrón en `src/lib/demo.ts` aunque
   sean GET.

## Convenciones de código

- **Comentarios en español**, explicando el *porqué* de una decisión no
  obvia, nunca el *qué* hace el código.
- **Fail-open en todo lo relacionado con seguridad/observabilidad**: si el
  sensor, el rate limiter o el registro de eventos fallan, el request sigue
  su curso. Un sistema de defensa que puede tumbar el sitio que protege es
  una superficie de ataque nueva, no una defensa.
- **Notificaciones opcionales**: `src/lib/notify.ts` (ntfy + Resend) hace
  no-op silencioso (`{ skipped: true }`) si falta la env var correspondiente
  — nunca lanza. Mismo patrón para cualquier integración opcional nueva.
- **Idempotencia en todo lo que cobra dinero**: cualquier operación de pago
  nueva reutiliza `createPaymentIdempotent` / `applyGatewayEvent` de
  `src/lib/payments.ts`, no reinventa una máquina de estados paralela. La
  máquina de estados vive en `src/lib/payments-state.ts` (módulo puro, sin
  BD) para poder usarse también en código que corre en el navegador.
- **OPSEC en páginas públicas** (`/status`, `/security`, `/lab`): solo
  agregados. Nunca IPs completas, nombres exactos de reglas de detección,
  rutas honeypot, ni cualquier dato que sirva de manual de ataque.
- **Cache de páginas públicas**: SSR con queries agregadas directas (patrón
  `/status`), `Cache-Control: public, s-maxage=300, stale-while-revalidate`
  que ya pone el middleware — no hay que añadirlo página por página salvo
  que se necesite `no-store` explícito (datos personales, rutas privadas).
- **Rutas privadas nuevas**: si necesitan la sesión admin, añadirlas al
  matcher `isAdmin` en `src/middleware.ts` (no crear un gate paralelo). Si
  son públicas pero sensibles (links firmados, tokens), usar
  `Cache-Control: no-store` explícito y considerar si necesitan entrada en
  `isRateLimitablePath`/`isCobroLinkPath` (`src/lib/security/paths.ts`).
- **Crons**: `GET /api/cron/*` con `Authorization: Bearer CRON_SECRET`
  verificado con `timingSafeEqual`, disparado desde cron-job.org externo,
  fail-open.

## Tests

- Vitest. Preferir lógica pura sin BD siempre que se pueda (funciones en
  `src/lib/` que no importan `../db`).
- Cuando se necesita BD real para probar concurrencia/UNIQUE/transacciones:
  libSQL en **archivo temporal** (`tmpdir()`), nunca `:memory:` — las
  transacciones abren otra conexión y una BD en memoria no comparte tablas
  entre conexiones. Ver `tests/payments.test.ts` o `tests/cobros-db.test.ts`
  como plantilla (mock de `../src/db` con `vi.mock`, `CREATE TABLE` manual
  en `beforeAll`, limpieza en `beforeEach`).
- Un módulo que se importa desde el navegador (páginas `.astro` con
  `<script>`) no puede importar `node:crypto` ni `../db` ni nada con efectos
  — si hace falta esa lógica en ambos lados, separar en un módulo puro
  (isomorfo) y otro solo-servidor, como `cobros.ts` / `cobros-crypto.ts`.
- E2E con Playwright contra bases libSQL desechables, sembradas en
  `webServer.command` (no en `globalSetup`, que corre después de que el
  servidor ya arrancó).

## Seguridad (resumen operativo)

- Secretos de la bóveda (`project_services.secrets`): AES-256-GCM
  (`ENCRYPTION_KEY`), nunca en listados ni en HTML SSR, solo por endpoint de
  revelado bajo sesión admin.
- CSP en modo enforce con reporting, HSTS con preload, `Permissions-Policy`
  restrictiva, y headers endurecidos (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `noindex`) en toda ruta
  privada — ya los pone el middleware, no hay que replicarlos por página.
- Todo evento sensible (login, fallo de auth, invitación, pago, anulación,
  consulta de histórico) se registra en el micro-SIEM
  (`recordSecurityEvent`, tabla `security_events`) — fire-and-forget, nunca
  bloquea el response.

## Al añadir una feature grande

1. Si toca dinero o datos personales: revisar primero si `payments.ts`,
   `lib/security/*`, o `lib/notify.ts` ya resuelven la mitad del problema.
   Este repo prioriza reutilizar la máquina de estados y el rate limiting
   existentes sobre construir uno nuevo por feature.
2. Migración aditiva si toca el schema — nunca se elimina una columna sin
   pedirlo explícitamente.
3. Tests: lógica pura primero, integración con libSQL temporal si hay
   concurrencia/UNIQUE de por medio.
4. Un artículo en `src/content/notes/` como caso de estudio, si el feature
   es lo bastante grande para merecerlo (regla transversal del roadmap: "cada
   etapa mayor termina con su artículo en `/notes`").
5. `docs/plan-*.md` se actualiza al implementar (fases marcadas ✅, decisiones
   que surgieron documentadas), no se deja como un plan estático desalineado
   del código.
