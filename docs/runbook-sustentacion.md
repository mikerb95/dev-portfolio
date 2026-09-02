# Runbook: sustentación en /sustentacion

Hay DOS sustentaciones frente al reinicio de cuota de Turso (1 de septiembre):
una antes, una después. Los dos caminos conviven en el mismo despliegue sin
tocar nada: si la base responde, todo sale real; si no, el portal cae solo al
modo respaldo (`src/lib/portal/respaldo.ts`) y se apaga solo en cuanto la base
vuelve. No hay bandera que activar ni desactivar entre las dos fechas.

## 1. Qué correr y en qué orden

```bash
# 1. Precalentar. Despierta las funciones de Vercel antes de que el jurado
#    vea la primera carga fría. Repetir si pasan más de ~10 min sin tocarlo.
npm run sustentacion:precalentar

# 2. Chequeo previo. Una sola pasada, verde o rojo por ítem.
npm run sustentacion:check
```

Si `sustentacion:check` sale con algo en rojo, PARAR y resolverlo antes de
entrar. Un aviso (amarillo) no bloquea, pero léelo: normalmente es la BD caída
con el respaldo cubriéndola, que es un plan B aceptado, no un fallo.

## 2. Cómo obtener los PINes y proyectar el del público

El PIN vive en el módulo de sustentación (`src/lib/sustentacion/bus.ts`), no
en el de presentaciones de deck: son sesiones distintas aunque comparten el
espacio de PINs.

1. Entrar a `/admin/presentaciones` (o directamente a `/sustentacion` si el
   canvas ya sabe pedirlo) con sesión de admin.
2. El canvas llama `POST /api/admin/sustentacion/sesion` al cargar. Por
   defecto **reutiliza la sesión viva**: recargar la pestaña no cambia el PIN
   ni deja al público mirando uno viejo.
3. La respuesta trae **DOS PINes distintos**, y la diferencia importa:

   | Campo | Quién | Longitud | Dónde va |
   |---|---|---|---|
   | `pin` | asistentes | 4 (`k4m7`) | proyectado y dictado en voz alta |
   | `pinPresentador` | yo | 10 (`ab3kd-9mn2p`) | solo en mi celular, nunca en pantalla |

   El de asistente es de **solo lectura**: sirve para seguir la presentación
   en `/sustentacion/seguir/<pin>`, no para moverla. El de presentador es el
   único que autoriza comandos. **Si se proyecta el largo por error, cualquiera
   del público puede mover la presentación**: cerrar la sesión y abrir otra
   (`POST /api/admin/sustentacion/sesion` con `{"reusar": false}`), que emite
   los dos PINes nuevos.

   `pinPresentadorLegible` es el mismo valor con guiones, para teclearlo sin
   equivocarse. Los dos valores llegan al normalizarse igual.
4. Confirmar el flujo con una publicación real:
   ```bash
   SUSTENTACION_COOKIE='authjs.session-token=…' npm run sustentacion:check
   ```
   Copiar la cookie desde el navegador (DevTools → Application → Cookies →
   `authjs.session-token` en producción, o `__Secure-authjs.session-token`).
   Sin esta variable el chequeo omite el ítem de punta a punta con un aviso;
   no es un bloqueo, pero conviene correrlo una vez antes de entrar.

**El bus de presentaciones (Upstash) es independiente de Turso.** Si la BD
está caída, el PIN y la sincronía siguen funcionando igual: son sistemas
distintos y una caída no arrastra a la otra.

## 2 bis. El escenario proyectado

`/sustentacion` es la pantalla que ve el jurado. Es **privada** (sesión de
admin): su HTML lleva el secreto de publicación de la sesión, que es lo que
autoriza a mover la presentación con el teclado. Se abre desde el portátil que
proyecta, que ya tiene sesión.

