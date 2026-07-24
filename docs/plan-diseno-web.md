# Plan: Landing "Diseño Web" para clientes no técnicos

> Estado: **implementado v1** (jul 2026), pendiente afinar datos reales.
> Página en `src/pages/paginas-web.astro`. Puerta de entrada para clientes no técnicos,
> separada del portafolio técnico. El resto del sitio (home, /engineering, /lab,
> /security) sigue siendo la credibilidad para clientes técnicos.

## Problema

El sitio le habla a ingenieros/CTOs ("Ingeniería de software con propósito",
stack visible, Lab, SIEM). Un cliente no técnico (dueño de negocio local,
profesional independiente, emprendedor, pyme) llega, no se reconoce en ese
lenguaje y rebota. No hay que suavizar todo el sitio — hay que abrir **una
puerta aparte** que traduzca todo a resultados.

## Decisiones cerradas (con el usuario)

- **Público**: amplio — negocios locales, profesionales independientes,
  emprendedores/marca personal y pymes establecidas. La página segmenta con un
  bloque "¿esto es para ti?".
- **Posicionamiento**: landing propia `/diseno-web`, tono más cálido y humano.
  Dos puertas, una casa. No se toca el tono del resto del sitio.
- **Precios**: paquetes con precio "desde $X" visible (transparencia = confianza
  y filtro). 3 planes.
- **Contacto**: WhatsApp directo (CTA principal) + formulario simple como
  alternativa.

## Cambios de navbar

- [x] Quitar "Certificaciones" del navbar (hecho).
- [ ] Añadir "Diseño Web" al navbar apuntando a `/diseno-web`. Considerar
  ubicarlo primero o destacado (es producto que genera ingresos).

## Estructura de la página `/diseno-web`

1. **Hero cálido** — titular por resultado, no por tecnología.
   Ej: *"Tu negocio necesita una página que trabaje por ti. Yo la construyo,
   tú solo la usas."* Sub: lista en X días, tú solo mandas la info.
   CTA doble: [Escríbeme por WhatsApp] (primario) · [Ver planes] (ancla).
2. **¿Esto es para ti?** — grid de 4 perfiles (negocio local / profesional /
   emprendedor / pyme) con el dolor y el resultado de cada uno.
3. **Qué logras** (beneficios, no features): apareces en Google, clientes te
   escriben por WhatsApp desde la web, se ve profesional en el celular, tú no
   tocas nada técnico.
4. **Cómo funciona** — 3 pasos: *Me cuentas → yo diseño → publicamos*.
   Reduce el miedo a "lo técnico".
5. **Planes con precio** (3 tiers, precios COP, AJUSTAR con el usuario):
   - **Presencia** — 1 página (one-page), dominio + WhatsApp + Google. Desde $X.
   - **Negocio** — varias secciones, catálogo/servicios, formulario, SEO local.
     Desde $Y. *(destacado / "más elegido")*
   - **A medida** — tienda, reservas, pagos (Wompi), integraciones. Cotización.
   Cada plan: qué incluye en lenguaje llano + "listo en N días".
6. **Prueba social** — ejemplos/mini-casos de negocios reconocibles,
   testimonios cortos. (Placeholder hasta tener material real.)
7. **Puente de credibilidad discreto** — "hecho por un ingeniero, no una
   plantilla; rápido, seguro y tuyo". Un guiño, sin jerga.
8. **FAQ** — precio, tiempos, "¿yo tengo que hacer algo técnico?", dominio,
   mantenimiento, "¿puedo editarla después?".
9. **CTA final** — WhatsApp + formulario (nombre, tipo de negocio, qué necesita,
   WhatsApp/email).

## Aspecto visual

Mismo sistema (glass, tokens de color) pero **más cálido**: menos mono/uppercase
técnico, más tipografía sans legible, foto/mockups de páginas reales, iconos
amables. Sin `border-left` de acento (regla global). Acentos con punto de color
junto al título, tinte de marca en hover, sombra sutil.

## Formulario (backend)

- Endpoint `POST /api/diseno-web/lead` (SSR). Reutiliza `sendEmail` + push ntfy
  de `src/lib/notify.ts` (no-op silencioso si faltan env vars) y registra un
  evento en el micro-SIEM (`recordSecurityEvent`, fire-and-forget).
- WhatsApp: enlace `https://wa.me/573104641228?text=<mensaje pre-escrito>`.
- Sin datos personales cacheables: `Cache-Control: no-store` en el endpoint.
- Rate limit: evaluar añadir la ruta a `isRateLimitablePath` (anti-spam).

## Pendiente de datos (bloqueante para publicar)

- [ ] **Precios reales** de los 3 planes (COP) y qué incluye cada uno.
- [ ] **Tiempos** de entrega por plan ("listo en N días").
- [ ] Ejemplos/casos reales o permiso para usar placeholders.
- [ ] ¿Slug `/diseno-web` o `/paginas-web`? (SEO: "páginas web" tiene más
  volumen de búsqueda en el público objetivo.)

## Artículo /notes

Al cerrar el feature, artículo en `src/content/notes/` como caso de estudio:
"cómo diseñé una puerta de entrada para clientes no técnicos sin traicionar la
marca técnica" (regla transversal del roadmap).
