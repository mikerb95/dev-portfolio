# Plan — Versión en inglés de la parte pública

**Estado:** en implementación · **Creado:** 2026-07-24 · **Última actualización:** 2026-07-29
**Alcance:** todo lo que un visitante ve sin autenticarse. El panel `/admin`,
el interior de `/portal` y `/cobrar` quedan en español (ver §9 para la
excepción de sus puertas públicas).

## Estado de implementación

- ✅ **Fase 0 — Infraestructura**: `astro.config.mjs` (`i18n.routing: 'manual'`),
  `src/i18n/{config,routing,format,es,en,index}.ts`, normalización del
  pathname en `src/middleware.ts` (`isLocalizedPrivateRequest` corta con 404
  cualquier `/en/` delante de una ruta privada, antes de cualquier otra
  clasificación). Tests: `tests/i18n-routing.test.ts`,
  `tests/i18n-routing-guards.test.ts`, `tests/i18n-dictionary.test.ts`.
  Verificado en vivo: `/en/admin`, `/en/api/*`, `/en/portal/*` → 404; `/admin`
  en español sigue redirigiendo a login como siempre.
- ✅ **Fase 1 — Chrome global y SEO**: `BaseLayout` (`lang`, `hreflang`
  recíproco incl. `x-default`, canónico localizado, `og:locale` +
  `og:locale:alternate`), `Navbar` y `Footer` traducidos con selector de
  idioma que preserva la página actual, `404.astro` deriva el locale de la
  URL que falló, `sitemap.xml.ts` emite ambas variantes con
  `xhtml:link rel="alternate"`, `src/pages/en/rss.xml.ts` (vacío hasta la
  Fase 4: no hay notas traducidas todavía — un canal sin items es válido, no
  se mezclan idiomas en un mismo feed).
- ✅ **Fase 2 (parcial) — 7 páginas de marca**: traducidas vía diccionario y con
  su cascarón en `src/pages/en/`: `/`, `/tools`, `/engineering`, `/security`,
  `/certifications`, `/contact`, `/architecture` (patrón confirmado: el locale
  sale de `Astro.url.pathname` del request real, no del archivo). El resto de
  páginas de marca (§6) sigue solo en español.
- 🐛 **Corrección 2026-07-29 — enlaces `/en/` hacia páginas inexistentes.**
  Síntoma: casi todo el sitio en inglés daba 404. Causa: `localizePath` /
  `alternateUrls` calculan la *forma* de una URL sin saber si esa página
  existe, y el nav, el footer, el selector de idioma, el `hreflang` del
  `BaseLayout`, el sitemap y los CTAs internos de cada página los usaban para
  generar enlaces. Con 7 de ~16 páginas públicas traducidas, todo enlace a
  `/en/notes`, `/en/status`, `/en/lab`, `/en/log`, `/en/paginas-web`,
  `/en/demo` era un 404 — y el sitemap además se los anunciaba a Google.
  No fue una regresión: el generador de enlaces se escribió asumiendo un sitio
  traducido al 100% mientras la traducción avanzaba por fases.
  **Arreglo:**
  1. `TRANSLATED_ROUTES` en `src/i18n/routing.ts` — única fuente de verdad de
     qué rutas existen en inglés, con `hasTranslation`, `localizedHref`
     (cae al español si no hay traducción) y `translatedAlternates`
     (`hreflang` solo de lo que existe).
  2. Todo generador de enlaces usa `localizedHref`, nunca `localizePath`:
     `Navbar`, `Footer`, `LanguageSuggestModal`, `404.astro` y el helper `L`
     de las 7 páginas de marca. El selector de idioma cae a `/en` cuando la
     página actual no existe en inglés.
  3. El middleware redirige `GET/HEAD /en/<pública sin traducir>` → versión en
     español con **302** (no 308: cuando esa página se traduzca, la URL `/en/`
     debe empezar a servir). Las rutas privadas siguen dando 404 seco — esa
     rama va antes y no se toca.
  4. `tests/i18n-routing.test.ts` cruza `TRANSLATED_ROUTES` contra los
     archivos reales de `src/pages/en/` en las dos direcciones: declarar una
     ruta sin archivo (404 anunciado) o crear un archivo sin declararlo
     (página invisible) rompe el test.
  **Regla operativa:** traducir una página son *tres* pasos, no dos — página
  al diccionario, cascarón en `src/pages/en/`, y alta en `TRANSLATED_ROUTES`.