- **Antes de empezar** muestra el vestíbulo: el PIN de asistente en grande y su
  QR, que es de donde el público saca la vista de seguidor. Si no hay sesión
  abierta, el vestíbulo trae un botón para abrirla sin salir de la pantalla.
- **Teclas**: flechas para navegar, `P` abre la ventana de presentador (notas
  del beat y cronómetro, para la pantalla del portátil), `R` repite la
  animación del beat actual sin publicar nada.
- **El beat 10 enmarca el portal de verdad**, no un video: el iframe se monta al
  CARGAR la página, no al llegar al beat, para que no arranque en frío delante
  del jurado.

El escenario **obedece** el beat que hay en Redis en vez de llevar la cuenta.
Por eso avanzar con el teclado y avanzar desde el celular son la misma cosa
vista desde dos sitios, y ninguna de las dos vías depende de la otra.

Los números que salen proyectados (escalera de estrés, recuperación, cobertura,
conteos del proyecto) se leen de `src/data/sustentacion-datos.json`, que es la
extracción de las corridas reales. **Ninguna cifra está escrita a mano en la
diapositiva**: si se repite una corrida y se regenera ese JSON, la pantalla
cambia sola y no puede contradecir a la evidencia del anexo.

## 2 ter. Qué sobrevive con Turso bloqueado (y con GitHub caído)

**Toda la cadena de la sustentación está construida sobre Redis, no sobre
Turso.** Con la cuota de la base agotada, esto es lo que pasa:

| Pieza | Con Turso bloqueado |
|---|---|
| `/sustentacion` (escenario) | **Funciona.** Solo lee Redis. |
| `/sustentacion/control` (celular) | **Funciona.** PIN y Redis, nada más. |
| `/sustentacion/seguir/<pin>` (público) | **Funciona.** Igual. |
| `/admin/sustentacion` | **Funciona.** Su layout no consulta la base. |
| Sesión de admin | **Funciona.** Auth.js va con JWT, sin adaptador de base, y el registro de dispositivo ya es fail-open. |
| Beat 10 (demo del portal) | **Funciona en modo respaldo**, solo. El paso 2 entra por `/api/portal/demo`, que es quien detecta que la base no responde y emite el pase del snapshot. |

**Y proyectar tampoco depende de GitHub.** El escenario acepta DOS llaves:

1. La sesión de admin, que es lo normal desde el portátil de siempre.
2. **El PIN de presentador**, el mismo de diez caracteres que mueve la
   presentación desde el celular. Se teclea en el vestíbulo del propio
   escenario y sirve desde cualquier portátil, sin login y sin GitHub.

Dar el pase a quien ya tiene ese PIN no regala nada: con él ya se puede mover
la presentación entera desde `/api/sustentacion/comando`. Lo que cambia es
desde dónde, no qué se puede hacer. Las dos llaves usan el mismo cupo
antifuerza bruta, así que alternar de puerta no da más intentos.

**Sin ninguna de las dos llaves, el escenario se sirve igual.** Se presenta con
el teclado en local; lo único que se pierde es publicar el beat a los
seguidores. Lo mismo si Redis entero está caído: la presentación se da, sin PIN
ni celular. Esa es la garantía que importa: **para proyectar no hace falta ni
la base de datos, ni GitHub, ni Redis.**

### Abrir la sesión sin iniciar sesión con GitHub

**Abrir la sesión** (`POST /api/admin/sustentacion/sesion`) es lo único de la
cadena que no puede autorizarse con los PINes, porque es justamente lo que los
acuña. Para no depender de GitHub tampoco ahí, hay una puerta por contraseña:

    https://codebymike.tech/sustentacion/entrar

La contraseña vive en la variable de entorno **`SUSTENTACION_PASSWORD`**
(configurada en Production). Al acertarla deja una cookie de 12 horas y lleva
directo al panel.

**Abre exactamente tres rutas y ninguna más:**

