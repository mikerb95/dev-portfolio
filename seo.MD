# Auditoría SEO — Portfolio CodeByMike

**Fecha:** 2026-06-09
**Stack:** Astro 6 (SSR, `output: 'server'`) + Vercel + Tailwind 4 + Turso/libSQL
**Páginas públicas auditadas:** `/`, `/projects/[slug]`, `/certifications`, `/log`, `/contact`

---

## Resumen ejecutivo

La base es sólida: HTML semántico, una sola `h1` por página, `lang="es"`, `alt` en imágenes, títulos únicos por página y el panel `/admin` correctamente protegido con `X-Robots-Tag: noindex`. Sin embargo, **falta toda la capa de descubribilidad y compartibilidad**: no hay sitemap, ni robots.txt, ni Open Graph, ni canonical, ni datos estructurados. Para un portfolio (cuyo tráfico llega en gran parte por enlaces compartidos en LinkedIn/WhatsApp y por búsquedas de marca personal), los metadatos de compartir son el hallazgo más costoso.

En rendimiento, los dos problemas dominantes son: **fuentes de Google render-blocking** (3 familias, 14 pesos) que retrasan el LCP —que aquí es texto—, y **SSR sin caché en todas las páginas públicas**, donde cada visita paga invocación de función + query a la base de datos (TTFB alto).

| Severidad | Hallazgos |
|---|---|
| 🔴 Crítico | 6 |
| 🟡 Medio | 6 |
| 🟢 Menor | 4 |

---

## 🔴 Hallazgos críticos

### 1. Sin Open Graph ni Twitter Cards
**Dónde:** `src/layouts/BaseLayout.astro:16-24`

El `<head>` solo tiene charset, viewport, description y title. Al compartir cualquier URL en LinkedIn, WhatsApp, X o Slack no se genera tarjeta de vista previa (sin imagen, sin título formateado). Para un portfolio este es el canal de adquisición principal.

**Fix recomendado** — ampliar `BaseLayout.astro` con props `image` y `canonical`:

```astro
---
const site = 'https://codebymike.tech'
const canonical = new URL(Astro.url.pathname, site).href
const { title, description = '...', image = `${site}/og-default.png` } = Astro.props
---
<link rel="canonical" href={canonical} />
<meta property="og:type" content="website" />
<meta property="og:url" content={canonical} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={image} />
<meta property="og:locale" content="es_CO" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={image} />
```

Crear una imagen OG por defecto (1200×630) en `public/og-default.png`, y en `/projects/[slug]` pasar `image={project.screenshotUrl}` cuando exista.

### 2. Sin sitemap.xml ni robots.txt
**Dónde:** `public/` (no existen), `astro.config.mjs` (sin integración)

Google puede descubrir el sitio igualmente, pero sin sitemap no hay control de qué se indexa ni señal de frescura, y sin robots.txt los crawlers intentan `/admin` y `/api` (el middleware los protege, pero gasta crawl budget y genera 403/redirects en Search Console).

Con `output: 'server'`, `@astrojs/sitemap` solo cubre rutas prerenderizadas; como las rutas de proyectos vienen de la BD, lo más robusto es un endpoint dinámico:

```ts
// src/pages/sitemap.xml.ts
export const GET = async () => {
  const projs = await db.select().from(projects).where(eq(projects.visible, true))
  const urls = ['/', '/certifications', '/log', '/contact',
    ...projs.map(p => `/projects/${p.slug}`)]
  // ...generar XML con <lastmod> desde updatedAt
}
```

Y `public/robots.txt`:

```
User-agent: *
Disallow: /admin
Disallow: /api
Sitemap: https://codebymike.tech/sitemap.xml
```

### 3. Sin URL canónica ni `site` configurado
**Dónde:** `astro.config.mjs` (falta `site:`), `BaseLayout.astro`

Sin `<link rel="canonical">`, las variantes de URL (query params, trailing slash, dominio `.vercel.app` de los deploys preview) pueden indexarse como duplicados. Añadir `site: 'https://codebymike.tech'` en `astro.config.mjs` y el canonical del punto 1. Verificar también en Vercel que el dominio apex/www redirige 308 a la variante canónica (Vercel lo hace si el dominio secundario está marcado como redirect).

### 4. Soft-404 en proyectos inexistentes
**Dónde:** `src/pages/projects/[slug].astro:16` — `return Astro.redirect('/404')`

Dos problemas: (a) responde **302** en lugar de **404**, así que los crawlers tratan URLs muertas como válidas (soft-404 en Search Console); (b) `/404` no existe como página (`src/pages/404.astro` no está), así que el redirect aterriza en el 404 genérico del adapter.

**Fix:** crear `src/pages/404.astro` con el layout del sitio, y en `[slug].astro`:

```ts
if (!project || !project.visible) {
  return new Response(null, { status: 404 })
  // o: Astro.rewrite('/404') manteniendo status 404
}
```

### 5. Sin datos estructurados (JSON-LD)
**Dónde:** todo el sitio

Para un portfolio personal, los schemas con mejor retorno son:

- **`Person`** en la home (nombre, jobTitle, sameAs → GitHub, LinkedIn) — alimenta el Knowledge Panel y búsquedas de marca personal.
- **`WebSite`** en el layout base.
- **`CreativeWork`/`SoftwareSourceCode`** en `/projects/[slug]`.
- **`BreadcrumbList`** en páginas internas.

```astro
<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Mike",
  "jobTitle": "Senior Software Engineer",
  "url": "https://codebymike.tech",
  "sameAs": ["https://github.com/mikerb95", "https://www.linkedin.com/in/mdrb95/"]
})} />
```

### 6. Fuentes de Google render-blocking y sobredimensionadas
**Dónde:** `BaseLayout.astro:21-23`

Se cargan **3 familias / 14 pesos** (Inter ×7, JetBrains Mono ×5, Instrument Serif ×2) desde `fonts.googleapis.com`. Impacto:

- El CSS de fuentes es **render-blocking**: añade DNS + TLS + RTT a un tercer origen antes del primer render (~300-600ms en móvil/3G).
- El LCP de la home es la `h1` de texto (`index.astro:29`); con `display=swap` hay FOUT y el LCP puede re-medirse con el swap.
- Google Fonts ya no se beneficia de caché compartida entre sitios (cache partitioning desde 2020): el tercer origen es puro costo.

**Fix (mayor impacto de rendimiento de toda la auditoría):**
1. **Self-host** con la API de fuentes experimental de Astro o `@fontsource-variable/inter` — las variable fonts reemplazan los 7 pesos de Inter con un solo archivo.
2. Reducir pesos: en el CSS solo se usan sans/mono/serif sin tantos cortes; auditar cuáles se usan realmente.
3. `<link rel="preload" as="font">` para la fuente del hero (Inter) con `font-display: swap` u `optional`.
4. Subset `latin` únicamente.

---

## 🟡 Hallazgos medios

### 7. SSR sin caché en todas las páginas públicas → TTFB alto
**Dónde:** `astro.config.mjs` (`output: 'server'`, ningún `prerender`), `index.astro:8-12`, `[slug].astro:9-27`

Cada vista de la home ejecuta una invocación de función Vercel + 1-3 queries a Turso. El contenido solo cambia cuando editas desde `/admin`, así que estás pagando latencia dinámica por contenido casi estático. Opciones por orden de simplicidad:

1. **Cache-Control con SWR** en las páginas públicas (mantiene SSR, sirve desde el edge):
   ```ts
   Astro.response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
   ```
2. **ISR del adapter Vercel** (`isr: { expiration: 300 }` en `vercel()`), excluyendo `/admin` y `/api` con `exclude`.
3. `export const prerender = true` en `/contact` (no depende de BD en el render… verificar) y regenerar en deploy.

El endpoint `api/github/activity.ts:214` ya hace esto bien (`s-maxage=1800, stale-while-revalidate`) — replicar el patrón.

### 8. Imágenes sin optimizar (CLS + peso)
**Dónde:** `src/components/ProjectCard.astro:21-26`, `CertCard.astro:44-48`, `[slug].astro` (screenshot)

Los `<img>` apuntan directo a Vercel Blob sin `width`/`height` (provoca **CLS** al cargar), sin `srcset/sizes`, y sirviendo el formato original (probablemente PNG pesado de screenshots) en vez de AVIF/WebP. `loading="lazy"` y `alt` ya están bien ✓.

**Fix:** el adapter de Vercel soporta el servicio de imágenes de la plataforma. Activar en `astro.config.mjs`:

```js
adapter: vercel({ imageService: true })
```

y usar `<Image>` de `astro:assets` con `width`/`height` explícitos (o `inferSize` para remotas), declarando el dominio del Blob en `image.domains`. Añadir también `decoding="async"`.

### 9. Contenido de `/log` renderizado solo en cliente
**Dónde:** `src/pages/log.astro:174` (`fetch('/api/github/activity')` en `<script>`)

El feed de commits y las métricas se montan vía JS tras la carga. Google ejecuta JS pero con retraso e inconsistencia, y el HTML inicial de la página queda casi vacío (thin content). Si quieres que `/log` posicione, mover el fetch al frontmatter (SSR) y dejar el cliente solo para refresco. Si es una página "viva" sin intención SEO, es aceptable, pero entonces conviene `noindex` o excluirla del sitemap para no diluir.

### 10. Sin favicon enlazado en el `<head>` ni manifest
**Dónde:** `BaseLayout.astro` (sin `<link rel="icon">`), `public/` tiene `favicon.svg` y `favicon.ico` sin referenciar