- ⬜ **Fases 2 (resto), 3–7**: sin empezar. Volumen pendiente: ~3 350 líneas de
  páginas de marca, contenido de `projects`/`education_milestones` en BD,
  11 383 palabras de notas, LAB, ~3 900 líneas + 240 KB de datos de `/docs`,
  y los flujos de audiencia local (§7). Ver desglose de cada fase más abajo,
  sin cambios respecto al plan original.
- ⬜ **Fase 8 (assets)**: imágenes OG y CV en inglés sin generar.
- ✅ **Documentación de sustentación** (§14, 29 jul): registrado en
  `src/data/documentacion.ts` (RF-013 sitio en inglés —estado *parcial*—,
  RF-014 sugerencia de idioma, RNF-20 guardas ciegos al idioma, RNF-21 paridad
  de traducciones, CU-19) y en `src/data/iteraciones-portfolio.ts` (Fase 29).
  Queda ⬜ el artículo de `/notes`: se escribirá con el §3 como columna
  vertebral, al cerrar un bloque de contenido con volumen real.

---

## 1. Punto de partida

El sitio no tiene ninguna capa de internacionalización:

- `astro.config.mjs` no declara `i18n`.
- `BaseLayout.astro` fija `<html lang="es">` y `og:locale = es_CO`.
- No hay diccionarios, ni `Astro.currentLocale`, ni helpers de ruta.
- Todo el texto está incrustado en los `.astro`, en `src/data/*.ts`, en
  algunos `src/lib/*.ts` y en la base (títulos y descripciones de proyectos y
  de hitos de formación).

Es decir: se construye desde cero, pero también sin deuda previa que desmontar.

### Volumen real a traducir

| Bloque | Superficie | Peso |
| --- | --- | --- |
| Chrome global | `BaseLayout`, `Navbar`, `Footer`, `404` | ~350 líneas |
| Páginas de marca | 13 páginas públicas | ~3 900 líneas `.astro` |
| Notas técnicas | 14 artículos markdown | 11 383 palabras |
| Documentación `/docs` | 16 páginas + 5 módulos de datos | ~3 900 líneas + 240 KB de datos |
| LAB público | 3 páginas + labels de `src/lib/lab/` | ~820 líneas |
| Contenido en BD | `projects`, `education_milestones` | migración + UI admin |
| Assets | 8 imágenes OG, CV en PDF, `llms.txt`, manifest | generación |

---

## 2. Decisiones de arquitectura

### 2.1 Estrategia de rutas: prefijo `/en/`, español sin prefijo

```
/            → español (canónico, sin prefijo)
/en          → inglés
/engineering → /en/engineering
/notes/slug  → /en/notes/slug-en
```

**Por qué y no las alternativas:**

- *Subdominio `en.codebymike.tech`*: obliga a un segundo proyecto de Vercel o a
  reescrituras de dominio, parte la autoridad de dominio para SEO, y duplica la
  configuración de CSP/HSTS y de cookies (`portal_session`, `demo_session`
  quedarían en otro host). Descartado.
- *Detección por `Accept-Language` con redirección*: contenido variable en la
  misma URL. Rompe el `Cache-Control: public, s-maxage=300` que el middleware
  pone a todas las páginas públicas, salvo añadiendo `Vary: Accept-Language`,
  que degrada el hit-rate de la CDN. Descartado como mecanismo de ruteo; se usa
  **solo** como sugerencia no intrusiva (§4.4).
- *Cookie de idioma*: mismo problema de cacheo, y además una URL sin idioma
  propio no se puede compartir ni indexar. Descartado.

El prefijo es la única opción que da una URL estable por idioma, `hreflang`
correcto, y cero interferencia con la capa de caché existente.

### 2.2 Astro i18n en modo `manual`

```js
// astro.config.mjs
i18n: {
  locales: ['es', 'en'],
  defaultLocale: 'es',
  routing: 'manual',   // ← el middleware de i18n NO se inyecta
}
```

`routing: 'manual'` es innegociable: el `src/middleware.ts` de este repo hace
clasificación de amenazas, rate limit durable, chaos flags y gating de auth
antes que nada. Dejar que Astro inserte su propio middleware de i18n por delante
introduce un redirector que no pasa por el clasificador. Se toma de Astro solo lo
declarativo (`Astro.currentLocale`, `getRelativeLocaleUrl`) y el ruteo lo
resuelve el directorio `src/pages/en/` más los helpers propios.