| Ruta | Para qué |
|---|---|
| `/sustentacion` | proyectar el escenario |
| `/admin/sustentacion` | abrir la sesión y leer los PINes |
| `/api/admin/sustentacion/sesion` | el alta que dispara ese panel |

Todo el resto de `/admin` (bóveda de secretos, cobros, finanzas, clientes,
backups, sesiones) sigue detrás de GitHub y de la allowlist. Es un secreto
compartido y por tanto **más débil que el OAuth**: lo que acota el daño de una
filtración es ese alcance, no la contraseña. Una filtración cuesta una sesión
de sustentación reemitida, no el panel. Si se filtra, se cambia la variable.

Sin la variable configurada la puerta **no existe**: `/sustentacion/entrar`
devuelve 404. No hay contraseña por defecto.

### El orden del día

1. Entrar por `/sustentacion/entrar` (o con la sesión de admin de siempre).
2. Abrir la sesión desde `/admin/sustentacion` **antes** de entrar al salón.
3. **Apuntar el PIN de presentador** (dura 6 horas, igual que la sesión).

Con ese PIN en el bolsillo, a partir de ahí no hace falta volver a autenticarse
en ningún sitio, ni para proyectar ni para controlar.

## 3. Controlar la presentación desde el teléfono

El canvas se mueve con el teclado **y** desde el celular; las dos vías son
equivalentes y ninguna depende de la otra.

### La pantalla del celular: `/sustentacion/control`

Se abre en el navegador del teléfono, sin login, y pide el PIN de presentador
una sola vez (queda guardado en el propio teléfono). A partir de ahí muestra:

- El beat actual y su título, con las **notas de narración** de ese beat: es lo
  único que miro mientras hablo.
- El **cronómetro** del beat contra su duración estimada. Se pone ámbar al
  pasarse, nunca rojo: excederse es información, no un fallo.
- Un botón grande de **ADELANTE** y uno pequeño de atrás. El grande dice
  `ENVIANDO` mientras el comando va en camino y `NO LLEGÓ` si no volvió: la
  diferencia entre "no pulsé bien" y "va en camino" tiene que verse.
- El **indicador de enlace** (punto de color) y una franja roja de
  `SIN CONEXIÓN · USA EL TECLADO` cuando el teléfono se queda sin red.
- **Mantener pulsado** el botón de las tres rayas 650 ms abre el selector para
  saltar a cualquiera de los doce beats. Es un gesto mantenido y no un toque a
  propósito: un tap suelto en la esquina superior es justo lo que ocurre al
  agarrar el teléfono.

Dos cosas que conviene tener claras el día de la charla:

- **La posición viene siempre del servidor.** La página no lleva la cuenta del
  beat, la pide. Por eso puedo avanzar con el teclado del portátil y el celular
  se entera igual, y por eso recargar el teléfono no descoloca nada.
- **Si el PIN deja de valer** (por ejemplo tras emitir una sesión nueva), la
  pantalla lo borra sola y vuelve a pedirlo en vez de reintentar: insistir con
  un PIN malo solo quema el cupo antifuerza bruta de mi propia IP.

### El protocolo, por debajo

El teléfono manda contra `POST /api/sustentacion/comando` con el PIN de
presentador:

```jsonc
{ "pin": "ab3kd9mn2p", "accion": "siguiente", "clienteId": "celular-mike", "seq": 12 }
// accion: "siguiente" | "anterior" | "ir" (esta última con "beat": 5)
```

Tres cosas que conviene saber el día de la charla:

- **Un botón pulsado dos veces no salta dos beats.** Cada comando lleva
  `clienteId` + `seq` y el servidor reclama esa pareja de forma atómica: la
  segunda copia se descarta (`aplicado: false`, `motivo: "duplicado"`). Con
  mala señal, insistir es seguro.
- **La respuesta siempre dice el beat ABSOLUTO**, también cuando descarta el
  comando. Si un mensaje se pierde, el canvas se sincroniza en el ciclo
  siguiente sin que haya que tocar nada.
