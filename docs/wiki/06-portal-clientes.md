# 06 · Portal de clientes (`/portal`)

Planes: [`docs/plan-portal-clientes.md`](../plan-portal-clientes.md) (fases 0-7)
y [`docs/plan-portal-tiempo-real.md`](../plan-portal-tiempo-real.md) (fases A-C).
Artículos: `/notes/el-client-id-nunca-viene-de-la-url` y
`/notes/dos-logins-en-el-mismo-sitio-y-ninguno-conoce-al-otro`.

## Qué ve el cliente

| Ruta | Contenido |
|---|---|
| `/portal` | Dashboard: proyectos, avance por hitos, salud del servicio, facturas pendientes, actividad reciente. |
| `/portal/facturas`, `/portal/facturas/<id>` | Facturas con líneas, descarga en PDF y pago (Wompi). `/simular` en demo. |
| `/portal/documentos` | Documentos y entregables. |
| `/portal/mensajes`, `/portal/mensajes/<id>` | Hilos de mensajería con Mike (por cliente, opcionalmente por proyecto). |
| `/portal/actividad` | Feed de actividad del proyecto. |
| `/portal/notificaciones` | Centro de notificaciones (in-app siempre, email según preferencia). |
| `/portal/cuenta` | Perfil, contraseña, equipo (usuarios que comparten el portal del cliente), preferencias, sesiones abiertas, suscripción a novedades. |
| `/portal/login`, `/portal/olvide`, `/portal/restablecer/<token>`, `/portal/invitacion/<token>` | Acceso, recuperación e invitación. `/login` es una entrada única que sirve a clientes y al admin. |

## Autenticación (separada del admin)

- Email + contraseña con **scrypt** (`lib/portal/passwords.ts`).
- Cookie propia `portal_session` y tabla `portal_sessions`. No comparte nada con
  Auth.js ni con la cookie del admin.
- Alta solo por **invitación** (`client_invitations`), con token de un solo uso.
- Rate limit propio del login: 10 POST/min por IP, más estrecho que el de
  `/api/auth` (un login legítimo es un POST, y así un diccionario no llega a
  scrypt).
- Defensa contra enumeración y fuerza bruta en `lib/portal/login.ts`: el
  intento se anota con un incremento atómico antes de verificar la contraseña,
  y un correo inexistente se bloquea igual que uno real (contador por hash del
  correo en el rate limit durable), así el bloqueo no delata quién es cliente.
- La entrada a la demo (`GET /api/portal/demo`) no pisa una sesión real: si el
  navegador ya la tiene, lo manda a su portal.
- Todo evento sensible (login, fallo, invitación, pago) va al micro-SIEM como
  auditoría y a `portal_audit_log`.

## La regla de oro: aislamiento entre clientes

> **El `clientId` nunca viene del request.**

En cualquier consulta del portal, `clientId` sale de `requirePortalSession()` y
viaja en el `WHERE` **aunque** la consulta ya lleve un `projectId` o un
`invoiceId` que "ya implica" al cliente. Un fallo aquí no degrada una función:
expone los datos de un cliente a otro. Lo verifica
`tests/portal-isolation.test.ts`.

Del lado admin (`/admin/portal/mensajes/<id>`) no hay tenant que aislar, así que
el `clientId` se toma del propio hilo.

## "Ver como cliente" (impersonación)

Desde `/admin/clients`, Mike abre el portal tal como lo ve un cliente
(RF-806). Es **solo lectura sin excepciones**: el middleware corta cualquier
método distinto de GET/HEAD en el portal, y además corta el endpoint de pago
simulado, que vive fuera de `/api/portal/` (`/api/payments/mock/pay`) y se
habría escapado del primer guarda. La única escritura permitida es salir
(`POST /api/portal/logout`), para no dejar al admin atrapado.

## Tiempo real (desde el 30 jul 2026)

- **Digest** mínimo (`lib/portal/live.ts`) que el navegador sondea cada 20 s
  por `/api/portal/live`. No SSE ni WebSockets: Turso no tiene pub/sub, así que
  el servidor sondearía igual y además pagaría la conexión abierta.
- Un único ciclo en `PortalLayout` con tres suscriptores: campana, dashboard e
  hilo abierto. Se pausa con la pestaña oculta (`visibilitychange`).
- **Feed de actividad** (`portal_activity`) alimentado fire-and-forget desde los
  puntos que ya notificaban (mensaje, factura, pago, hito, documento). Cada
  entrada puede ser visible u oculta al cliente.

## Facturación

- `lib/portal/invoices.ts`: el total lo calcula el servidor desde las líneas
  (`invoice_items`); el del navegador es solo cortesía visual.
- Pago con Wompi a través de la pasarela común (`payments.ts`); al aprobarse,
  `settlement.ts` concilia pago → factura.
- PDF con `pdf-lib` (`invoice-pdf.ts`).
- Cron diario `invoices-overdue` marca vencidas y notifica.

## Demo del portal

- `/api/portal/demo` crea una sesión en la **base demo** con una cookie de pase
  propia (`PORTAL_DEMO_COOKIE`), distinta de la demo del panel.
- Solo lectura, salvo una mutación permitida: el **pago simulado**, para que el
  visitante complete el flujo.
- Cron diario `portal-demo-reseed` repuebla la base demo.

## Modo respaldo

Si Turso no responde (p. ej. cuota agotada), `/api/portal/demo` emite un pase
firmado de **respaldo** y el portal sirve un snapshot versionado
(`src/data/portal-respaldo.json`) en solo lectura, sin consultar ninguna base.
Solo para páginas GET cubiertas por el snapshot. Se apaga solo cuando la base
vuelve. Existe para que la sustentación funcione con la base caída.

## Salud

`/api/portal/health` + `lib/portal/health.ts`: el portal se vigila a sí mismo
como un monitor más (`scripts/register-portal-monitor.mjs`).

## Accesibilidad

`PortalLayout` tiene salto al contenido, regiones `aria-live` para avisos y foco
explícito al navegar (RNF-19).
