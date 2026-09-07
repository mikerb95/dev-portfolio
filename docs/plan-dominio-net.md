# Migración de dominio: codebymike.tech → codebymike.net

**Estado: código listo (sep 5, 2026).** Faltan pasos manuales fuera del repo,
listados abajo, uno de ellos bloqueante.

`codebymike.net` (registrado en Vercel, nameservers de Vercel, renueva el
5 sep 2027) pasa a ser el dominio de producción.

**`codebymike.tech` se da de baja** (decisión del 7 sep 2026): venció el 6 sep y
no se renueva. Sigue atado al proyecto y redirigiendo mientras su registrador
mantenga el DNS, y se deja así a propósito: cada 308 servido en esa ventana es
un enlace viejo que todavía funciona. El plan de SEO para la baja, que es lo
único que el código no puede resolver solo, está en `pendientes.md` §2.

La consecuencia que conviene tener escrita: sin dominio viejo vivo no hay
mecanismo de traspaso de autoridad. El 301/308 es el único que Google acepta, y
necesita meses de rastreo para completarse. Los backlinks externos que apunten
al `.tech` dejarán de valer y hay que reemplazarlos a mano, uno por uno.

## Qué se decidió y por qué

**El redirect vive en el middleware, no en la configuración de dominios de
Vercel.** Un "Redirect to codebymike.net" a nivel de dominio es más simple pero
alcanza también a `/api/*`, y ahí un 308 rompe tres cosas en silencio:

| Integración | Qué le pasa con un 308 sobre /api |
|---|---|
| Webhooks de Wompi (`/api/payments/webhook`) | Son POST firmados. Un cliente que sigue el redirect puede degradarlo a GET o soltar el cuerpo: el evento se pierde y el pago queda a medias |
| Crons externos (cron-job.org) | Mandan `Authorization: Bearer`. Casi todo cliente HTTP quita esa cabecera al saltar de host: 401 silencioso |
| Sondeos de uptime | Medirían la latencia del redirect, no la del sitio |

`src/lib/canonical-host.ts` redirige solo GET/HEAD y exime `/api/` y `/_`. Así
las integraciones que aún llaman al `.tech` siguen funcionando sin tocarlas,
mientras personas y crawlers acaban siempre en `.net`.

**Y hace falta en dos capas.** El middleware no ve las páginas
prerenderizadas: son archivos que sirve el CDN sin invocar la función. Con solo
el middleware, el dominio viejo redirigía `/` y `/status` pero seguía sirviendo
`/docs`, `/notes`, `/pay`, `/log` y otras 43 páginas como copia indexable
(verificado en producción: `codebymike.tech/docs` respondía 200). Por eso
`integrations/canonical-redirect.mjs` inyecta el mismo redirect en
`.vercel/output/config.json`, antes de `handle: filesystem`, reutilizando la
lista de hosts del módulo. Es el mismo agujero, y la misma solución, que
`integrations/static-headers.mjs` para las cabeceras de seguridad.

**Un solo literal del dominio.** `src/lib/site.ts` (`SITE_ORIGIN`, `siteUrl()`)
concentra el origen para todo lo que arma enlaces **fuera** de un request:
correos, alertas ntfy, IndexNow, PDFs y los fallbacks de `Astro.site`. Lo que sí
nace de un request (el `redirect-url` de Wompi, WebAuthn, los enlaces relativos)
se sigue derivando del Host real, que es lo que mantiene vivos los previews y
`astro dev`.

## Lo que ya está hecho

- `astro.config.mjs → site`, canonical, JSON-LD, sitemap, RSS, `robots.txt`,
  `security.txt` y OG apuntan a `.net`.
- Redirect 308 `codebymike.tech`, `www.codebymike.tech` y `www.codebymike.net`
  → `codebymike.net`, con ruta y query intactas (`tests/canonical-host.test.ts`).
- `www.codebymike.net` y `www.codebymike.tech` dados de alta en `dev-portfolio`
  (certificado emitido; antes el `www` del `.tech` resolvía a Vercel sin
  proyecto detrás).
- Monitores 8, 10 y 11 repuntados a `.net` en Turso, y el 8 renombrado.
- `codebymike.net` dado de alta en el inventario de servicios (`project_services`),
  con renovación 5 sep 2027 y USD 13.5/año, para que el cron de dominios avise.
- Guardarraíl de k6: `.net` añadido a los objetivos prohibidos, con el `.tech`
  todavía en la lista porque redirige a producción y k6 sigue redirecciones.
- Defaults de los workflows de CI (`PROD_URL`), scripts de social/IndexNow/OG.
- `/docs`: requisito **RNF-30**.

## Lo que falta (fuera del repo)

1. **BLOQUEANTE - GitHub OAuth.** En la OAuth App de GitHub, *Authorization
   callback URL* → `https://codebymike.net/api/auth/callback/github` (y
   *Homepage URL* → `https://codebymike.net`). Solo admite un callback: hasta
   cambiarlo, el login del panel en `.net` falla con `redirect_uri` no
   registrado. `auth-astro` deriva el callback del Host real del request, así
   que no hay env var que evite este paso.
2. **Passkeys.** El `rpID` de WebAuthn es el host: las llaves registradas bajo
   `.tech` no se ofrecen en `.net`. Hay que volver a registrarlas desde el panel
   una vez esté publicado. La puerta de GitHub sigue funcionando entre medias.
3. **cron-job.org.** Repuntar los jobs a `https://codebymike.net/api/cron/*`.
   No es urgente (el `.tech` está exento del redirect), pero deja el panel de
   crons hablando del dominio real.
4. **Wompi.** URL de eventos del comercio → `.net`. Mismo caso: el `.tech`
   sigue recibiendo, pero conviene no depender de un dominio en retirada.
5. **SEO.** Alta de `codebymike.net` en Search Console y Bing, envío del
   sitemap, y herramienta de *cambio de dirección* desde la propiedad `.tech`.
   IndexNow no necesita nada: el archivo de clave se sirve en los dos hosts.
6. **Correo (opcional).** `portal@codebymike.tech` y `alertas@codebymike.tech`
   se dejaron intactos a propósito: el remitente depende del dominio verificado
   en Resend. Para mudarlos, verificar `codebymike.net` en Resend y poner
   `PORTAL_EMAIL_FROM` y `ALERT_EMAIL_FROM` en Vercel.

## Lo que NO se movió

- `capacitaciones.codebymike.tech`: es otro proyecto de Vercel
  (`capacitaciones-ia`) con su propio despliegue. Sigue en `.tech` y sigue
  funcionando; moverlo es una decisión aparte.
- `demo@codebymike.tech`: es la identidad sembrada del portal demo, no una
  dirección que reciba correo. Cambiarla desincronizaría la base sembrada.