- **El guion se pide una sola vez.** `GET /api/sustentacion/guion` trae las
  notas de narración, el título, el dato y la duración estimada de los 12
  beats; el control lo guarda en memoria al cargar. Si el celular se queda sin
  señal a mitad, las notas siguen ahí.
- **Insistir es seguro también desde la pantalla.** El reintento automático
  reusa el MISMO `seq` que el comando original, que es exactamente para lo que
  sirve el reclamo atómico: con 5G irregular lo normal no es que el comando no
  llegue, es que llegue y se pierda la respuesta.

Si el teléfono deja de responder, **seguir con el teclado y no perder tiempo
depurando**: son dos caminos independientes contra el mismo estado.

## 3 bis. El mazo de `/final.html`: las tres ventanas y quién es cada una

Esto es **otro sistema** y conviene no mezclarlo con lo de arriba: `/sustentacion`
es el escenario dibujado en canvas con PINes y beats; `/final.html` es el mazo
exportado, que se monta en un iframe y se gobierna desde fuera. Comparten el día
y nada más - ni sesión, ni PIN, ni código.

Desde la sección 11 del plan hay **tres ventanas con tres papeles distintos**, y
abrir la que no toca es la forma de romperlo:

| Ventana | Dónde | Cuántas | Papel |
|---|---|---|---|
| `/present-admin` | portátil del ponente | **1** | conduce: descubre el mazo, lo toca y publica dónde va |
| `/remote` | celular del ponente | 1 | manda: pasa diapositivas y enseña el guion |
| `/presentacion` | equipo de cada asistente | N | mira: obedece y no dice nada |

Ninguna tiene puerta: no hay login que caduque el día de la charla. El estado
completo del sistema es un número, y lo peor que puede hacer quien encuentre la
URL es pasar una diapositiva de algo que ya está proyectado en la pared.

### El montaje, en orden

1. **`/present-admin` en el portátil**, a pantalla completa, y esperar a que el
   mazo monte (el contador `NN / MM` abajo). Es la única ventana que publica la
   posición real: hasta que esté abierta, el mando no sabe cuántas diapositivas
   hay.
2. **`/remote` en el celular.** Sin PIN y sin sesión. Ahí van el guion, la
   rejilla de saltos y los botones ↑/↓ para recorrer las páginas vivas.
3. **`/presentacion` en los equipos de la sala**, si se usa. Solo mira.

**Nunca dos ventanas conduciendo a la vez.** `/present-admin` y la vieja
`/presentacion` escritora serían dos escritores de la misma clave, y el síntoma
es una presentación que va y viene sola.

### La regla del login de la demo, que no es un detalle

Tres beats del mazo no proyectan una lámina: enmarcan una página viva (la demo
del portal, `/status`, `/engineering`). En el beat de la demo se entra
**siempre por el enlace de demo pública**, nunca con credenciales reales.

El motivo: lo que viaja a la sala es la **URL**, no la sesión. Una sesión de
verdad sería intransferible y cada asistente se quedaría mirando el formulario
de entrada mientras en la pared se enseña el panel. La demo pública es un `GET`
sin login que siempre entra como el mismo usuario de mentira contra la base de
demo, así que quien abra esa dirección ve exactamente lo mismo, sea el ponente
o cualquiera de la sala.

### Tres cosas que sorprenden si no se saben antes

- **Con el foco dentro de la demo, las flechas no pasan de diapositiva.** Es
  deliberado: el teclado del mazo está tapado para que una flecha no mueva un
  beat por fuera del servidor y deje a la sala atrás. Se sale clicando en la
  lámina, fuera de la ventanilla, o se pasa desde el móvil.
- **Un clic en la lámina no hace nada**, y eso es la señal de que está bien
  montado: el bundle avanza un beat con cualquier clic en el escenario, y por
  eso solo la página viva recibe el ratón.