### 2.3 Una sola implementación por página, no páginas duplicadas

Duplicar `src/pages/index.astro` en `src/pages/en/index.astro` significa
mantener dos copias de 549 líneas de markup que divergen al primer cambio de
diseño. En su lugar:

```
src/pages/index.astro            ← implementación única
src/pages/en/index.astro         ← 3 líneas: reexporta con locale='en'
```

El patrón concreto: cada página se refactoriza para que su markup viva en un
componente de `src/components/pages/` que recibe `locale`, y las dos entradas de
ruta son cascarones. Para páginas simples basta con que la página lea
`Astro.currentLocale` y llame a `t()`; el cascarón solo existe para que Astro
genere la ruta.

**Excepción:** los artículos de `/notes` y los diagramas Mermaid de `/docs` sí se
duplican como archivos separados — son contenido, no plantilla, y traducirlos
palabra por palabra desde un diccionario sería absurdo.

### 2.4 Diccionarios tipados con paridad forzada

```
src/i18n/
  config.ts        # LOCALES, DEFAULT_LOCALE, tipos
  routing.ts       # localizePath(), delocalizePath(), getLocaleFromUrl(), altUrls()
  format.ts        # fechas, números y moneda por locale
  es.ts            # diccionario fuente (verdad)
  en.ts            # satisfies typeof es  ← TypeScript rompe si falta una clave
  index.ts         # useTranslations(locale) → t()
```

`en.ts` se declara `satisfies typeof import('./es').default`, de modo que
`npx astro check` falla si se añade una clave en español sin su par en inglés.
Se refuerza con un test de paridad (§10) que además detecta claves *sobrantes* y
valores en inglés idénticos al español (traducción olvidada).

El diccionario se organiza por espacio de nombres coincidente con la ruta
(`nav`, `footer`, `home`, `engineering`, `status`, `security`, `docs.testing`…)
para poder cargarlo por página sin arrastrar todo el árbol al cliente.

---

## 3. ⚠️ Riesgo de seguridad: los guardas de ruta son ciegos al prefijo

Este es el punto donde una traducción mal hecha deja de ser un problema
cosmético. Todos los clasificadores de ruta comparan contra rutas literales:

| Módulo | Función | Qué pasa con `/en/...` |
| --- | --- | --- |
| `src/lib/demo.ts` | `isDemoBlockedPath` | **Bypass**: la bóveda y las envvars dejarían de estar vetadas en demo |
| `src/lib/security/paths.ts` | `isAuthPath`, `isPortalAuthPath` | El login pierde su rate limit estrecho → fuerza bruta |
| `src/lib/security/paths.ts` | `isCobroLinkPath` | Los códigos de cobro pierden el límite de 30/min |
| `src/lib/security/paths.ts` | `isRateLimitablePath` | Falsos positivos/negativos en el paraguas global |
| `src/middleware.ts` | matcher `isAdmin` | **Bypass del gate de admin** si alguna vez hubiera `/en/admin` |
| `src/middleware.ts` | `isPortalPath`, `isPrivateDeck` | Rutas privadas servidas sin sesión |

**Mitigación (Fase 0, antes de crear la primera ruta `/en/`):**

1. Normalizar el pathname **una sola vez**, al inicio del middleware, antes de
   cualquier clasificación: `const canonical = delocalizePath(pathname)`, y que
   todos los guardas reciban `canonical`.
2. `delocalizePath` vive en `src/i18n/routing.ts`, es puro y se testea con
   casos adversariales: `/en/admin`, `//en/admin`, `/EN/admin`, `/en//admin`,
   `/e%6E/admin`, `/en` a secas, `/english/algo` (que **no** debe normalizarse).
3. Regla explícita en el middleware: las rutas privadas (`/admin`, `/portal`,
   `/api/*`, `/cobrar`) **no tienen variante `/en/`**. Un `/en/admin` responde
   404 desde el middleware, no se normaliza y se sirve.
4. Test dedicado `tests/i18n-routing-guards.test.ts` que recorre la lista de
   arriba y afirma que cada guarda da el mismo veredicto para `/x` y `/en/x`.

Sin este paso, cada ruta nueva en inglés es una posible puerta trasera. Va
primero, no al final.

---

## 4. Fase 0 — Infraestructura (sin ninguna página traducida todavía)

Entregable: el andamiaje completo, con el sitio funcionando exactamente igual
que hoy en español y una única ruta `/en/` de humo.