Los navegadores caen al `/favicon.ico` implícito, pero el SVG no se usa y faltan `apple-touch-icon`, `manifest.webmanifest` y `theme-color` (puntos de Lighthouse Best Practices/PWA y de presentación en resultados de búsqueda móviles, donde Google muestra el favicon):

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="theme-color" content="#07070a" />
```

### 11. Meta description de la home genérica y sin marca
**Dónde:** `index.astro:15` (no pasa `description`, usa el default del layout)

La home —la página más importante— usa la descripción por defecto, que no menciona nombre, marca (`CodeByMike`), ubicación ni stack. Escribir una específica (~150 caracteres) con los términos por los que quieres aparecer: "Mike — Senior Software Engineer en Colombia. TypeScript, React, Next.js, Astro y Node.js. Productos escalables y rendimiento obsesivo." Las demás páginas ya tienen descriptions propias ✓.

### 12. Headers de seguridad solo en `/admin`
**Dónde:** `src/middleware.ts:24-29`

`X-Content-Type-Options`, `Referrer-Policy`, etc. solo se aplican a rutas admin. Lighthouse (Best Practices) y los scanners penalizan su ausencia en el resto. Mover `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin` a todas las respuestas, y valorar una CSP básica. No afecta ranking directamente, pero sí la puntuación Lighthouse y la confianza.

---

## 🟢 Hallazgos menores

### 13. CSS global de 60 KB sin purgar revisión
`dist/client/_astro/global.*.css` pesa 60 KB sin comprimir (~10 KB con Brotli en Vercel). Aceptable, pero al ser Tailwind 4 conviene confirmar que no se están incluyendo utilidades del panel `/admin` en el bundle público (los layouts comparten `global.css`). Si el CSS del admin es significativo, separar hoja para `AdminLayout`.

### 14. Enlaces externos sin `rel="noopener"`
Los enlaces a GitHub/LinkedIn/WhatsApp en `Footer.astro`/`Navbar.astro` — verificar que los que usan `target="_blank"` llevan `rel="noopener noreferrer"`. (Los navegadores modernos lo implican con `target="_blank"`, pero Lighthouse aún lo marca.)

### 15. Sin `meta name="generator"` ni hreflang
- Hreflang: solo aplica si planeas versión EN del portfolio (recomendable para alcance internacional como freelance remoto — hoy todo el contenido es ES).
- El atributo `lang="es"` está bien; si el público objetivo es Colombia considera `lang="es-CO"` (impacto marginal).

### 16. Accesibilidad que afecta Lighthouse SEO score
- Botón/enlaces solo-icono (SVGs de flechas en `index.astro`) van acompañados de texto ✓.
- Verificar contraste de `text-ink-300` (#4d4d5d) sobre `#07070a` — ratio ≈ 3.2:1, **falla AA para texto pequeño** (los labels mono de 10-11px). Subir a `ink-200` en textos informativos pequeños.

---

## Lo que ya está bien ✓

- `lang="es"` en `<html>`, charset y viewport correctos.
- Una sola `h1` por página, jerarquía de headings coherente.
- `alt` descriptivo en todas las imágenes (`ProjectCard`, `CertCard`).
- `loading="lazy"` en imágenes bajo el fold.
- Títulos únicos y con patrón de marca (`Página — CodeByMike`).
- `/admin` y `/api/admin` protegidos con sesión + `X-Robots-Tag: noindex, nofollow` (`middleware.ts:28`).
- `preconnect` a los orígenes de fuentes (mitiga parcialmente el punto 6).
- API de GitHub con `Cache-Control` + SWR bien configurado.
- URLs limpias y descriptivas (`/projects/[slug]` con slugs legibles).
- Sin JS de frameworks en el cliente en páginas públicas (Astro islands; solo 8 KB de script).

---

## Plan de acción priorizado

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Open Graph + Twitter Cards + imagen OG por defecto | Alto (compartibilidad) | Bajo |
| 2 | `site` en config + canonical en layout | Alto (indexación) | Bajo |
| 3 | robots.txt + sitemap.xml dinámico | Alto (indexación) | Bajo |
| 4 | Self-host de fuentes + variable fonts + preload | Alto (LCP/Lighthouse) | Medio |
| 5 | 404 real (`404.astro` + status 404 en `[slug]`) | Medio | Bajo |
| 6 | Cache-Control/ISR en páginas públicas | Alto (TTFB) | Bajo |
| 7 | JSON-LD `Person` + `WebSite` + `CreativeWork` | Medio | Bajo |
| 8 | `imageService: true` + `<Image>` con dimensiones | Medio (CLS/peso) | Medio |
| 9 | Description específica para la home | Medio | Trivial |
| 10 | Favicon links + theme-color + apple-touch-icon | Bajo | Trivial |
| 11 | SSR del contenido de `/log` (o `noindex`) | Bajo | Medio |
| 12 | Headers de seguridad globales | Bajo (Lighthouse) | Bajo |

**Después de implementar:** dar de alta el dominio en Google Search Console, enviar el sitemap, y medir con PageSpeed Insights (datos de campo CrUX tardarán ~28 días en aparecer).

---

## Estimación Lighthouse actual (análisis estático)

| Categoría | Estimado hoy | Tras plan de acción |
|---|---|---|
| Performance | ~75-85 (fuentes bloqueantes, TTFB SSR, imágenes sin dimensiones) | 95+ |
| SEO | ~77-85 (sin canonical, soft-404, sin robots válido para crawl) | 100 |
| Best Practices | ~90 (headers, favicon) | 100 |
| Accessibility | ~85-90 (contraste de textos pequeños) | 95+ |

*Estimaciones basadas en inspección de código; ejecutar Lighthouse real contra producción para la línea base exacta.*
