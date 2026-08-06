# Presentaciones: proyectar, controlar desde el celular y llevar al público en sincronía

Estado: **implementado** (6 ago 2026). Falta únicamente provisionar Upstash y
subir las variables a Vercel — ver §7.

Reemplaza por completo al sistema anterior (imágenes PNG subidas a un proyecto,
sincronizadas por polling contra Turso). Ese sistema se retiró: sus rutas ya no
existen y `astro.config.mjs` las redirige. Sus tablas (`presentations`,
`presentation_slides`) siguen en la base, intactas y sin código que las lea —
borrarlas sería una migración destructiva sobre datos de clientes reales.

---

## 1. Qué hace

Una **sesión** conecta tres vistas:

| Vista | Ruta | Quién | Qué muestra |
|---|---|---|---|
| Pantalla principal | `/present/:sessionId` | el proyector | lobby con QR y PIN → deck → cierre |
| Control remoto | `/remote/:sessionId` | el celular (sesión de admin) | notas arriba, botones abajo |
| Público | `/{pin}` | cualquiera, sin login | el deck en sincronía, solo lectura |

La pantalla principal es la **única** que enseña el QR y el PIN.

## 2. Las dos decisiones que definen la arquitectura

### 2.1 El tiempo real no gasta compute sostenido

Lo natural en este stack sería un SSE desde una función de Vercel. Se descartó
por lo que cuesta: **una invocación viva por espectador durante toda la
charla**. Treinta personas en un salón son treinta funciones abiertas media
hora.

En su lugar, cada espectador abre su `EventSource` **directamente contra
Upstash** (`/subscribe/present:ch:<sessionId>?_token=…`), usando el token de
solo lectura que Upstash documenta precisamente para clientes web. Vercel solo
interviene tres veces: al crear la sesión, al dar el snapshot de entrada (una
petición por dispositivo) y en cada comando del control (una por cambio de
slide). Cero conexiones sostenidas.

WebSocket se descartó antes: el adaptador de Astro para Vercel no expone el
handshake de upgrade (`experimental_upgradeWebSocket` es API de Next).

### 2.2 Dos bases de Redis, no una

- **estado** (`UPSTASH_REDIS_REST_URL` / `_TOKEN`) — privada, solo servidor.
  PIN, slide actual, secreto del presentador.
- **bus** (`PRESENT_BUS_REST_*`) — solo pub/sub. Su token de **solo lectura**
  viaja al navegador de cualquiera que entre por el PIN.

Separadas porque si compartieran base, el token que exponemos al público leería
también el secreto del presentador. Por el bus solo viajan números de slide —
justo lo que el público está viendo proyectado.

## 3. Estado efímero

Todo en Redis con **TTL de 6 h**. Nada toca Turso.

```
present:s:<sessionId>   → JSON de la sesión (incluye presenterSecret)
present:pin:<pin>       → sessionId
present:live            → SET de sesiones vivas (índice del panel)
present:ch:<sessionId>  → canal pub/sub (en la base del bus)
```

Estados: `lobby` → `live` → `ended`. `ended` es terminal. Al terminar se borra
el puntero del PIN, que queda libre; la fila de la sesión sobrevive un rato con
estado `ended` para que quien llegue tarde por el enlace directo vea la pantalla
de cierre y no un 404 mudo.

Sin credenciales de Upstash, `store.ts` cae a un backend **en memoria**. Sirve
para `npm run dev` y para los tests (implementa el mismo contrato, incluido
`subscribe`, que es lo que permite probar dos clientes de verdad). En Vercel eso
sería catastrófico —cada instancia con su copia, media sala en otro slide— así
que `storeReadiness()` lo corta **al crear la sesión**, antes de proyectar nada.

> **Sobre Docker:** no se añadió un Redis a `compose.yaml`. Un `redis:8` local
> daría paridad para el almacén, pero no para lo único que de verdad hay que
> probar en esta feature —el `/subscribe` por SSE que consume el navegador— que
> es una extensión REST de Upstash y no del protocolo Redis. Un contenedor que
> reproduce la mitad fácil y no la difícil da una falsa sensación de paridad. En
> local se usa el backend en memoria, o se apunta a una base de Upstash de
> desarrollo (free tier) cuando hay que probar el camino real.

## 4. El PIN

Cuatro caracteres: **dos letras y dos dígitos, en cualquier orden**. Letras sin
`i`/`l`/`o`, dígitos sin `0`/`1`. **203.136** combinaciones.

La mezcla obligatoria de letra y dígito no es estética: hace que la forma del
PIN sea imposible de confundir con una ruta del sitio (ninguna ruta de la raíz
mezcla letras y dígitos en cuatro caracteres) y legible desde el fondo del
salón.

`src/pages/[pin].astro` es la **última** ruta en resolver. Astro ya prioriza las
estáticas sobre las dinámicas, así que ninguna página real queda tapada; el
orden importa porque este archivo captura cualquier `/algo` de un segmento que
no exista. Por eso el primer filtro es la **forma** del PIN: lo que no la cumple
devuelve el 404 normal del sitio sin llegar a tocar Redis — si no, cada 404 del
sitio (bots incluidos) sería una lectura del almacén de sesiones.

La generación reintenta contra `RESERVED_ROOT_SEGMENTS` y contra los PIN vivos.
`tests/present-pin.test.ts` cruza esa lista contra los archivos reales de
`src/pages` y falla si alguien añade una ruta raíz sin registrarla.

Hay **dos** implementaciones de la forma del PIN a propósito: `isPinShape`
(`lib/present/pin.ts`) y `isPinPath` (`lib/security/paths.ts`, una regex). El
middleware carga `paths.ts` en cada request y debe seguir sin dependencias; un
test cruza ambas sobre 300 PIN generados para que no se separen.

