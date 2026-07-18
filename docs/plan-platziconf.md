# Plan — Landing de contacto para Platzi Conf (`/platziconf`)

> Creado: 2026-07-18. Estado: **PLAN**, sin implementar.
> Evento: Platzi Conf, Bogotá, 2026-08-29. Landing de una sola página para
> compartir por QR o link a personas que conozcas en el evento: abre con el
> mensaje de apertura, muestra en 30 segundos qué sabes hacer con pruebas
> reales (no solo texto), y cierra con 3 formas de contactarte.

---

## 1. Decisiones de diseño (cerradas)

| Tema | Decisión |
|---|---|
| Ruta | `/platziconf` en la raíz de este portfolio (Astro SSR), no un proyecto aparte. Reutiliza `BaseLayout`, tokens de diseño (`glass`, `ink-*`, `cyan`) y el resto de la infraestructura (CSP, headers, cache) del middleware. |
| Apertura | H1/lead con el mensaje literal: *"Hola, nos conocimos en la Platzi Conf. Me gustaría saber si puedo aportar a tu idea o proyecto — te muestro algo de lo que sé."* Editable como texto plano en el `.astro`, sin CMS. |
| Prueba de "esto es real" | Widget de **métricas en vivo** que reutiliza las queries agregadas de `/status` (uptime 30d, monitores activos) en vez de afirmarlo en texto — mismo principio que ya usa `/status`: "datos reales, sin maquillaje". |
| Casos de estudio | 3 tarjetas curadas a mano que enlazan a artículos ya publicados en `/notes` (no se escribe contenido nuevo): micro-SIEM, cobros de campo sin API de WhatsApp, chaos engineering. |
| CTAs (3, todas visibles a la vez) | WhatsApp (`wa.me` con mensaje precargado, mismo patrón que `/cobrar` y `contact.astro`) · Calendly (link directo, placeholder hasta que pases la URL real) · Email (`mailto:`). |
| Indexación | **Pública pero sin push de SEO**: sin `noindex` (es un activo de marca legítimo si alguien la busca después), pero tampoco entra al sitemap/RSS ni se enlaza desde `index.astro` — se descubre solo por QR/link directo. |
| Datos personales / BD | Ninguno nuevo. La página no escribe nada; solo lee agregados que ya existen en `monitors`/`monitorChecks`. Sin migración. |
| Artículo en `/notes` | **No aplica.** Es una landing de marketing puntual para un evento, no una feature técnica del roadmap — no dispara la regla de "cada etapa mayor termina en artículo". |

## 2. Contenido de la página (de arriba a abajo)

1. **Hero** — el mensaje de apertura tal cual lo diste, más una línea de quién eres
   (nombre, @mikerb95, codebymike.tech) y un dato de contexto: "nos vimos en Platzi Conf,
   Bogotá · 29 ago 2026".
2. **Qué hago** — 3-4 líneas de bio técnica: full-stack, arquitectura, seguridad y
   observabilidad propia. Reutiliza el tono de `contact.astro`, no lo reinventa.
3. **Stack técnico** — fila de badges: Astro, Turso/libSQL, Drizzle, Auth.js, Tailwind,
   más una línea aparte para "seguridad y observabilidad: SIEM propio, SLOs, chaos
   engineering" — lo diferenciador frente a un portfolio genérico.
4. **Métricas en vivo** — tarjeta compacta (3 números, no la grilla completa de `/status`):
   uptime agregado 30d, monitores activos, y opcionalmente conteo de eventos de seguridad
   bloqueados si `/security` ya expone ese agregado. Un link "ver el detalle completo →
   /status" para quien quiera profundizar.
5. **Casos de estudio** — 3 cards (título + 1 línea + link a `/notes/...`):
   - *Construyendo un micro-SIEM para mi portfolio*
   - *Cobrar un trabajo de campo sin API de WhatsApp*
   - *Chaos engineering que no puede hacerte daño*
6. **CTA final** — 3 botones grandes: WhatsApp / Agendar (Calendly) / Email. Mensaje
   precargado de WhatsApp: *"Hola Mike, nos vimos en la Platzi Conf 👋"*.
7. **Footer mínimo** — link de vuelta a `/`.

## 3. Implementación técnica

- **Archivo nuevo**: `src/pages/platziconf.astro`. Sin componentes nuevos si el resto
  del contenido cabe inline (siguiendo el patrón de `contact.astro`/`status.astro`, que
  son páginas largas de una sola pieza).
- **Query de métricas**: una función pequeña y pura (o inline en el frontmatter, como ya
  hace `status.astro`) que trae *solo* el uptime agregado 30d + conteo de monitores
  activos — no reimplementar el cálculo de SLO completo, solo el agregado final. Si
  conviene, extraer el cálculo de `globalUptime30` de `status.astro` a un helper en
  `src/lib/` para no duplicar la query SQL entre las dos páginas.
- **CTAs**:
  - WhatsApp: link estático `https://wa.me/573104641228?text=<mensaje precargado>`
    (mismo número que `contact.astro`), sin backend — no hace falta el flujo completo de
    `/cobrar` (ese crea un cobro real; aquí es solo abrir un chat).
  - Calendly: `<a href="https://calendly.com/PLACEHOLDER" target="_blank">` — placeholder
    a reemplazar por la URL real de tu cuenta de Calendly antes de publicar.
  - Email: `mailto:0368dev@gmail.com` (mismo que `contact.astro`).
- **Cache**: la deja el middleware por defecto (`public, s-maxage=300,
  stale-while-revalidate`) — no hace falta tocar nada por página, igual que `/status`.
- **OG image**: reutilizar el patrón de `image="/og-status.png"` — generar un
  `/og-platziconf.png` siguiendo el mismo pipeline que ya existe para las demás páginas
  (`docs/plan-og-images.md`), o reusar un OG genérico existente si no se justifica uno
  nuevo para una página de vida corta.

## 4. QR code

No se construye un generador dentro del sitio — es un solo QR estático para imprimir en
tarjeta o mostrar en el celular durante el evento:

1. Una vez la página esté publicada en `codebymike.tech/platziconf`, generar el QR una
   sola vez con cualquier herramienta local (ej. `qrencode` por CLI o una librería npm
   de un solo uso) apuntando a esa URL exacta.
2. Guardar el PNG resultante donde lo vayas a usar (tarjeta física, fondo de pantalla de
   bloqueo, firma de LinkedIn) — no necesita vivir en el repo ni en Vercel.

## 5. Pendiente antes de publicar

- [ ] Confirmar/pegar la URL real de Calendly (hoy: placeholder en el código).
- [ ] Revisar el copy exacto del hero contigo antes de escribir el `.astro` (el mensaje
      de apertura y la bio corta).
- [ ] Decidir si quieres foto/headshot en el hero (la página funciona sin ella).
- [ ] Generar el QR apuntando a la URL final, después de que el deploy esté en prod.

## 6. Fuera de alcance (deliberado)

- Sin formulario ni captura de leads en BD — las 3 personas que quieran contactarte lo
  hacen por un canal que ya monitoreas (WhatsApp/email/Calendly), no hace falta una
  tabla `platziconf_leads` para un evento de un día.
- Sin analítica custom de visitas — si algún día se necesita, ya existe el patrón de
  `security_events`/monitors para agregar un contador simple, pero no se construye por
  adelantado para un caso de uso que aún no existe.