- **El cronómetro arranca solo**, con el primer movimiento que saca la
  presentación de la primera diapositiva. No hay botón de empezar. Un toque en
  la isla y un segundo toque para confirmar lo reinician - hace falta de
  verdad: el arranque vive seis horas, así que el de un ensayo de la mañana
  llegaría vivo a la tarde y el reloj empezaría en `04:12`.

## 4. Cómo cambiar a modo respaldo si la red falla

Hay dos redes distintas de las que depender, y cada una tiene su propio plan:

### La base de datos (Turso) no responde

No hay que cambiar nada a mano. El camino es automático:

1. El presentador entra al portal desde `/sustentacion` (el iframe apunta a
   `/portal`) o visita `/api/portal/demo` directamente.
2. Esa ruta intenta una sesión real, falla contra la base caída, y cae al
   modo respaldo: dos, `/portal` y `/portal/facturas` se sirven desde
   `src/data/portal-respaldo.json`, un snapshot versionado calcado del seed
   real (mismo cliente, mismas tres facturas en sus tres estados).
3. El banner morado de "Demo pública" avisa que son datos ficticios servidos
   desde una copia porque la base no está disponible. No hay que ocultarlo:
   es parte de ser honesto con el jurado sobre qué se está viendo.
4. Alcance del respaldo: `/portal`, `/portal/facturas`,
   `/portal/facturas/[id]`. Documentos, mensajes y cuenta redirigen al login
   en este modo (no tienen snapshot); si el recorrido los necesita, avisar
   antes de abrirlos.

Verificarlo por adelantado:
```bash
curl -s https://codebymike.tech/api/health | grep -o '"ok":[a-z]*'
npm run sustentacion:check   # el ítem "Modo respaldo del portal" confirma si cubre
```

### La red del salón falla (datos móviles del presentador o del público)

- **Los números de la charla no dependen de la red.** Cobertura, conteo de
  pruebas, la escalera del estrés, el punto de quiebre: todo vive en
  `src/data/sustentacion-datos.json`, leído inline en la página. Si el 5G
  muere a mitad de frase, esos datos siguen en pantalla.
- **El iframe del portal sí depende de la red** (es la única pieza que la
  necesita, por diseño de la Fase 4). Si se congela, seguir hablando con los
  números embebidos y volver al iframe cuando la conexión regrese; no hay
  nada que reiniciar del lado del canvas.
- **La vista de seguidor del público nunca se vacía.** Si el celular de
  alguien pierde señal, el último beat se queda en pantalla con un punto
  ámbar discreto ("Sin conexión, reintentando"); nunca un hueco en blanco.
  Reconecta sola con backoff hasta 15 s.

## 5. Qué verificar 10 minutos antes de entrar

```bash
npm run sustentacion:precalentar
npm run sustentacion:check
```

Y a mano:

- [ ] `sustentacion:check` sin nada en rojo (los avisos se leen, no bloquean).
- [ ] El PIN actual funciona: abrir `/sustentacion/seguir/<pin>` desde un
      celular de verdad, con datos móviles, no con el wifi del salón.
- [ ] `/sustentacion` abre en el portátil que proyecta y se ve el vestíbulo
      con el PIN y el QR. Probar las flechas y `P` antes de que entre nadie.
- [ ] **El PIN de presentador está apuntado fuera del navegador** (papel o
      notas del teléfono). Es la llave que abre el escenario y el control sin
      depender de GitHub ni de la base de datos.
- [ ] `/sustentacion/control` abre en el celular y acepta el PIN de
      presentador (tenerlo a mano ANTES de empezar: sale solo en el panel).
- [ ] El control remoto mueve el canvas desde el celular, también con datos
      móviles: avanzar, retroceder y saltar a un beat concreto.
- [ ] El PIN de presentador NO está en pantalla ni en el QR: solo el de 4
      caracteres se proyecta.