## 5. Los decks

Un deck es **un archivo HTML autónomo** con un `<deck-stage>` y un `<section>`
por slide (`data-label`, `data-speaker-notes`).

Al subirlo, `deck-parse.ts` lo lee **una vez** y guarda slides y notas en
`deck_slides`. Es un escáner de etiquetas propio, no una regex ni una
dependencia nueva: las notas del presentador contienen `>`, comillas y saltos de
línea con toda naturalidad, y una `/<section([^>]*)>/` corta la nota en el
primer `>` y se lleva medio deck por delante **sin dar error**.

El archivo va a Vercel Blob en modo privado y se sirve por **`/decks/:id.html`**,
mismo origen. Es obligatorio: el contrato de integración
(`iframe.contentDocument.querySelector('deck-stage')`) no funciona contra un
origen de blob. Esa ruta lleva `frame-ancestors 'self'` explícito y el
middleware la deja pasar sin pisarle la CSP — heredar el `frame-ancestors 'none'`
de las rutas privadas dejaría el iframe en blanco.

## 6. Seguridad

- **`/remote/`** entra en el matcher `isAdmin` de `src/middleware.ts` (mismo
  criterio que `/cobrar`: vive en la raíz por comodidad de uso, no por ser
  público). Los comandos van a `/api/admin/present/:id/control`, que hereda ese
  gate y **además** valida el secreto en tiempo constante.
- **El secreto nunca viaja en una URL.** Se entrega en el HTML del control, que
  ya está tras el gate y se sirve `no-store`.
- **La vista pública no tiene endpoint que emitir.** Ni conoce el secreto ni
  pasaría el gate.
- **Rate limit**: `/{pin}` a 90/min por IP — más holgado que `/c/[code]` porque
  un salón entero comparte la IP del wifi y treinta escaneos simultáneos son una
  ráfaga legítima. El snapshot (`/api/present/*`) tiene límite propio de
  2.000/min y queda **fuera** del paraguas global por lo mismo: el fallo aquí no
  es un scraper, es la presentación congelándose para media sala.
- **`no-store`** en las tres vistas y en el snapshot. El middleware cachea 300 s
  en el edge todo GET público que no diga lo contrario, lo que congelaría el
  slide para todo el mundo.
- **i18n**: `/present`, `/remote` y `/decks` son prefijos privados —`/en/remote/…`
  devuelve 404 y no una copia del control sin gate. `/{pin}` bajo `/en` redirige
  al español.
- **Feedback anónimo de verdad**: no se guarda IP, ni hash de IP, ni id de
  sesión. El único campo que puede identificar es `contact`, y lo escribe quien
  quiere respuesta.

## 7. Pendiente: provisionar Upstash

```bash
vercel integration add upstash --yes     # ×2: una base de estado y una de bus
```

Variables (proyecto **dev-portfolio**, verificado en `.vercel/project.json`):

| Variable | Base | Dónde se usa |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | estado | servidor |
| `UPSTASH_REDIS_REST_TOKEN` | estado | servidor |
| `PRESENT_BUS_REST_URL` | bus | servidor + navegador |
| `PRESENT_BUS_REST_TOKEN` | bus | servidor (publish) |
| `PRESENT_BUS_READONLY_TOKEN` | bus | **navegador** (solo lectura) |

Con las cinco puestas, `storeReadiness()` deja de avisar en
`/admin/presentaciones` y las sesiones pasan a Upstash.

**Verificación pendiente en vivo:** que `EventSource` (que solo hace GET) sea
aceptado por `/subscribe/{canal}?_token=…`. Si Upstash solo admitiera POST ahí,
`client-sync.ts` cae solo a su tercera capa (polling del snapshot) y todo sigue
funcionando con ~1 s de latencia en vez de ~50 ms; no hay que tocar nada más.

## 8. Archivos

```
src/lib/present/
  pin.ts          PURO   forma, normalización y generación con reintento
  reserved.ts     PURO   rutas raíz reservadas
  state.ts        PURO   lobby→live→ended y validación de rango
  deck-parse.ts   PURO   <deck-stage> → [{ label, speakerNotes }]
  store.ts               Upstash REST + fallback en memoria + storeReadiness
  session.ts             ciclo de vida, TTL, PIN y publicación al bus
  decks.ts               biblioteca (Turso + Blob)
  client-sync.ts  NAVEGADOR  bus → resync → polling, y control del iframe

src/pages/
  admin/presentaciones/{index,[id]}.astro · [id]/lanzar.astro
  present/[sessionId].astro · remote/[sessionId].astro · [pin].astro
  feedback.astro · decks/[id].html.ts
  api/admin/decks/{index,[id]}.ts
  api/admin/present/sessions.ts · [sessionId]/{control,end}.ts
  api/present/[sessionId]/snapshot.ts · api/feedback.ts

tests/present-{pin,state,deck-parse,sync}.test.ts        63 tests
drizzle/0025_calm_anthem.sql        decks, deck_slides, presentation_feedback
```

## 9. Qué queda fuera y por qué

- **No hay miniaturas del deck** en el selector del control remoto: generarlas
  exigiría renderizar el HTML en el servidor. El número y el `data-label` bastan
  para saltar sin mirar mucho.
- **No hay modo "presentador" con el siguiente slide en el celular**: cargaría
  el deck en el móvil, que es justo lo que esta arquitectura evita.
- **El feedback no se agrega ni se puntúa**: se listan los últimos ocho en el
  panel. Cuando haya volumen suficiente para que una media signifique algo,
  merecerá su propia vista.
