# Plan — Portal en tiempo real + feed de actividad

> Creado: 2026-07-24. Estado: **planificado, sin iniciar**.
> Continuación de [`plan-portal-clientes.md`](./plan-portal-clientes.md) (Fases 0–7 ya
> implementadas). Aquí se cierra lo único que el portal prometía y no cumple:
> que la información del proyecto esté **viva**, no congelada en el instante del SSR.

---

## 0. Punto de partida (auditoría del 2026-07-24)

El portal está completo y es sólido. Lo verificado:

| Área | Estado |
|---|---|
| Aislamiento de tenant | Correcto. `clientId` sale siempre de `requirePortalSession()`; `projects.ts` mete `clientId` en el WHERE aunque ya tenga `projectId`. Cubierto por `tests/portal-isolation.test.ts`. |
| Sesiones | Token opaco, solo sha-256 en DB, renovación deslizante con throttle, revocación inmediata, `portalEnabled`/`status` revalidados en cada request. |
| Rate limiting del login | Doble capa: por IP en el middleware (`isAuthPath()` cubre las rutas del portal) y por cuenta en `lib/portal/login.ts`. |
| Impersonación | Read-only real: cortada en `middleware.ts:295` y además en `/api/payments/mock/pay`, que vive fuera del prefijo `/api/portal/`. |
| Demo | Tenant real con `isDemo`, guard central, cron de re-seed. |

**Gaps encontrados** (lo que este plan ataca, más dos de higiene):

1. **Nada se actualiza solo.** Cero `EventSource`, `setInterval` o `text/event-stream` bajo `src/pages/portal`. Un cliente con el portal abierto no ve la respuesta a su mensaje, ni el hito que acabas de completar, ni que su monitor se cayó, hasta que recarga a mano. El dato *es* de tiempo real (los checks entran cada ~5 min); la interfaz no.
2. **El avance del proyecto depende de que tú edites hitos a mano.** Entre hito e hito, el cliente ve una barra inmóvil aunque haya habido diez deploys.
3. Higiene: el portal **no tiene monitor propio en `/status`** (el único sistema del stack que no se vigila a sí mismo). El hueco de `/notes` ya está cubierto con dos artículos —"El clientId nunca viene de la URL" (aislamiento entre tenants) y "Dos logins en el mismo sitio, y ninguno conoce al otro" (por qué la auth del portal es propia)—, ambos del 24 jul 2026.

## 1. Decisión técnica: polling con digest, no SSE

| Opción | Veredicto |
|---|---|
| **SSE / streaming** | Descartado como default. Funciona en Fluid Compute, pero mantiene una función viva por pestaña abierta y factura CPU activo por ello. Turso no tiene pub/sub: el servidor igualmente tendría que **sondear la base** para saber qué mandar. Sería el mismo polling, pagando además la conexión abierta. |
| **WebSockets** | Mismo problema, más complejidad de reconexión y estado. |
| **Polling de un digest barato** | **Elegido.** Un endpoint que responde un objeto pequeño de contadores y marcas de tiempo. El navegador compara con lo que ya tiene y solo entonces refresca lo que cambió. |

Un portal de cliente no es un chat de trading: la unidad de novedad relevante es de minutos, no de milisegundos. Con **20 s de intervalo** la sensación es "vivo" y el costo es una query agregada por pestaña activa.

Tres reglas que hacen que el polling no sea un problema:

- **Solo con la pestaña visible.** `document.visibilityState` pausa el ciclo; una pestaña olvidada en segundo plano no cuesta nada.
- **Backoff ante error.** 20 s → 40 s → 80 s → tope 5 min, y vuelta a 20 s al primer 200. Un incidente en la base no se convierte en un martilleo de todos los clientes conectados.
- **Fail-open y silencioso.** Si `/api/portal/live` falla, la página se queda con los datos del SSR y no muestra ningún error. Es la misma doctrina del middleware: un mecanismo de conveniencia jamás degrada la página que adorna.

### El digest

`GET /api/portal/live?p=<projectId>` → `Cache-Control: no-store`:

```jsonc
{
  "v": 1,
  "at": "2026-07-24T15:04:05Z",
  "notifications": { "unread": 3 },
  "threads": { "unread": 1, "lastMessageAt": "..." },
  "invoices": { "pending": 2, "pendingCents": 480000 },
  "project": {
    "id": 7,
    "progressPct": 62,
    "milestonesUpdatedAt": "...",
    "health": { "status": "up", "uptimePct": 99.8, "openIncidents": 0 }
  },
  "activityLastAt": "..."   // marca del feed (§3)
}
```

Todo sale de un único helper `portalLiveDigest(clientId, userId, projectId)` en
`src/lib/portal/live.ts`, que reutiliza `unreadCount`, `unreadThreadCount`,
`clientInvoiceSummary`, `computeProgress` y `projectHealth` — **cero SQL nuevo
duplicado**. `projectId` se valida contra los proyectos del cliente igual que en
`index.astro`: un id ajeno cae al primero suyo, nunca filtra existencia.

Ese endpoint entra en la allowlist de rutas del portal como cualquier otra ruta
autenticada (no en `PUBLIC_EXACT`) y hereda el gate del middleware.

**Rate limit propio.** Una ruta pensada para ser llamada 180 veces/hora por
pestaña necesita techo explícito: 10 req/min por sesión, con 429 que el cliente
JS interpreta como "aplica backoff", no como error. Sin esto, el paraguas global
de 600/min la deja martillear.

### En el navegador

Un solo script en `PortalLayout.astro` (donde ya vive la campana), no uno por
página. Emite un `CustomEvent('portal:live', { detail: digest })`; cada
componente que quiera reaccionar lo escucha. Así el dashboard, la campana y la
vista de hilo comparten **una sola petición**.