1. `astro.config.mjs`: bloque `i18n` con `routing: 'manual'`.
2. `src/i18n/config.ts` — `LOCALES = ['es','en'] as const`, `Locale`,
   `DEFAULT_LOCALE`.
3. `src/i18n/routing.ts` — `localizePath(path, locale)`,
   `delocalizePath(path)`, `getLocaleFromUrl(url)`, `alternateUrls(path)`.
   Módulo **puro**, sin `node:crypto` ni `../db`: lo importan el middleware
   (servidor) y el selector de idioma (navegador).
4. `src/i18n/format.ts` — envuelve `Intl.DateTimeFormat`,
   `Intl.NumberFormat` e `Intl.RelativeTimeFormat` por locale. Reemplaza los
   19 usos dispersos hoy en páginas públicas (`status`, `engineering`,
   `notes`, `log`, `lab`, `EvolutionTimeline`, `CertCard`, `EngineeringFeed`,
   `IteracionesBoard`, `portal/format.ts`).
   **Decisión de moneda:** los importes siguen en COP (es la moneda real de las
   facturas); solo cambia el formateo (`es-CO` → `en-US`) y se añade el código
   `COP` explícito para que un lector anglófono no lo lea como dólares.
5. `src/i18n/es.ts` / `en.ts` / `index.ts` — diccionarios vacíos con la
   estructura de espacios de nombres y el `satisfies`.
6. **Middleware**: normalización del pathname (§3) + gate de rutas privadas.
7. `src/lib/demo.ts` y `src/lib/security/paths.ts`: reciben pathname
   canónico; se documenta en comentario *por qué* (que es lo que pide la
   convención del repo).
8. Tests: `tests/i18n-routing.test.ts` + `tests/i18n-routing-guards.test.ts`.

**Criterio de cierre:** `npm test` verde, `npx astro check` limpio,
`/en/` responde, `/en/admin` responde 404 sin tocar la base.

---

## 5. Fase 1 — Chrome global y SEO

Lo que envuelve a toda página. Traducir esto mal se nota en las 30 páginas a la vez.

### 5.1 `BaseLayout.astro`
- `<html lang={locale}>`.
- `og:locale` dinámico (`es_CO` / `en_US`) + `og:locale:alternate`.
- `hreflang`: por cada página, `<link rel="alternate" hreflang="es">`,
  `hreflang="en"` y `hreflang="x-default"` apuntando al español.
- `canonical` calculado sobre la URL localizada (hoy usa `Astro.url.pathname`
  crudo — con prefijo daría un canónico cruzado entre idiomas, que es peor que
  no tener canónico).
- `description` por defecto traducida.
- JSON-LD `WebSite`: añadir `inLanguage`.
- `<link rel="alternate" type="application/rss+xml">` apuntando al feed del
  idioma actual.
- Nueva prop `locale?: Locale` con default derivado de `Astro.currentLocale`.

### 5.2 `Navbar.astro`
- Labels desde `t('nav.*')`.
- ⚠️ `currentPath.startsWith(link.href)` se rompe con prefijo: comparar contra
  `delocalizePath(currentPath)`.
- `href` de cada enlace pasa por `localizePath`.
- Brand `aria-label`, badge "Disponible" → "Available", `aria-label="Login"`.
- **Selector de idioma**: control ES/EN que navega a la traducción *de la página
  actual* (no a la home), usando `alternateUrls`. Si la página no existe en el
  otro idioma (p. ej. una nota sin traducir), enlaza a la sección padre en vez de
  a un 404.
  → Sin `border-left` en el control ni en ningún card nuevo de este plan
  (preferencia global de diseño).

### 5.3 `Footer.astro`
- 5 grupos de enlaces + tagline + títulos de sección.
- Los `href` pasan por `localizePath`; los externos (GitHub, LinkedIn, mailto,
  WhatsApp) no cambian.

### 5.4 SEO y descubribilidad
- `src/pages/sitemap.xml.ts`: emitir ambas variantes de cada URL con
  `xhtml:link rel="alternate"` recíproco. `STATIC_PATHS` se duplica vía
  `localizePath` en vez de a mano.
- `src/pages/rss.xml.ts`: **dos feeds**. `/rss.xml` (es-CO, actual) y
  `/en/rss.xml` (en-US) con las notas traducidas. Un feed mezclado con dos
  idiomas es peor que dos feeds.
