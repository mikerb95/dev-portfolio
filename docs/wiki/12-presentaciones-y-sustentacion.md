# 12 · Presentaciones y sustentación

Hay **tres sistemas de presentación independientes**. No comparten código ni
claves (salvo el espacio de PINs y la infraestructura de Upstash). Es la parte
más fácil de confundir del repo.

| Sistema | Para qué | Rutas | Plan |
|---|---|---|---|
| **A. Decks con PIN** | Cualquier charla con un deck HTML subido | `/admin/presentaciones`, `/present/<id>`, `/remote/<id>`, `/<pin>` | [`plan-presentaciones.md`](../plan-presentaciones.md) |
| **B. Mazo `final.html`** | El mazo de la sustentación, generado fuera del repo | `/presentacion`, `/present-admin`, `/present-tablet`, `/remote`, `/presentacion-end` | [`plan-control-final.md`](../plan-control-final.md) |
| **C. Escenario de sustentación** | Escenario en canvas con beats y paneles en vivo | `/sustentacion`, `/sustentacion/control`, `/sustentacion/seguir/<pin>`, `/admin/sustentacion` | [`runbook-sustentacion.md`](../runbook-sustentacion.md) |

## Decisión común: el tiempo real no gasta cómputo sostenido

Un SSE desde una función de Vercel sería una invocación viva por espectador
durante toda la charla (30 personas = 30 funciones abiertas media hora). En su
lugar, cada espectador abre su `EventSource` **directamente contra Upstash
Redis** con un token de solo lectura. Vercel solo interviene al crear la
sesión, al dar el snapshot inicial (una petición por dispositivo, con
resincronización cada 10 s) y en cada comando del control. Por eso el
middleware abre `connect-src` al origen de Upstash solo en esas vistas, y los
snapshots tienen su propio rate limit fuera del paraguas global (toda la sala
comparte la IP del wifi).

Variables: `PRESENT_BUS_REST_URL`, `PRESENT_BUS_REST_TOKEN`,
`PRESENT_BUS_READONLY_TOKEN` (o las `UPSTASH_REDIS_*` / `KV_REST_API_*`),
`PRESENT_SECRET`.

## A. Decks con PIN (RF-208)

- **Biblioteca** (`/admin/presentaciones`): se sube un deck HTML autónomo; el
  parser (`present/deck-parse.ts`) extrae slides y notas; los assets van a un
  store de Blob (`DECK_ASSETS_BLOB_READ_WRITE_TOKEN`) y se reescriben las rutas
  relativas (`present/assets.ts`).
- **Lanzar** crea una sesión efímera en Redis (`present/session.ts`,
  `present/store.ts`) con un **PIN de 4 caracteres** que vive 6 h. Es una
  confirmación explícita porque publica un PIN en la raíz del sitio.
- Tres vistas: **pantalla** `/present/<id>` (lobby con QR y PIN → deck →
  cierre; la única que enseña el PIN), **control remoto** `/remote/<id>` (sesión
  admin, notas arriba y botones abajo) y **público** `/<pin>` (sin login, solo
  lectura).
- `/<pin>` es la última ruta del sitio en resolverse; `present/reserved.ts`
  lista los segmentos que ya existen para que un PIN nunca los tape.
- Máquina de estados y validación de comandos en `present/state.ts`.
- `/decks/<id>.html` sirve el HTML enmarcado con su propia CSP
  (`frame-ancestors 'self'`).
- Reemplazó al sistema viejo (PNG por proyecto con polling contra Turso); sus
  rutas redirigen y sus tablas siguen intactas.

## B. Mazo `final.html` (RF-714 a RF-720)

`public/final.html` es un mazo generado fuera del repo que **se reemplaza
entero** en cada iteración. Regla dura: ninguna cifra suya (cuántos beats,
capas, z-index) vive en el código; la pantalla **descubre su forma** en cada
carga (`presentacion/lienzo.ts`, `mapa.ts`) y lo mueve despachando el mismo
`keydown` que su bundle escucha.

