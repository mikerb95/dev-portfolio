# 04 · Sitio público

Todo lo que se ve sin login. Español sin prefijo (canónico) e inglés bajo `/en`
para las rutas de `TRANSLATED_ROUTES`. Columna **Render**: `SSR` = por request
(con caché de CDN 5 min); `build` = prerenderizada.

## Marca y comercial

| Ruta | Render | Qué es / qué demuestra |
|---|---|---|
| `/` | SSR | Portada. Hero con **cotizador de IA** ("Cuéntame qué necesitas": primera vuelta del asesor y traspaso a la burbuja de WhatsApp), titular rotativo por servicios con cifras del tarifario, terreno de isolíneas WebGL, índice cinético de proyectos, pipeline "Cómo trabajo", huella generativa del Lab, cinta del pulso bajo el hero (no se quita, RF-022). En octubre, fantasmas de Halloween (capa CSS aparte, RF-031). |
| `/paginas-web` | build | Landing para clientes **no técnicos**: planes Presencia/Negocio/A medida, vitrina de 3 clientes reales, FAQ, CTA a WhatsApp. Precios desde `tarifario.ts`. |
| `/capacitacion-ia` | SSR | Landing de capacitación en IA. Precio desde `training_programs`. |
| `/capacitacion`, `/capacitacion/<slug>`, `/capacitacion/acceso` | SSR | Banco de recursos: lo público se indexa; lo restringido se abre con un **código de grupo** (pase firmado). |
| `/contact` | build | Contacto + agenda de reunión. Motion solo sobre el diseño existente (el usuario rechazó piezas añadidas). |
| `/certifications` | SSR | Certificaciones + agregados públicos del tracker de aprendizaje (horas, % del temario, racha). |
| `/projects/<slug>` | SSR | Detalle de proyecto (los no visibles siguen accesibles por URL directa, a propósito). |
| `/novedades`, `/novedades/baja` | SSR | Suscripción con doble opt-in a correos promocionales y baja. |
| `/cv/descargar` | build | Descarga del CV con token de un solo uso y huella de dispositivo. |
| `/hola` | build | Herramienta personal para armar un mensaje de WhatsApp al conocer a alguien. |
| `/platziconf` | SSR | Landing de contacto para la Platzi Conf (Bogotá, 29 ago 2026). Fuera del sitemap. |
| `/feedback` | SSR | Formulario de feedback anónimo. |

## Ingeniería (la vitrina técnica)

| Ruta | Render | Qué muestra |
|---|---|---|
| `/engineering` | SSR | Señales verificables en vivo: Core Web Vitals p75 de usuarios reales (RUM), actividad, osciloscopio de la visita (la página se mide delante del visitante). |
| `/status` | SSR | Uptime de los monitores propios, latencia tipo EKG, incidentes, SLO y error budget. Historial desde `monitor_daily` (nunca el crudo). Si la base cae, sondeo en vivo de respaldo. |
| `/security` | SSR | Micro-SIEM en público: "filtro de capas", agregados de intentos detectados/bloqueados (cacheados 3 h), hallazgos reales de una auditoría mapeados a OWASP Top 10 con el commit que los cerró. **Solo agregados.** |
| `/lab` | SSR | Banco de ensayo con la `canTransition` real de pagos, pista de CI, ciclo de hallazgos SAST/DAST/a11y, escalera de carga k6. |
| `/lab/site-check` | build + API | Analizador público de cualquier dominio (SEO, rendimiento, a11y, TLS) con protección SSRF y rate limit. |
| `/lab/fingerprint` | build + API | Laboratorio de fingerprinting con salas efímeras: la huella se lee en dos tiempos y se reconoce en un tablero. |
| `/tools` | build | Índice de las herramientas del repo con un "circuito de operación" animado; cifras calculadas en el build con funciones reales. |
| `/architecture` | build | Índice narrativo del sistema + **trazador de peticiones** cuyo guion se calcula en el build con las funciones reales del middleware. |
| `/automatizaciones` | SSR | Catálogo de lo que corre solo: workflows de CI con su última corrida, crons con su bitácora, automatismos que dispara el tráfico. "Partitura" de 24 h y simulacro de corte con el detector de silencio real. |
| `/log` | build + API | Bitácora de trabajo desde GitHub (reloj de sesiones). Los repos privados cuentan, pero no se publican (hora redondeada). |
| `/changelog` | SSR | Lo que cambió, semana a semana, desde los commits de `main`. |
| `/notes`, `/notes/<slug>` | build | 24 artículos técnicos, uno por feature grande. Cada nota lleva `decision` en el frontmatter (es y en). RSS en `/rss.xml`. |
| `/demo` | SSR | Entrada a la **demo del panel** con datos ficticios (ver [07](07-autenticacion-y-accesos.md)). |
| `/pay`, `/pay/gracias` | build | Checkout público de la pasarela (sandbox/mock). |
| `/ep` | build | Etapa productiva SENA: cronograma real de la ficha, calculadora, formatos de correo, cinta de 180 días y bitácora del vigía de agenda. |