- `public/robots.txt`: sin cambios de reglas, pero verificar que
  `Disallow: /admin` y `/api` cubren el 404 de `/en/admin` (lo cubre el
  middleware, no robots).
- `public/site.webmanifest`: `name`/`description` en español se quedan; se añade
  `lang: "es"` y se evalúa un manifest por idioma solo si se instala como PWA
  (hoy `display: browser`, así que **no** se duplica).
- `public/llms.txt`: reescribir para listar ambas versiones.
- `src/lib/indexnow.ts` + `scripts/submit-indexnow.mjs`: enviar también las URLs
  `/en/`; el cron `/api/cron/indexnow` las recoge del sitemap.
- Alta manual en Search Console/Bing de la propiedad en inglés (queda en
  `seo.MD`, es tarea humana).

### 5.5 `404.astro`
Única página que debe funcionar sin saber su idioma. Deriva el locale del
prefijo de la URL fallida; si no hay prefijo, español.

---

## 6. Fase 2 — Páginas de marca técnica

El bloque de mayor retorno: es lo que ve un reclutador o cliente internacional.

| Página | Líneas | Notas de traducción |
| --- | --- | --- |
| `index.astro` | 549 | Hero, secciones de servicios, CTA. Copy de marca: adaptación, no traducción literal |
| `engineering.astro` | 680 | Métricas en vivo + narrativa. Cuidado con los `Intl.*` (3 usos) |
| `status.astro` | 650 | Página pública de estado. Labels de estado vienen de `src/lib/monitors.ts` y `slo.ts` → traducir en el diccionario, no en la lib |
| `security.astro` | 422 | **OPSEC**: la versión en inglés mantiene la misma regla — solo agregados, nunca nombres de reglas de detección ni rutas honeypot |
| `tools.astro` | 283 | 7 casos de estudio con `problema`/`solucion`/`detalle`/`stack` inline → extraer a diccionario |
| `contact.astro` | 290 | Formulario: labels, placeholders, validación y estados de éxito/error (ver §6.1) |
| `architecture.astro` | 181 | Diagrama Mermaid con etiquetas en español → variante EN del grafo |
| `certifications.astro` | 149 | Títulos vienen de BD (Fase 3); los estados `en_curso`/`completado`/`pausado` del diccionario |
| `log.astro` | 451 | `noindex`, feed vivo de GitHub. Traducir chrome, no los commits |
| `demo.astro` | 108 | Landing del pase de demo. El panel destino sigue en español: decirlo explícitamente en la página EN |
| `cv/descargar.astro` | 70 | Ver §8 (CV en inglés) |
| `hola.astro` | 157 | Tarjeta de presentación / enlace corto |
| `platziconf.astro` | 221 | Evento local en español. **Se traduce igual** (el usuario pidió no dejar nada fuera), pero es la candidata natural a recortar si hay que priorizar |

### 6.1 Componentes compartidos
`ProjectCard`, `CertCard`, `GithubProjects`, `EngineeringFeed`,
`EvolutionTimeline`, `CardPopover`, `ToolMock`, `AmbientBlobs` (sin texto),
`WebVitals` (sin texto). Todos reciben `locale` por prop o lo leen de
`Astro.currentLocale`.

### 6.2 Endpoints públicos que devuelven texto
`/api/contact` devuelve mensajes de validación y de éxito. Deben responder en el
idioma del formulario que los invocó: el cliente envía un campo `locale`
validado contra `LOCALES` (nunca se confía en `Referer`), y el endpoint elige el
diccionario. Mismo tratamiento para `/api/lab/site-check`, `/api/mis-pagos/lookup`
y `/api/payments/checkout`. El correo de notificación al admin (`notify.ts`)
**sigue en español** — el destinatario es Mike.

---

## 7. Fase 3 — Contenido dinámico en base de datos

`/projects/[slug]` y `/certifications` renderizan texto que vive en Turso.
Traducir las plantillas y dejar el contenido en español sería incoherente.

**Migración aditiva** (nunca destructiva, según convención del repo):

```sql
-- projects
ALTER TABLE projects ADD COLUMN title_en TEXT;
ALTER TABLE projects ADD COLUMN description_en TEXT;
-- education_milestones
ALTER TABLE education_milestones ADD COLUMN title_en TEXT;
ALTER TABLE education_milestones ADD COLUMN description_en TEXT;
ALTER TABLE education_milestones ADD COLUMN institution_en TEXT;
```