| Pieza | Papel |
|---|---|
| `/present-admin` | **La pantalla que conduce**: descubre el mazo, publica la posición `actual`, obedece el `destino` y permite **tocar la página viva** dentro de un beat (entrar a la demo del portal, navegar `/status`). Panel retráctil del ponente (RF-719): índice, ritmo, salud del enlace, atajos. Salida automática al cierre al terminar (RF-720). |
| `/presentacion` | La vista que abre **la sala en sus propios equipos**: sigue la posición y aplica **espejo** (la página que el ponente toca), **puntero** (qué señala) y **eco** (lo que escribe y lo que le contestan). |
| `/remote` | Mando **público** sin sesión ni PIN: dos botones, rejilla de salto, desplazamiento del iframe de un beat (RF-715) y guion. Es público porque lo único que permite es pasar una diapositiva de algo ya proyectado. |
| `/present-tablet` | Pantalla de apoyo del presentador (no es espejo del escenario). |
| `/api/presentacion` | Estado: destino que pide el mando + posición que publica la pantalla. |
| `/presentacion-end` | Página de cierre para compartir después (es y en). |

Por qué se separaron conducción y vista (§11.1 del plan): con público, una
copia en un teléfono bloqueado podía publicar una posición atrasada y arrastrar
a toda la sala. Ahora solo `/present-admin` escribe `actual`.

`presentacion/cronometro.ts` (cronómetro de la sustentación), `guion.ts` (qué
nota corresponde a cada posición), `cierre.ts`, `estado.ts` (reglas puras del
mando). Guion sincronizable con `npm run guion:sync` / `guion:check`.

## C. Escenario de sustentación (RF-712, RF-713)

- `/sustentacion`: el **escenario** proyectado. Porte del diseño hecho en Claude
  Design, sin React: un grafo en `<canvas>` 2D con un motor de interpolación de
  ~30 líneas (`sustentacion/escena.ts`) y paneles HTML del servidor que
  enmarcan páginas reales (`/portal`, `/status`, `/engineering`,
  `/docs/kanban`, `/lab/site-check`, por eso son *framable*).
- **Quién manda**: el beat vive en Redis y el escenario lo **obedece**. Dos vías
  equivalentes: el teclado del portátil y el celular
  (`/sustentacion/control`, con el **PIN de presentador**).
- **Seguidores**: `/sustentacion/seguir/<pin>` (PIN corto del público).
- **Puesto de mando**: `/admin/sustentacion` (abre la sesión y muestra los dos
  PINes).
- **Doble llave del escenario** (`sustentacion/pase.ts`): sesión admin o PIN de
  presentador. Sin ninguna, se muestra igual y se presenta con el teclado, sin
  publicar a los seguidores.
- **Contraseña de sustentación**: abre solo esas rutas sin GitHub (ver
  [07](07-autenticacion-y-accesos.md#sustentación-por-contraseña)).
- **No depende de Turso**: vive en Redis. Si la base cae, el portal enmarcado
  pasa solo al modo respaldo. Por eso la revocación fail-closed del admin
  exceptúa estas rutas.

### Antes de presentar

```bash
npm run sustentacion:precalentar   # despierta las funciones antes de la primera carga fría
npm run sustentacion:check         # chequeo verde/rojo por ítem; si hay rojo, PARAR
```

Runbook completo: [`docs/runbook-sustentacion.md`](../runbook-sustentacion.md).
Guion: `docs/guion-sustentacion.json`, `src/data/guion-final.ts`,
`src/data/sustentacion-escena.ts`.

## Otras presentaciones del repo

- `/docs/presentacion`: deck académico privado (solo sesión admin).
- `/platziconf`: landing de contacto de la Platzi Conf.
- `expo-datacenters/`: material de una exposición sobre data centers en Bogotá
  (no es código de la app).
