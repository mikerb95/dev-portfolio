# Plan: modo claro (RF-043)

Decidido el 11 nov 2026. Paleta elegida: **"neón sobre blanco"** (entre tres
muestras: espejo frío, neón sobre blanco, islas de tinta).

## Decisiones

- **Solo color.** Ni fuentes, ni tamaños, ni radios, ni espacios.
- **Alcance:** todo el sitio, incluido el portal de clientes y `/admin`.
- **Activación:** sigue el tema del dispositivo; un botón en la barra lo cambia
  y lo recuerda (`localStorage`, clave `tema`).
- **Piezas con motion:** se recolorean a claro, no se quedan oscuras.
- **Fondo** blanco puro, tinta casi negra. El cian `#00f2ff` se conserva donde
  es **relleno** (botones, puntos, cursor) con texto oscuro encima; donde es
  **texto o trazo** baja a `#007a82`. Mismo criterio para ember, lima y violeta.

## Cómo funciona

1. `src/styles/global.css` tiene el bloque `:root[data-tema="claro"]`, que
   redefine la escala de tinta, `--color-white` (pasa a ser tinta, así
   `border-white/10` y `bg-white/5` siguen siendo un velo sobre el fondo) y los
   acentos. Las clases de Tailwind cambian solas.
2. Relleno y texto van separados con los espacios de nombres de Tailwind 4:
   `--background-color-cyan` (relleno) frente a `--color-cyan` (todo lo demás).
   `--text-color-ink-950` queda fijo: es el texto sobre un relleno de acento.
3. Los estilos escritos a mano usan canales: `rgb(var(--rgb-luz) / .06)` en vez
   de `rgba(255,255,255,.06)`. Variables: `--rgb-luz`, `--rgb-fondo`,
   `--rgb-pozo`, `--rgb-cian` (luz: rellenos y resplandores), `--rgb-cian-linea`
   (trazo: bordes y líneas finas), `--sombra-fuerte`, `--sombra-profunda`,
   `--sombra-suave`, `--rgb-tinta`, `--rgb-hondo` (velo de un pozo) y los
   acentos como trazo (`--rgb-lima-linea`, `--rgb-ember-linea`,
   `--rgb-violeta-linea`, `--rgb-ambar-linea`). Un fondo oscuro teñido de un
   acento se escribe `color-mix(in srgb, rgb(var(--rgb-cian)) 7%, var(--color-ink-900))`.
4. El tema lo pone un script en línea en el `<head>` (`TemaScript.astro`), antes
   del primer pintado. **No se decide en el servidor**: las páginas públicas se
   sirven de caché iguales para todos.
5. Los lienzos WebGL reciben un uniform `uClaro` leído en cada fotograma; los
   que pintan una sola vez se suscriben con `alCambiarTema` (`src/lib/tema.ts`).
   Canvas 2D y GSAP no entienden `var()`: piden cadenas concretas a `paleta()`.
6. Un texto oscuro sobre un fondo claro fijo (una píldora "invertida") lleva
   `var(--color-ink-950)` sobre `var(--color-ink-50)`: los dos se voltean
   juntos. `--sobre-acento` es solo para texto encima de un relleno neón.

## Interruptor por página

Mientras dure la migración, el tema claro solo se enciende en las páginas que
pasan `temaClaro` a su layout. Sin eso no hay script, no hay botón y la página
queda en oscuro. Una página con colores a mano sin migrar quedaría con texto
claro sobre fondo claro, y como el sitio sigue al dispositivo, eso lo vería
cualquier visitante con el sistema en claro.

Para encender una página:

1. Pasar sus hex y rgba a variables (ver punto 3 de arriba).
2. Revisar `text-white` o `bg-white` sólidos: `white` ahora es tinta en claro.
   Texto sobre relleno de acento: `text-ink-950`.
3. Lienzos y SVG pintados con JavaScript: leer el color de las variables.
4. Logos e imágenes pensados para fondo oscuro.
5. Capturas reales en claro **y** en oscuro, a 1440 y 390 px.
6. Añadir `temaClaro` al layout de la página.

## Tandas

- ✅ **1. Base y portada** (11 nov 2026): variables, script, botón, barra,
  footer, burbuja del asesor, aviso de idioma, y `/` completa con sus tres
  lienzos WebGL.
- ✅ **2. Sitio público de venta** (11 nov 2026): `/paginas-web`,
  `/capacitacion-ia`, `/capacitacion` (banco, recurso y acceso), `/contact` y
  `/projects/<slug>`. Las maquetas de cosas ajenas se dejan como son: el
  celular de la demo, el chat de WhatsApp, el resultado de Google y las
  capturas del aula son imágenes de otros productos, no superficies del sitio.