- `tech_stack` y `skills` son listas de nombres propios (TypeScript, Drizzle) →
  **no se traducen**.
- **Fallback explícito**: helper `pickLocalized(row, field, locale)` que cae al
  español si la columna `_en` está vacía. Un proyecto sin traducir se muestra en
  español, nunca en blanco. El helper es puro y se testea.
- Admin: campos `_en` en `src/pages/admin/projects/[id].astro` y
  `admin/education.astro`, más sus endpoints. La UI del admin sigue en español;
  solo se añaden los campos.
- Generar el SQL con `npx drizzle-kit generate` y **revisarlo antes de aplicar**
  (el gotcha conocido de `INSERT...SELECT` con columnas nuevas).
- El sitemap solo emite `/en/projects/<slug>` para proyectos con `title_en`
  presente; anunciar una URL en inglés con contenido español es thin content.

---

## 8. Fase 4 — Notas técnicas (`/notes`)

14 artículos, 11 383 palabras. Es el contenido con más valor para audiencia
internacional y el más caro de traducir.

**Estructura de colección:**

```
src/content/notes/
  es/<slug>.md      ← se mueven los 14 actuales
  en/<slug>.md
```

`src/content.config.ts`: el `glob` pasa a `**/*.md` con base en
`./src/content/notes`, y el schema gana `lang: z.enum(['es','en'])` derivado del
directorio, más `translationOf: z.string().optional()` que apunta al slug
hermano (necesario para el `hreflang` y para el selector de idioma).

⚠️ Los IDs de las entradas cambian (`slug` → `es/slug`). Hay que actualizar:
`notes/index.astro`, `notes/[slug].astro`, `rss.xml.ts`, `sitemap.xml.ts` y
cualquier enlace cruzado dentro de los propios artículos. **Redirecciones 301**
no hacen falta si `/notes/<slug>` se mantiene como ruta (el `[slug]` resuelve
contra `es/<slug>`), y eso es lo que se hará: las URLs públicas actuales no
cambian.

**Slugs en inglés:** cada artículo tiene su propio slug traducido
(`por-que-construi-mi-propio-monitor` → `why-i-built-my-own-monitor`), no el
slug español bajo `/en/`. `translationOf` los enlaza.

**Traducción, no localización literal:** son artículos en primera persona con
voz propia. La versión inglesa debe leerse escrita en inglés, no traducida.
Los bloques de código, nombres de archivo y comandos no se tocan; los
**comentarios en español dentro de los snippets sí** se traducen (si no, un
lector anglófono ve código comentado en un idioma que no lee).

---

## 9. Fase 5 — LAB público

`lab/index.astro` (453), `lab/site-check/index.astro` (282),
`lab/fingerprint/index.astro` (88) + `[room]/index.astro` + `[room]/board.astro`.

- Labels de veredictos y hallazgos viven en `src/lib/lab/findings.ts` (219
  líneas) y `src/lib/lab/mutation.ts` → mover los textos al diccionario y dejar
  la lib emitiendo **claves**, no frases. Esto es refactor real, no solo
  traducción, y es la parte más delicada de la fase.
- `src/lib/diagnostics.ts` y `src/lib/chaos.ts`: mismo tratamiento para lo que
  se muestre en público.
- `education-paths.ts` (395 líneas, rutas de aprendizaje del Evolution Path):
  contenido estático largo → estructura bilingüe inline
  (`{ es: '…', en: '…' }`) porque son pocos campos por ítem y separarlo en dos
  archivos los desincronizaría.
- La sala de fingerprint es multi-usuario en tiempo real: dos personas en
  idiomas distintos comparten sala. Los datos de la sala son neutros (números,
  hashes); solo el chrome cambia. Verificar que ningún texto de sala se persiste
  ya traducido en la base.

---

## 10. Fase 6 — Documentación `/docs`

El bloque más pesado y el de decisión menos obvia.

**Superficie:** 16 páginas públicas (~3 900 líneas) alimentadas por 5 módulos de
datos que suman ~240 KB: `documentacion.ts` (521 líneas), `iteraciones-portfolio.ts`
(1 136), `iteraciones.ts` (794), `testing.ts` (734), `vyv.ts` (275).

**Contexto honesto:** `/docs` es material académico (sustentación SENA) con
vocabulario normativo español — casos de uso, historias de usuario en formato XP,
ISO/IEC 25010, IEEE 1012, kanban. Su audiencia natural es el jurado, no un
reclutador extranjero. Es la fase con peor relación esfuerzo/retorno del plan.