## Documentación formal (`/docs`)

Todo prerenderizado desde `src/data/*` (excepto `/docs/presentacion`, que es
privado). Índice en `/docs`. Páginas:

- **Proyecto**: `planteamiento`, `kanban` (iteraciones), `roles`, `raci`,
  `historias-de-usuario`.
- **Requisitos**: `requerimientos-funcionales`, `requerimientos-no-funcionales`,
  `casos-de-uso`, `casos-de-uso-extendidos`.
- **Diagramas**: `diagrama-bpmn` (+ `bpmn-imprimible`), `diagrama-actividades`,
  `diagrama-comunicacion`, `diagrama-despliegue`, `diagrama-componentes`,
  `diagrama-red` (motores propios, SVG en servidor); `diagrama-secuencia`,
  `diagrama-clases`, `diagrama-objetos` (Mermaid); `diagrama-paquetes`.
- **Calidad**: `testing` (guía de los niveles de prueba), `verificacion-validacion`,
  `ejecucion-pruebas` (instantánea de la corrida real), `reportes-pruebas`,
  `usability-testing`, `pipeline-en-vivo`.
- **Infra**: `docker`.

## Rutas con token o PIN (públicas pero no indexadas)

| Ruta | Para quién |
|---|---|
| `/c/<code>` | Cliente que paga un cobro de campo. |
| `/mis-pagos?r=…&t=…` | Histórico de pagos del cliente (link HMAC) o consulta enmascarada por teléfono. |
| `/propuesta/<token>` | Cliente que revisa y acepta una propuesta de Plano. |
| `/acuerdo/<token>` | Cliente de Cotiza que acepta y aprueba adicionales. |
| `/<pin>` | Público de una presentación (PIN de 4 caracteres, vive 6 h). |
| `/sustentacion/seguir/<pin>` | Público de la sustentación. |
| `/presentacion`, `/remote` | Mazo `/final.html` y su mando público. |

## Versión en inglés (`/en`)

- Plan: [`docs/plan-i18n-en.md`](../plan-i18n-en.md). Artículo:
  `/notes/traducir-un-sitio-sin-abrirle-una-puerta-trasera`.
- **Una sola implementación por página**: `src/pages/en/<ruta>.astro` es un
  cascarón que reexporta la página española; el locale sale de la URL.
- Rutas traducidas: `/`, `/architecture`, `/automatizaciones`,
  `/capacitacion-ia`, `/certifications`, `/changelog`, `/demo`, `/lab`,
  `/lab/fingerprint`, `/lab/site-check`, `/log`, `/notes`, `/paginas-web`,
  `/presentacion-end`, `/contact`, `/cv/descargar`, `/engineering`,
  `/platziconf`, `/rss.xml`, `/security`, `/status`, `/tools`, más los prefijos
  dinámicos `/lab/fingerprint/*`, `/notes/*`, `/projects/*`.
- `/en/<no traducida>` → 302 a la versión en español. `/en/<privada>` → 404.
- Traducir una página = **tres pasos**: texto en el diccionario, cascarón en
  `src/pages/en/`, alta en `TRANSLATED_ROUTES`.
- Enlaces con `localizedHref` (cae al español si no hay traducción), **nunca**
  `localizePath` (publicaría un 404).
- `LanguageSuggestModal` sugiere el idioma sin redirigir.
- Precios en inglés: USD donde el tarifario lo define; capacitación sigue en COP
  a propósito.

## SEO y AEO

- `sitemap.xml`, `robots.txt` y `rss.xml` **generados** (endpoints `.ts`).
  `hreflang` y sitemap solo anuncian URLs `/en/` que existen.
- OG images por sección y por idioma en `public/og-*.png`
  (`npm run og:generate`).
- IndexNow diario (cron) a Bing, Yandex, Seznam, Naver.
- **AEO** (visibilidad en asistentes de IA, RF-039): `llms.txt` y
  `llms-full.txt` generados desde el mismo contenido del sitio, bots de IA
  permitidos en robots, JSON-LD del negocio y FAQ, conteo de visitas de agentes
  y de referidos desde asistentes, panel en `/admin/aeo`.
- Pendiente manual: altas en Google Search Console y Bing Webmaster.

## Componentes globales

- `Navbar`, `Footer`, `LangSwitch`.
- `WhatsappFab`: burbuja de WhatsApp con el **asesor público de IA** dentro
  (ver [11](11-ia-y-agentes.md)). WhatsApp sigue siendo el canal principal.
- `WebVitals`: envía Core Web Vitals reales a `/api/vitals`.
- `Fantasmas`: solo en la portada y solo en octubre. No tocar hero/navbar/footer
  ni ligarlo al SIEM (idea rechazada).
