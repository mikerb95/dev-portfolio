# 02 · Arquitectura

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | **Astro 7**, `output: 'server'` (SSR) | Algunas páginas se prerenderizan (`/docs/*`, `/pay`, `/hola`, `/paginas-web`…). Sin React/Vue/Svelte. |
| Estilos | **Tailwind 4** (`@tailwindcss/vite`) | Fuentes self-hosted: Inter, Archivo, JetBrains Mono, Instrument Serif. |
| Animación | `gsap`, `lenis` | Más WebGL/canvas propio en `src/lib/motion/`. |
| Diagramas | `mermaid` (secuencia, clases, objetos) | BPMN, actividades, comunicación, despliegue, componentes y red usan **motores de layout propios** que generan SVG en el servidor. |
| Base de datos | **Turso** (libSQL) + **Drizzle ORM** | Dos bases: principal y demo. |
| Auth admin | **Auth.js** (`auth-astro`) + GitHub OAuth + WebAuthn (`@simplewebauthn`) | JWT, con revocación por dispositivo. |
| Hosting | **Vercel** (adapter `@astrojs/vercel`), plan Hobby | Proyecto `dev-portfolio` sirve `codebymike.net`. |
| Archivos | **Vercel Blob** | Backups, imágenes de certificaciones, decks de presentaciones. |
| Tiempo real | **Upstash Redis** (REST + SSE) | Solo para presentaciones/sustentación. |
| Email | **Resend** | Portal, alertas, marketing. |
| Push | **ntfy.sh** | Alertas al celular. |
| Pagos | **Wompi** (Colombia) | Con modo mock para el LAB. |
| IA | **API de Claude** (`@anthropic-ai/sdk`), Claude Agent SDK, Managed Agents | Ver [11](11-ia-y-agentes.md). |
| Cron | `vercel.json` (diarios) + **cron-job.org** (frecuentes) | Ver [09](09-observabilidad-y-automatizaciones.md). |
| PDF | `pdf-lib` | Facturas, cuentas de cobro, propuestas. |

Requisito de runtime: **Node ≥ 22.12**.

## Recorrido de un request

```
navegador
   │
   ▼
Vercel edge (DDoS, WAF con 3 reglas, CDN)
   │   páginas prerenderizadas → servidas por la CDN, nunca invocan la función
   ▼
src/middleware.ts  (una sola función, en orden)
   1. salir si es prerender (build)
   2. i18n: /en/<ruta privada> → 404 · /en/<no traducida> → 302 a español
   3. canonicalPath = sin prefijo de idioma y sin barra final
   4. host canónico: www y alias de Vercel → 308 a codebymike.net (excepto /api)
   5. chaos engineering (flags con TTL, nunca en /admin)
   6. sensor del micro-SIEM (clasifica, registra sin esperar)
   7. conteo AEO de agentes de IA
   8. blocklist por IP → 403 seco
   9. honeypot inline → bloqueo escalado de la IP
  10. rate limits específicos (portal auth, auth, cobros, propuestas,
      acuerdos, capacitación, asesor IA, PIN de presentación, snapshots)
      + paraguas global por IP
  11. clasificar la ruta: isAdmin / isPrivateDeck / isEscenario / isPortal /
      isCotizaPuerta
  12. portal: sesión real → pase demo → modo respaldo → 401/redirect
      · impersonación = solo lectura
  13. admin: puerta por contraseña de sustentación → sesión Auth.js →
      PIN de Cotiza → pase de demo → redirect a /login
      · allowlist revalidada · registro de dispositivo · revocación (FAIL-CLOSED)
  14. ejecutar la página en el contexto correcto (real / demo / respaldo)
  15. headers: base, privados (noindex, no-store, CSP estricta) o públicos
      (CSP + Cache-Control s-maxage=300, SWR=86400 + CDN-Cache-Control)
   │
   ▼
Astro SSR (página o endpoint /api) ──► Drizzle ──► Turso
```

Archivo: [`src/middleware.ts`](../../src/middleware.ts) (~900 líneas, muy
comentado; leerlo es la mejor forma de entender las garantías del sitio).

### Detalles que importan

- **La ruta canónica se calcula una sola vez** (`delocalizePath` +
  `withoutTrailingSlash`) y todos los guardas la usan. Si un guarda comparara
  `pathname` crudo, `/en/admin` o `/admin/` serían copias del panel sin
  vigilancia. Lo cubren `tests/i18n-routing-guards.test.ts` y
  `tests/security-paths.test.ts`.