- [ ] El iframe de `/sustentacion` carga `/portal` sin error de CSP en la
      consola (F12 → Console, buscar "Refused to frame").
- [ ] Publicar un beat de prueba y confirmar que llega al seguidor
      (`SUSTENTACION_COOKIE=… npm run sustentacion:check`, o a mano desde el
      canvas).
- [ ] **Mazo de `/final.html`:** `/present-admin` abierta en el portátil y el
      contador del mazo visible; `/remote` en el celular moviendo las tres
      pantallas; un clic en la lámina que NO avanza nada; y el beat de la demo
      entrando por el enlace de demo pública, no con credenciales reales.
- [ ] Si se usa la sala como seguidores: `/presentacion` abierta en un teléfono
      prestado, bloquearlo dos minutos, desbloquearlo y confirmar que se pone al
      día **sin arrastrar a nadie**. Es la prueba que justifica el reparto de
      papeles; si no se hace, no se ha verificado nada.
- [ ] Si la BD está caída: confirmar que el banner de "Demo pública" aparece
      en `/portal` y que las tres facturas (pagada, pendiente, vencida) se
      ven. Si no aparecen, algo rompió el respaldo, entrar con capturas de
      pantalla como último recurso.

## Referencias

- `docs/plan-control-final.md`: el control remoto de `/final.html` entero. La
  §11 es el reparto en tres ventanas y la §12 el orden de entrega. **No
  confundir con `src/lib/sustentacion/`**, que es el otro sistema.
- `src/pages/present-admin.astro`: la ventana que conduce, con el porqué de cada
  una de sus cinco piezas propias (interacción por dentro, teclado tapado en
  fase de captura, rueda, espejo de URL y la isla del cronómetro).
- `docs/runbook-cuota-turso.md`: por qué se agota la cuota y el plan general
  de "aguantar hasta el corte del ciclo" (no exclusivo de la sustentación).
- `src/lib/portal/respaldo.ts`: el módulo de respaldo del portal, con la
  justificación de seguridad de por qué es aceptable.
- `src/lib/sustentacion/bus.ts` y `seguir.ts`: sesión, PIN y sincronía del
  módulo de sustentación (no confundir con `src/lib/present/`, que es el de
  presentaciones de deck).
- `src/lib/sustentacion/control.ts`: el canal inverso (teléfono → canvas), con
  las tres invariantes que lo sostienen (posición absoluta, idempotencia por
  reclamo atómico, y cero dependencia de Turso) explicadas en la cabecera.
- `src/lib/sustentacion/pin-presentador.ts`: por qué son dos PINes y no uno.
- `src/pages/sustentacion/control.astro` y `src/lib/sustentacion/mando.ts`: la
  pantalla del celular y el envío de comandos (identidad, contador y reintento).
- `src/pages/sustentacion.astro`, `src/lib/sustentacion/escena.ts` y
  `src/data/sustentacion-escena.ts`: el escenario proyectado, su mecánica
  (disposición, motor de interpolación, encuadre de cámara) y la coreografía
  por beat.
- `src/pages/admin/sustentacion.astro`: abrir la sesión y leer el PIN de
  presentador. Es el único sitio donde ese PIN aparece.
- `src/lib/sustentacion/pase.ts`: la segunda llave del escenario, y por qué
  proyectar no puede depender de GitHub OAuth.
- `src/lib/sustentacion/acceso.ts`: la puerta por contraseña y, sobre todo, por
  qué su alcance son tres rutas y no el panel entero.
- `src/lib/portal/respaldo.ts`: el modo respaldo del portal, que es lo que
  sostiene el beat 10 con la cuota agotada.
- `src/lib/sustentacion/obedecer.ts`: el lado del canvas, con la decisión de
  transporte (polling de 250 ms siempre, SSE como acelerador).
- `scripts/precalentar-sustentacion.mjs` y `scripts/sustentacion-check.mjs`:
  los dos comandos de este runbook, comentados por dentro.
