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
- Redirect 308 `www.codebymike.net` y el alias fijo del proyecto
  → `codebymike.net`, con ruta y query intactas (`tests/canonical-host.test.ts`).
  Los dos hosts del `.tech` estuvieron en esa lista hasta el **8 sep 2026**;
  ver *Baja del `.tech`* abajo.
- `www.codebymike.net` y `www.codebymike.tech` dados de alta en `dev-portfolio`
  (certificado emitido; antes el `www` del `.tech` resolvía a Vercel sin
  proyecto detrás).
- Monitores 8, 10 y 11 repuntados a `.net` en Turso, y el 8 renombrado.
- `codebymike.net` dado de alta en el inventario de servicios (`project_services`),
  con renovación 5 sep 2027 y USD 13.5/año, para que el cron de dominios avise.
- Guardarraíl de k6: `.net` añadido a los objetivos prohibidos. El `.tech` se
  queda ahí aunque ya no redirija: un guardarraíl que se relaja cuando el
  peligro parece pasado es el que falta el día en que vuelva a apuntar a algo.
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
3. **cron-job.org - BLOQUEANTE desde el 7 sep.** Repuntar los dos jobs a
   `https://codebymike.net/api/cron/*` (`uptime-check` cada 5 min,
   `security-rollup` cada 15 min), conservando el header
   `Authorization: Bearer <CRON_SECRET>`, y volver a habilitarlos.

   Se había anotado como "no urgente" porque `/api` está exento del redirect y
   el `.tech` seguía recibiendo. Esa exención dejó de servir de nada cuando el
   registrador retiró los NS del dominio vencido: sin DNS no hay a quién llamar,
   los dos jobs fallaron seguido y cron-job.org los deshabilitó solo. Última
   ejecución de ambos en `cron_runs`: 05:00 UTC del 7 sep (00:00 Bogotá). La
   lección para el próximo cambio de dominio es que la exención de `/api`
   protege del redirect, no de la muerte del dominio: un job externo hay que
   repuntarlo **antes** de que el host viejo desaparezca, no después.

   Los crons de `vercel.json` no se enteraron: van por la URL del despliegue.
4. **Wompi.** URL de eventos del comercio → `.net`. Mismo caso: el `.tech`
   sigue recibiendo, pero conviene no depender de un dominio en retirada.
5. **SEO.** Alta de `codebymike.net` en Search Console y Bing, envío del
   sitemap, y herramienta de *cambio de dirección* desde la propiedad `.tech`.
   IndexNow no necesita nada: el archivo de clave se sirve en los dos hosts.
6. **Correo (opcional).** `portal@codebymike.tech` y `alertas@codebymike.tech`
   se dejaron intactos a propósito: el remitente depende del dominio verificado
   en Resend. Para mudarlos, verificar `codebymike.net` en Resend y poner
   `PORTAL_EMAIL_FROM` y `ALERT_EMAIL_FROM` en Vercel.

## Baja del `.tech` (8 sep 2026)

Se retiró `codebymike.tech` y `www.codebymike.tech` de `HOSTS_A_REDIRIGIR`, con
sus tests. Lo que se comprobó antes de tocarlo, porque el plan y `pendientes.md`
daban por hecho algo distinto:

| Qué se creía | Qué dice el registro/DNS hoy |
|---|---|
| El registrador retiró los NS y el dominio quedó sin delegación | La zona está delegada a `ns1.verification-hold.suspended-domain.com`: responde **127.0.0.1** para el dominio y para **todos** sus subdominios |
| El dominio se dejó caer y quedará libre | RDAP: estado `auto renew period`, expiración **2027-09-06**. No está libre ni lo puede registrar otro: el registrador lo tiene retenido y podría reactivarlo |
| El 308 seguiría sirviendo enlaces viejos un tiempo | Ningún request con ese Host llega a Vercel desde el 7 sep. La regla no se servía: solo constaba |

Consecuencias que esto cambia respecto de lo planeado:

- **La ventana de traspaso de autoridad duró un día, no semanas.** El *Cambio de
  dirección* de Search Console necesita el dominio viejo verificado y
  respondiendo; ya no lo está. La recuperación de backlinks a mano deja de ser
  la mitad barata del trabajo y pasa a ser el único mecanismo que queda.
- **`capacitaciones.codebymike.tech` cayó con la zona**, aunque es otro proyecto
  de Vercel (`capacitaciones-ia`): la suspensión se lleva el dominio y TODOS sus
  subdominios, no solo el host del sitio. Resuelto el 8 sep: el aula responde en
  `capacitaciones.codebymike.net` (`/ingresar` y `/empresa`, 200) y desde este
  repo la enlazan `/capacitacion-ia`, `/capacitacion`, el monitor de respaldo
  9010 y el nodo del grafo de `/engineering`, todos ya repuntados.
- **Correo:** si `PORTAL_EMAIL_FROM` o `ALERT_EMAIL_FROM` siguen puestos en
  Vercel con una dirección `@codebymike.tech`, sus envíos fallan desde el 7 sep
  (el dominio verificado en Resend perdió SPF/DKIM al perder la zona). Los
  defaults del código ya son `.net` (`src/lib/email.ts`, `src/lib/notify.ts`),
  así que basta con **borrar** las dos variables si están puestas. Y por diseño
  esto no grita: `notify.ts` es fail-open y un envío fallido no rompe nada.

## Lo que NO se movió

- `demo@codebymike.tech`: es la identidad sembrada del portal demo, no una
  dirección que reciba correo. Cambiarla desincronizaría la base sembrada.
- `UID:...@codebymike.tech` en los eventos iCal de `/ep`: un UID no es una URL,
  es la identidad del evento. Cambiarlo duplicaría cada hito en los calendarios
  ya suscritos en vez de actualizarlo.