- ✅ **3. Sitio público técnico** (11 nov 2026): `/tools`, `/engineering`,
  `/lab`, `/lab/fingerprint`, `/lab/site-check`, `/notes` y cada nota,
  `/security`, `/log`, `/status`, `/automatizaciones`, `/architecture`, `/ep`,
  `/changelog` y `/certifications`. Los lienzos 2D (reloj de `/log`, filtro de
  `/security`) y las animaciones GSAP leen el color con `paleta()` de
  `src/lib/tema.ts`. `--color-black` pasa a ser blanco en claro: en el sitio
  `black` se usa como fondo más hondo que la página, no como tinta.
- ✅ **4. `/docs`** (12 nov 2026): las 27 páginas salvo la presentación
  (`SlidesLayout`, fuera a propósito) y la versión imprimible del BPMN (ya es
  papel). Los diagramas BPMN reutilizan en claro la variante sobre papel
  (`.bpmn-claro`), y UML tiene la suya con el mismo criterio. Mermaid pasa por
  `src/lib/mermaid-tema.ts`: una paleta por tema y repintado desde la fuente
  al cambiar de tema; el retoque del diagrama de clases (tintes por papel y
  trazos en escuadra) corre tras cada pintado. En casos de uso, tres grises
  oscuros casi iguales (`#20202b`, `#8a8a99`, `#101018`) pasaron a la escala de
  tinta más cercana: en oscuro cambian un par de puntos de luminosidad.
- ✅ **5. Cobros y propuestas** (12 nov 2026): `/c/<código>`, `/mis-pagos`,
  `/propuesta/<token>`, `/acuerdo/<token>`, `/cotiza/entrar`, `/pay` y
  `/pay/gracias`. Las que tienen su propio `<html>` (sin la barra del sitio)
  llevan `TemaScript` en el `<head>` y no tienen botón: siguen al dispositivo o
  a la elección guardada. Verificadas con datos sembrados en una base
  desechable local (propuesta enviada y tres cobros), nunca contra Turso.
  Pasan a la tanda de `/admin` por ser privadas: `/cobrar` y las vistas de
  Cotiza (`CotizaLayout`, que abre con sesión o con PIN).
  - La paleta semántica de Tailwind (`red-300`, `amber-400`, `emerald-950`...)
    se cruza en claro: cada tono apunta a su espejo de luminosidad (bloque en
    `global.css`). Afecta a todo el sitio encendido; los colores salen de
    `tailwindcss/theme.css` y hay que regenerarlos si Tailwind cambia su paleta.
- ✅ **5b. Sueltas públicas** (12 nov 2026): `/404`, `/hola`, `/feedback`,
  `/cv/descargar` y las salas de `/lab/fingerprint` (`/<sala>` y su tablero).
  El QR del tablero trae su propio fondo blanco (margen de dos módulos) y ya no
  depende de `bg-white`, que en claro es tinta: un lector necesita módulos
  oscuros sobre claro en los dos temas. Verificadas con una sala sembrada en
  una base desechable local. Siguen sin encender `/novedades`, `/demo`,
  `/platziconf`, `/presentacion-end` y las de `/sustentacion`.
- ⬜ **6. Portal de clientes** (`PortalLayout`, `PortalAuthLayout`).
- ⬜ **7. Panel `/admin`** (`AdminLayout`).
- ⬜ **8. Cierre:** quitar el interruptor `temaClaro` y dejar el tema en todos
  los layouts.

Fuera a propósito: las presentaciones (`PresentLayout`, `SlidesLayout`), que
tienen su propio fondo por diapositiva, y las imágenes Open Graph.

## Pendientes menores

- La barra del histograma del panel del pulso usa lima neón como relleno: sobre
  blanco se ve, pero con poco contraste.
- Los fantasmas de octubre (`Fantasmas.astro`) no se revisaron en claro: no es
  temporada.
- Las animaciones GSAP que tiñen texto leen el color al armarse
  (`colorDeTema`): si se cambia de tema con la página abierta, ese tinte queda
  con el color anterior hasta recargar.
- `/capacitacion` y `/capacitacion/acceso` tienen 144 px de desborde horizontal
  en escritorio en los dos temas: el halo no está recortado. Viene de antes y
  no es de color; queda sin tocar.
- `EngineeringFeed.astro` y `EvolutionTimeline.astro` usan grises fijos de
  Tailwind (`slate`, `zinc`) y no se migraron: ninguna página los monta.
