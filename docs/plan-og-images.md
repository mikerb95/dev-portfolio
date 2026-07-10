# Plan: imágenes OG por sección de la navbar

**Objetivo:** que cada sección visible en la navbar tenga su propia imagen de preview (1200×630) al compartir el link por WhatsApp/redes, con el mismo nivel de calidad que la actual de `/status`.

**Fecha:** 2026-07-10 · **Estado:** propuesto

---

## Situación actual

| Página | Imagen OG hoy | Acción |
|---|---|---|
| `/` (home) | `og-default.png` | ✅ ya tiene identidad propia |
| `/status` | `og-status.png` | ✅ referencia de estilo |
| `/tools` | `og-tools.png` | ✅ ya existe |
| `/engineering` | `og-default.png` (prestada) | 🆕 crear `og-engineering.png` |
| `/notes` | default (no pasa `image`) | 🆕 crear `og-notes.png` |
| `/security` | `og-status.png` (prestada) | 🆕 crear `og-security.png` |
| `/certifications` | default (no pasa `image`) | 🆕 crear `og-certifications.png` |
| `/log` | default (no pasa `image`) | 🆕 crear `og-log.png` |
| `/contact` (botón CTA) | default | 🆕 opcional: `og-contact.png` |

Problema adicional: los PNG actuales no tienen fuente en el repo — no se pueden regenerar ni mantener consistentes. Este plan lo corrige.

## Enfoque: generador reproducible en `scripts/og/`

Un template HTML por sección + un script que lo renderiza y captura a 1200×630. Los PNG resultantes se commitean en `public/` como hasta ahora (cero costo en runtime, cero dependencias en prod).

1. **`scripts/og/template.html`** — esqueleto compartido con el sistema visual ya establecido:
   - Fondo oscuro `#050a0c` con textura de grid/puntos sutil.
   - Kicker superior: `/<ruta>` en JetBrains Mono cian + etiqueta en gris tracking ancho.
   - Título en Inter bold blanco + segunda línea en Instrument Serif itálica cian.
   - Descripción en gris, wordmark `CODEBYMIKE` abajo a la derecha.
   - Un "adorno de datos" distinto por sección (como las barras de uptime en la de status).
2. **`scripts/og/sections.mjs`** — datos por sección (ruta, kicker, título, subtítulo itálico, descripción, adorno).
3. **`scripts/og/generate.mjs`** — abre el template con Playwright (devDependency, ya se usa `npx playwright` sin ensuciar prod), viewport 1200×630, screenshot por sección a `public/og-<seccion>.png`. Script npm: `npm run og:generate`.
4. Regenerar también `og-status`, `og-tools` y `og-default` desde el template para que todo el set sea reproducible (comparando visualmente antes de reemplazar).

## Copy propuesto por sección

- **engineering** — kicker `/ENGINEERING · CÓMO CONSTRUYO`; título "Decisiones de ingeniería, *explicadas con evidencia.*"; adorno: mini-diagrama de arquitectura (cajas conectadas).
- **notes** — kicker `/NOTES · APUNTES TÉCNICOS`; título "Notas de ingeniería, *escritas mientras construyo.*"; adorno: líneas tipo prosa/markdown.
- **security** — kicker `/SECURITY · DEFENSA ACTIVA`; título "Seguridad del sitio, *vigilada, no asumida.*"; adorno: filas tipo log de eventos con severidades.
- **certifications** — kicker `/CERTIFICATIONS · CREDENCIALES`; título "Certificaciones, *verificables, no decorativas.*"; adorno: badges/sellos minimal.
- **log** — kicker `/LOG · BITÁCORA`; título "Registro de cambios, *commit a commit.*"; adorno: grafo de commits estilo git.
- **contact** (opcional) — kicker `/CONTACT · DISPONIBLE`; título "Hablemos, *sin intermediarios.*"; adorno: punto verde "disponible".

## Cableado en las páginas

Añadir/ajustar el prop `image` en el `<BaseLayout>` de cada página:
`engineering.astro`, `notes/index.astro`, `security.astro`, `certifications.astro`, `log.astro` (y `contact.astro` si se incluye).

## Verificación

1. `npm run og:generate` produce los 6-7 PNG a 1200×630, < ~200 KB cada uno.
2. `npm run build && npm run preview` → revisar `og:image` en el `<head>` de cada ruta.
3. Tras deploy: validar con opengraph.xyz o el debugger de Facebook/LinkedIn cada URL.
4. WhatsApp cachea previews agresivamente: probar con `?v=2` en el link si muestra la imagen vieja.

## Futuro (fuera de alcance)

- OG dinámica por artículo en `/notes/[slug]` (título del artículo en la imagen) — requeriría satori o un endpoint; con ~5 artículos aún no se justifica.

## Estimación

- Template + script + datos: ~2-3 h.
- Copy/adornos por sección + cableado de páginas: ~1-2 h.