- **Rutas en la raíz que son panel**: `/cobrar` y `/remote/<sessionId>` exigen
  sesión admin aunque no empiecen por `/admin` (se abren desde el celular).
  `/remote` a secas es público (mando de `/final.html`).
- **`/docs/presentacion`** es privado aunque `/docs` sea público.
- **`/sustentacion`** es privado para los headers pero su puerta la decide la
  propia página (sesión admin o PIN de presentador).
- **Cotiza** (`/cotiza`, `/acuerdo/<token>`) es público para el gate pero
  privado para los headers (noindex, sin caché de CDN).

## Bases de datos y contextos por request

[`src/db/index.ts`](../../src/db/index.ts) crea dos clientes libSQL **de forma
diferida** (en la primera consulta, para que el build no muera sin
credenciales):

- **Base real** (`TURSO_DATABASE_URL`).
- **Base demo** (`TURSO_DEMO_URL`): mismo esquema, datos ficticios.

Un `AsyncLocalStorage` decide por request cuál se usa. En modo demo **toda**
consulta va a la base demo: el aislamiento es por construcción, no por filtros.
Hay un tercer contexto, **respaldo**, que no consulta ninguna base y sirve un
snapshot JSON versionado del portal cuando Turso no responde.

Los `AsyncLocalStorage` viven en `globalThis` a propósito: el dev server
re-evalúa el módulo al editarlo, y con una instancia por copia la demo llegó a
leer la base real sin ningún error (reproducido 20/20, arreglado el 18 sep 2026,
cubierto por `tests/contexto-recarga.test.ts`).

Más en [13 · Base de datos](13-base-de-datos.md).

## Caché

- Páginas públicas GET con 200: `Cache-Control: public, s-maxage=300,
  stale-while-revalidate=86400`, duplicado en `CDN-Cache-Control`. El borde de
  Vercel elimina `s-maxage` antes de entregar, así que la única sonda real
  desde fuera es `x-vercel-cache` (con **GET**, no `curl -I`).
- Una respuesta con `no-store` o `private` se respeta (datos personales).
- Rutas privadas: siempre `no-store` + `noindex`.
- `s-maxage` **no** acota el coste de Turso: la CDN revalida por región.
- Agregados caros (p. ej. la vitrina de `/security`) se guardan como "foto" JSON
  en `app_settings` con TTL (`src/lib/security/vitrina.ts`).

## Headers de seguridad

Módulo puro [`src/lib/security/private-headers.ts`](../../src/lib/security/private-headers.ts):

- CSP en modo enforce con reporting (`/api/security/csp-report`). Mantiene
  `'unsafe-inline'` en script/style (decisión aceptada en la auditoría de sep
  2026).
- `frame-ancestors 'none'` salvo rutas enmarcables por la sustentación
  (`/portal`, `/status`, `/engineering`, `/docs/kanban`, `/lab/site-check`).
- `connect-src` se abre al origen de Upstash solo en vistas de presentación.
- HSTS con preload, `Permissions-Policy` restrictiva (el micrófono solo se abre
  en Cotiza para dictado por voz), `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`.
- Las páginas prerenderizadas reciben sus headers desde
  `integrations/static-headers.mjs` (reescribe el `config.json` del adaptador).

## Dominio

- Producción: **codebymike.net** desde el 5 sep 2026 (registrado en Vercel).
- `codebymike.tech` venció el 6 sep 2026 y está muerto (sin NS): sus redirects
  ya no salvan nada. Lógica en `src/lib/canonical-host.ts` (SSR) e
  `integrations/canonical-redirect.mjs` (prerender).
- Existen dos proyectos de Vercel: **`dev-portfolio`** (el real) y
  **`portfolio`** (sin relación). Confirmar `.vercel/project.json` antes de
  tocar variables.

## Degradación ante una base caída

Turso tiene cuota mensual de filas leídas por organización y se ha agotado
varias veces. El sitio está diseñado para sobrevivir:

- `src/lib/safe-query.ts`: una consulta que falla no tumba la página.
- `src/lib/fallback/`: instantánea de datos públicos reales
  (`src/data/instantanea.json`) y sondeo en vivo para `/status`.
- Portal en modo respaldo (snapshot firmado).
- Las rutas de sustentación viven en Redis y no tocan Turso.
- El panel admin, en cambio, responde **503** si no puede verificar la
  revocación de la sesión (fail-closed).

Runbook: [`docs/runbook-cuota-turso.md`](../runbook-cuota-turso.md).