**Se incluye igualmente**, porque el encargo fue explícito ("no dejes nada por
fuera"), y porque un `/docs` en inglés es una vitrina fuerte de ingeniería de
software formal. Pero va **última entre las de contenido** y es la primera
candidata a recortar si el plan se comprime.

**Enfoque de datos:** los 5 módulos pasan a campos bilingües inline
(`titulo: { es, en }`). Alternativa descartada: archivos `*.en.ts` paralelos —
con 5 módulos que cambian cada iteración, la desincronización es cuestión de
semanas. Inline duele al leer el archivo pero garantiza que quien añade un
requisito ve el hueco en inglés.

**Sub-bloques:**
- 7 páginas de diagramas Mermaid → grafos con etiquetas en inglés (archivo de
  definición por idioma; el diagrama es contenido, no plantilla).
- `docs/testing.astro` (540) y `docs/verificacion-validacion.astro` (395):
  interactivas, con simulación de corrida → traducir también los strings de la
  simulación en el `<script>` del cliente.
- `docs/pipeline-en-vivo.astro` (332): datos reales de GitHub Actions
  (en inglés de origen); solo el chrome.
- `docs/kanban.astro`, `requerimientos-*.astro`: cascarones sobre los datos.
- `DocsNav.astro`, `IteracionesBoard.astro`, `docs/PipelineMap.astro`,
  `docs/TestAnatomy.astro`.
- `docs/presentacion.astro` (967 líneas) es **privada** (gate `isPrivateDeck` en
  el middleware) → **fuera de alcance**, es la única exclusión de este plan y es
  por definición de "parte pública", no por recorte.

---

## 11. Fase 7 — Flujos con audiencia local

Estas superficies son públicas por URL pero su audiencia real es Colombia.

| Superficie | Recomendación |
| --- | --- |
| `paginas-web.astro` (549) | Landing de venta a clientes NO técnicos colombianos, con precios en COP y WhatsApp. Traducirla es *posible* pero el producto no se vende en inglés. **Se traduce** por el encargo; se marca como la de menor prioridad junto con `/docs` |
| `/c/[code]`, `/mis-pagos`, `/pay`, `/pay/gracias` | Cobro de campo por WhatsApp, cliente colombiano frente al técnico. **Se traducen** con prioridad baja; el mecanismo (locale desde el link firmado) debe quedar listo aunque el contenido tarde |
| `/portal/login`, `/olvide`, `/invitacion/[token]`, `/restablecer/[token]` | Puertas públicas de un portal cuyo interior queda en español. Traducir solo la puerta produce una experiencia rota → **se traducen únicamente si se traduce el portal completo**, que está fuera de alcance. Queda documentado como exclusión razonada |
| `/login`, `/logout`, `/entrar` | Gates del admin. Mismo criterio: fuera |
| `/present/[token]` | Slides con contenido subido por Mike; el chrome se traduce, el contenido depende del deck |

⚠️ Los links de cobro y de invitación llevan tokens firmados. Si alguna vez se
localizan, el locale va **fuera** del payload firmado (es presentación, no
autorización) y se valida contra `LOCALES` antes de usarse.

---

## 12. Fase 8 — Assets

- **8 imágenes OG** (`og-default`, `-tools`, `-notes`, `-security`, `-status`,
  `-engineering`, `-certifications`, `-contact`, `-log`) llevan texto en español
  quemado. `scripts/og/generate.mjs` se parametriza por locale y emite
  `og-<name>-en.png`. `BaseLayout` elige según locale.
- **CV en PDF**: `public/cv/CV_Michael_Rodriguez_2026.pdf` está en español.
  Añadir `CV_Michael_Rodriguez_2026_EN.pdf` y que `/api/cv/download` y
  `/cv/descargar` sirvan la variante según locale. `src/lib/cv-downloads.ts`
  registra qué variante se descargó (columna nueva o sufijo en el label) —
  saber si el tráfico internacional descarga el CV es la métrica que justifica
  todo este plan.
- `public/llms.txt` reescrito con ambas versiones.
- `public/videos` y `public/assets`: auditar si alguno lleva texto en pantalla.

---

## 13. Fase 9 — Verificación

**Unitarios (Vitest, lógica pura, sin BD):**
- `tests/i18n-routing.test.ts` — `localizePath`/`delocalizePath` ida y vuelta,
  casos adversariales del §3.
- `tests/i18n-routing-guards.test.ts` — cada guarda de `paths.ts` y `demo.ts` da
  el mismo veredicto para `/x` y `/en/x`; `/en/admin` nunca es servible.
- `tests/i18n-dictionary.test.ts` — paridad de claves ES/EN, sin claves
  huérfanas, sin valores EN idénticos al ES (traducción olvidada), sin
  interpolaciones (`{n}`) presentes en un idioma y ausentes en el otro.
- `tests/i18n-format.test.ts` — fechas y moneda por locale, COP explícito.
- `tests/i18n-fallback.test.ts` — `pickLocalized` cae al español y nunca
  devuelve vacío.

**E2E (Playwright):**
- El selector de idioma preserva la página (no manda a la home).
- `hreflang` recíproco: la EN apunta a la ES y viceversa.
- `/en/admin`, `/en/api/...`, `/en/portal/...` → 404, sin sesión emitida.
- Un proyecto sin `title_en` se ve en español dentro de `/en`, sin huecos.
- Formulario de contacto en `/en/contact` responde con mensajes en inglés.

**Manual:**
- `npx astro check` limpio (la garantía real de paridad de diccionarios).
- Lighthouse/axe sobre 3 páginas EN — `lang` correcto es criterio WCAG
  (3.1.1 Language of Page); un `lang="es"` con contenido inglés es una
  violación real, no cosmética.
- Revisar que el middleware sigue poniendo `Cache-Control` correcto en `/en/*`.

---

## 14. Documentación del propio trabajo (convención del repo)

No es opcional: un feature que no aparece en `/docs` no existe para la
sustentación.

1. `src/data/documentacion.ts`: requisitos nuevos (RF de internacionalización,
   RNF de accesibilidad idiomática y de SEO multilingüe) entran como `planeado`
   y se promueven a `implementado` al entregar, con `origen` (`src/i18n/`,
   `middleware.ts`) y `verificacion` (los tests del §13).
2. `src/data/iteraciones-portfolio.ts`: entrada de la iteración al cerrarla.
3. `src/content/notes/`: artículo de caso de estudio. Título candidato —
   *"Traducir un sitio sin duplicarlo (y sin abrir un bypass de seguridad)"*,
   con el §3 como columna vertebral. Es exactamente el tipo de hallazgo que
   merece nota propia. Se publica en ambos idiomas.
4. Este plan se actualiza al implementar (fases ✅, decisiones que surgieron),
   no se deja estático.

---

## 15. Orden de ejecución y cortes posibles

```
Fase 0  Infraestructura + guardas          ← bloqueante, nada empieza sin esto
Fase 1  Chrome global + SEO                ← habilita todo lo demás
Fase 2  Páginas de marca                   ← máximo retorno
Fase 3  Contenido en BD                    ← sin esto, la Fase 2 se ve a medias
Fase 4  Notas                              ← el activo de más valor internacional
Fase 5  LAB                                ← incluye refactor de libs a claves
Fase 8  Assets (OG + CV EN)                ← se puede adelantar; es independiente
Fase 6  /docs                              ← el más pesado, el de menor ROI
Fase 7  Flujos locales                     ← audiencia colombiana
Fase 9  Verificación                       ← continua, no solo al final
```

Si hay que comprimir, el corte natural es **después de la Fase 4 + Fase 8**: se
obtiene un sitio en inglés completo y coherente para la audiencia
internacional, con `hreflang` correcto, y las Fases 5–7 quedan como
incremento. Las Fases 0 y 1 no admiten recorte parcial: media
internacionalización es peor que ninguna, porque es cuando aparecen los
bypasses del §3.

---

## 16. Decisiones abiertas

1. **¿`/docs` entra de verdad?** El plan lo incluye por el encargo explícito.
   Confirmar antes de empezar la Fase 6 — son ~240 KB de datos y vocabulario
   normativo que hay que traducir con criterio, no con diccionario.
2. **¿`/paginas-web` en inglés?** Producto vendido en COP por WhatsApp a
   clientes colombianos. Incluido, pero sin audiencia identificada.
3. **Voz de la marca en inglés.** El copy español tiene una voz muy marcada
   ("rendimiento obsesivo", "experiencias de clase mundial"). Traducirlo literal
   suena a plantilla. Conviene fijar 3–4 frases ancla en inglés antes de la Fase
   2 y derivar el resto de ahí.