Actualizaciones en el DOM, sin recargar:

- Campana: contador y `aria-label`.
- Dashboard: barra de avance, tarjeta de salud, contadores de facturas/mensajes.
- Hilo abierto: si `lastMessageAt` avanzó, se piden los mensajes nuevos de *ese*
  hilo y se anexan.

Todo cambio visible se anuncia en una región `aria-live="polite"` del layout
("Tienes un mensaje nuevo"), que hoy no existe: una interfaz que muta sola sin
anunciarlo es exactamente lo que rompe a un lector de pantalla. Y respeta
`prefers-reduced-motion` en las transiciones de la barra de avance.

## 2. Fases

### Fase A — Digest y capa viva 🔴 núcleo
1. `src/lib/portal/live.ts` con `portalLiveDigest()` (puro sobre los helpers existentes) y su test de unidad: mismo cliente → datos suyos; proyecto ajeno → cae al propio.
2. `GET /api/portal/live` + rate limit por sesión + `no-store`.
3. Script del layout: ciclo de 20 s, pausa por visibilidad, backoff, `CustomEvent`.
4. Suscriptores: campana, dashboard, hilo abierto.
5. Región `aria-live` + `prefers-reduced-motion`.
6. Guard de demo/impersonación: el digest es `GET`, así que pasa — verificar que en modo demo lee de la base demo (el `AsyncLocalStorage` ya lo resuelve, pero merece un caso en `tests/portal-demo.test.ts`).

### Fase B — Feed de actividad por proyecto
1. Migración aditiva `portal_activity`:
   ```
   id, clientId, projectId?, type: 'milestone' | 'invoice' | 'document' |
   'message' | 'incident' | 'deploy' | 'system',
   title, detail?, href?, visibleToClient (bool, default true), at
   ```
   `clientId` denormalizado a propósito: el feed se lee siempre filtrando por él,
   y no quiero que la consulta más caliente del portal dependa de un JOIN.
2. Emisor `recordActivity()` — fire-and-forget, nunca bloquea, mismo contrato que `recordSecurityEvent`. Se cablea en los puntos que **ya** notifican: hito completado, factura emitida/pagada, documento subido, incidente abierto/resuelto.
3. `deploy`: alimentado desde `ciRuns` de los proyectos del cliente, con texto neutro ("Nueva versión desplegada") — nunca SHA, rama, ni nombre de job. Es OPSEC igual que en `/status`: el cliente ve que hay movimiento, no el mapa de mi pipeline.
4. UI: columna de actividad en `/portal` (últimos 15) + página `/portal/actividad` con paginación y filtro por tipo.
5. `activityLastAt` en el digest → un elemento nuevo se inserta en vivo con su anuncio `aria-live`.
6. Admin: toggle `visibleToClient` sobre entradas del feed, por si algo se emite y no debía verse.

### Fase C — Higiene ✅ (2026-07-24)
1. ✅ Monitor **"Portal de clientes"** (id 10) sobre `https://codebymike.tech/portal/login`, con `expectedText: "Entra a tu portal"` — un 200 que devuelva otra página cuenta como caída — y umbral de latencia de 3000 ms (el login real tarda ~1 s; 2000 daría "degradado" en cada arranque en frío). 1 check cada 5 min contra un límite de 30/min por IP: sin riesgo de autobloqueo.
2. ✅ Artículo **[El clientId nunca viene de la URL](../src/content/notes/el-client-id-nunca-viene-de-la-url.md)**. Se descartó el tema de polling: describiría una Fase A que todavía no existe. El aislamiento multi-tenant sí está construido y es el corazón del diseño.
3. ✅ A11y previa a la Fase A: región `role="status" aria-live="polite"` + helper `window.portalAnnounce()` (`is:inline`, porque los scripts empaquetados son módulos diferidos y podrían no existir cuando responde el primer formulario), skip link y `<main id="contenido">` en `PortalLayout`. Cableado el `flash()` de `/portal/cuenta` (mutaba en silencio y se borraba a los 4 s) y arreglado `/portal/olvide`, donde el formulario desaparecía bajo el foco sin anunciar nada.

**Pendiente de la Fase C:** e2e del anuncio en vivo — se escribe junto a la Fase A, cuando haya algo que anunciar solo.

## 3. Riesgos

| Riesgo | Mitigación |
|---|---|
| El polling multiplica lecturas a Turso | Digest de una sola query agregada, pausa por visibilidad, rate limit por sesión, backoff. Medir con un monitor de latencia de `/api/portal/live` antes de bajar el intervalo. |
| Fuga entre tenants por una ruta nueva | El digest no acepta `clientId`; solo `projectId`, validado contra los proyectos de la sesión. Caso explícito en `tests/portal-isolation.test.ts`. |
| El feed filtra información interna | `visibleToClient` por defecto en el emisor, textos neutros para `deploy`, y revisión de OPSEC como en `/status`. |
| La UI que muta sola marea o rompe a11y | `aria-live="polite"`, respeto a `prefers-reduced-motion`, nunca mover el foco ni reordenar lo que el usuario está leyendo. |
| Complejidad de estado en el cliente | Un único ciclo en el layout + eventos. Ningún componente hace su propio `fetch` periódico. |

## 4. Backlog (no en este plan)

- Web Push (Notification API) para avisar con la pestaña cerrada — requiere permiso del usuario y `service-worker`.
- Bajar a SSE **solo** si aparece un caso que lo exija (chat en vivo durante una sesión de soporte).
- Presencia ("Mike está escribiendo") — bonito, y ninguna utilidad real en un portal asíncrono.
