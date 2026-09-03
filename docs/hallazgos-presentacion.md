# Hallazgos: `/remote`, `/presentacion` y `/present-admin`

Auditoría de la funcionalidad **entre** las tres ventanas del control de
`/final.html`, hecha el 3 de septiembre de 2026 contra el código en `main`
(último commit `472cc3d`), el dev server y Chrome.

No es un rediseño ni una revisión de cada pieza por separado: lo que se mira
aquí es el protocolo que las une, que es donde un fallo no degrada una función
sino que deja la charla parada con el jurado delante.

El plan vivo del sistema es [`plan-control-final.md`](./plan-control-final.md);
lo que sigue no lo sustituye. Donde un hallazgo ya está contemplado allí, se
dice y se enlaza la sección.

## 0. El mapa que se auditó

```
/remote          POST {accion|destino}  ─┐
(mando, sondea 1/s)                      │
                                         ├─→ /api/presentacion ──→ presentStore
/present-admin   POST {pos,total,espejo, │      · destino   escribe el mando
(pantalla + consola,   puntero,scroll}   │      · actual    escribe la pantalla
 sondea 2/s)                             │      · scroll · espejo · puntero · inicio
                                         │
/presentacion    POST {pos,total,scroll} ┘   → anunciar() a `present:ch:final`
(seguidor, sondea 2/s)
```

El reparto de papeles que describe §11.1 (la pantalla es `/present-admin`, la
sala solo mira) está a medio construir: `/presentacion` sigue publicando. De ahí
sale el primer hallazgo y buena parte de los demás.

## 1. Dos escritores de `actual`, y el segundo puede secuestrar la charla

**Severidad: alta. Contemplado en [§12.6](./plan-control-final.md), paso 3 ⛔.**

`/presentacion` conserva sus seis llamadas a `reportar()`
(`src/pages/presentacion.astro:597,604,628,633,640,642`), así que **cualquier
copia abierta en la sala es un escritor de `presentacion:actual` con derecho a
voto sobre el destino**. Reproducido contra el dev server:

```bash
# la pantalla va por la 12 y el destino es 12
curl -sX POST $API -d '{"pos":12,"total":22,"intro":2,"outro":1,"origen":"mando"}'
curl -sX POST $API -d '{"destino":12}'

# un seguidor con la pestaña congelada publica su posición vieja
curl -sX POST $API -d '{"pos":3,"total":22,"intro":2,"outro":1,"origen":"ajena"}'
# → {"destino":3,"actual":{"pos":3,...}}
```

El destino cae de 12 a 3 y `/present-admin` rebobina la sala entera obedeciendo.
Es exactamente el escenario que §11.1 dice haber corregido, corriendo hoy.

No hace falta un teléfono congelado para llegar ahí: la reconciliación de
`/presentacion` reporta `ajena` siempre que rompe el bucle sin alcanzar la meta
(`sinMover >= 3`, o un `paso()` que devuelve `null`), y eso publica una posición
intermedia con derecho de adopción.

Y el daño no acaba en el destino. `/presentacion` también pisa `actual.total` y
`actual.scroll`, que son de donde `/remote` saca el techo del mazo
(`techo()` en `lib/presentacion/estado.ts`) y la barra de desplazamiento. Un
seguidor con el bundle a medio descubrir le apaga los botones al mando.

**Lo que agrava el hallazgo respecto al plan.** §12.2 dice que mientras dure el
solape "no se abren las dos a la vez", pero esa regla no está escrita en ningún
sitio que la haga cumplir: `/presentacion` es una ruta pública, sin puerta, sin
bandera y sin aviso en la propia página. Basta con abrirla desde el celular para
comprobar la proyección, que es un gesto razonable, para romper la charla.

**Salidas posibles, en orden de coste:**

1. Un aviso en la propia `/presentacion` mientras el paso 3 no esté hecho.
   Barato y honesto, pero depende de que alguien lo lea.
2. Poner sus `reportar()` detrás de una bandera apagada por defecto. Deja la
   ventana como seguidor de sondeo (que es lo que hace falta), no toca el
   servidor y no espera al paso 0. El precio es el de §12.2: sin nadie que
   publique la forma del mazo, `/remote` se queda sin techo, sin rejilla y sin
   guion, **salvo que `/present-admin` esté abierta**, que es el montaje real de
   la sustentación. Con esa condición escrita en el runbook, es la opción
   proporcionada.
3. El paso 3 completo (bus + `client-sync` parametrizado), que sigue detrás de
   la compuerta del paso 0.

## 2. El techo de la sala son tres teléfonos, no treinta

**Severidad: alta. No contemplado en el plan.**

`/api/presentacion` cae bajo el paraguas global de 600 peticiones por minuto y
por IP: `isRateLimitablePath` solo excluye assets estáticos
(`src/lib/security/paths.ts:12`), y el paraguas se aplica en
`src/middleware.ts:336`. Con la sala compartiendo el NAT del salón, el
presupuesto por minuto es:

| Ventana | Sondeo | GET/min | POST/min | Total |
|---|---|---|---|---|
| `/present-admin` | 500 ms | 120 | ~12 (latido) | **~132** |
| `/remote` | 1 s | 60 | los que se pulsen | **~60** |
| `/presentacion` (cada asistente) | 500 ms | 120 | ~12 (latido) | **~132** |

El ponente solo (portátil + celular) gasta unas 192/min, un tercio del
presupuesto. **A partir del cuarto asistente se pasa de 600**, y el 429 no cae
solo sobre el público: cae sobre la misma IP que usa el portátil que conduce y
el celular que lleva el mando. El paraguas se traga el mando junto con la sala.

Esto es independiente del hallazgo 1: aunque `/presentacion` dejara de escribir,
sus 120 GET/min por asistente siguen contando. Es la razón por la que el paso 3
pide el bus, y también la razón por la que **entregar `/presentacion` a la sala
sin el bus no es una versión reducida del plan, es una avería**.

Si algún día hay seguidores por sondeo, el endpoint necesita su propio cupo
fuera del paraguas, como ya lo tiene `/api/present/*/snapshot`
(`src/middleware.ts:324`, límite 2.000/min y explícitamente excluido del
paraguas), y por el mismo motivo que allí está escrito: el fallo aquí no es un
scraper suelto, es la presentación congelándose para media sala.

## 3. El bus publica al vacío, y la CSP ya paga por él

**Severidad: baja. Es deuda del plan, no un fallo.**

`anunciar()` publica en `present:ch:final` en cada movimiento, cada scroll y
cada reporte de posición (`src/pages/api/presentacion.ts:147`). **No hay ningún
suscriptor**: no existe un `EventSource` ni una llamada a `subscribe` sobre ese
canal en todo `src/`. Los tres clientes van por sondeo.

Y el middleware ya abre `connect-src` al origen de Upstash para `/presentacion`
(`src/middleware.ts:656-667`), con un comentario que describe un EventSource que
todavía no existe. Es una relajación de CSP sin contrapartida.

Ninguna de las dos cosas rompe nada hoy (`anunciar()` es fail-open y la apertura
de CSP no habilita a nadie más que a Upstash), pero conviene que quede escrito:
la parte servidor de §12.4 se entregó completa y la parte cliente no, así que
hay código de producción cuyo consumidor está en el paso 3.

## 4. Tras clicar dentro de la demo viva, las flechas quedan muertas

**Severidad: media. No contemplado en el plan. Muerde en mitad de la charla.**

Verificado en Chrome contra `/present-admin` en local: con el foco dentro de
`#lienzo`, una `ArrowRight` **real** no llega al `keydown` del documento de
fuera y el destino no cambia.

```js
f.contentWindow.focus()
document.addEventListener('keydown', () => { window.__llego = true }, { once: true })
// ...ArrowRight real...
window.__llego            // → false
// GET /api/presentacion  → destino sin cambiar
```

El mecanismo es la suma de dos cosas correctas por separado:

- `taparTeclado()` (`src/pages/present-admin.astro:846`) se come las teclas
  `isTrusted` en fase de captura sobre el documento del bundle, que es lo que
  §11.4 pide para que una flecha no mueva un beat por fuera del servidor.
- Un `keydown` nacido dentro de un iframe **nunca** propaga al documento padre,
  así que el listener de `/present-admin` que haría el `POST` no llega a
  ejecutarse.

Resultado: la tecla no es que mueva un beat sin pasar por el servidor. Es que no
hace absolutamente nada, y sin ningún rastro.

**Cuándo pasa de verdad.** Solo con el foco dentro del iframe, y ahí llega justo
por donde §11.3 quiere que llegue: clicando dentro de la página viva de los tres
beats de demo (el portal, `/status`, `/engineering`). O sea, en el momento en
que se acaba de tocar la demo y toca seguir.

Clicar sobre la lámina, fuera de la ventanilla, **no** mete el foco en el
iframe: el `pointer-events: none` que `afirmarInteraccion` escribe en el `body`
del bundle funciona, y `document.activeElement` se queda en `BODY` (comprobado).
Así que hay salida, y además `/remote` sigue moviendo la presentación. Pero la
salida es indescubrible: nada indica que haya que clicar en la lámina para
recuperar el teclado.

**Arreglo propuesto.** Que el listener de captura, además de comerse la tecla,
la enrute por `mandar()`, que es la regla del propio §11.4: un solo camino por
el que se mueve la presentación. Con dos cuidados:

- Hay que engancharlo **también al documento de la página viva**. `taparTeclado`
  vive en el documento del bundle y el evento de un iframe anidado tampoco sube
  hasta ahí. El sitio natural es junto a `engancharRueda` y `engancharPuntero`,
  que ya resuelven ese mismo problema para la rueda y el ratón y ya llevan su
  marca `__enganchado` para no apilar listeners por sondeo.
- Hay que saltarse `input`, `textarea` y `[contenteditable]`: `/portal/login` es
  uno de los `ATAJOS` del panel (`lib/presentacion/panel.ts`), y una flecha
  dentro de un campo de texto es del campo.

## 5. `/remote` es el único de los tres sin cronómetro

**Severidad: baja, pero es la ventana equivocada para tener el reloj.**

El `GET` sin `q` devuelve `{ destino, actual, viva, scroll }` y no `inicio`
(`src/pages/api/presentacion.ts`, rama final del `GET`). Los `POST` de
movimiento sí lo traen, pero `/remote` no lee ese campo en ningún sitio.

El reloj vive solo en la isla de `/present-admin` (§11.6), es decir en el
portátil: la pantalla que **no** se está mirando mientras se habla de pie. El
celular, que es lo que se tiene en la mano, es el único que no sabe qué hora es.

Añadirlo es barato y no crea estado nuevo: `inicio` y `ahora` ya existen, la
corrección de desfase ya es un módulo puro (`lib/presentacion/cronometro.ts`) y
el viaje ya se hace una vez por segundo. Es un campo más en una respuesta que ya
se devuelve.

## 6. `/presentacion-end` es un callejón sin salida

**Severidad: baja. La parte grave ya está corregida.**

El bucle de reentrada (abrir `/present-admin` después del cierre, reconstruir el
mazo hasta el final y ser expulsado otra vez a los cinco segundos) **ya está
arreglado** por la fase `esperando` de `lib/presentacion/cierre.ts`: la cuenta no
se arma hasta que la ventana ha estado en reposo fuera del final al menos una
vez desde que cargó. Cubierto por `tests/presentacion-cierre.test.ts` (18 tests).

Lo que queda es menor: `/presentacion-end` no enlaza de vuelta a
`/present-admin`. Es una página pública del sitio y probablemente no deba
hacerlo, pero conviene que el runbook diga que la vuelta al mazo durante el
turno de preguntas se teclea a mano.

Queda también una decisión sin tomar: `/presentacion` no implementa el cierre,
así que la sala se queda mirando la última lámina mientras la ventana del
ponente se va a la página de enlaces. Puede ser lo correcto (el mazo termina en
"¿Preguntas?"), pero hoy es un silencio, no una decisión escrita.

## 7. Lecturas del almacén que se tiran en el camino caliente

**Severidad: baja. Es coste, no fallo.**

`/present-admin` sondea `?q=destino` dos veces por segundo, y esa rama hace
cinco lecturas del almacén (`destino`, `scroll`, `espejo`, `puntero`, `inicio`)
en un `Promise.all`. De esas, **`espejo` y `puntero` se descartan siempre**: esa
ventana es quien los escribe y no los aplica nunca.

Son 240 lecturas por minuto de algo que no se usa, durante toda la charla. Una
variante `?q=conducir` que devuelva `{ destino, scroll, inicio, ahora }` las
ahorra sin tocar a los otros dos clientes.

## 8. Lo que sí está coherente entre las tres

Vale la pena dejarlo escrito, porque es lo que no hay que tocar al arreglar lo
de arriba:

- **El reparto de claves aguanta.** `destino` (mando), `actual` (pantalla) y
  `scroll`/`espejo`/`puntero` en claves propias evita la carrera del camino
  caliente sin CAS, y las dos excepciones documentadas (acotar contra el total
  real, adoptar un movimiento ajeno) están en un módulo puro y probado.
- **Los tres clientes coinciden en las reglas que importan:** los topes se
  comparan contra lo pedido y se acotan contra lo real; la nota del guion va con
  el **destino** y el número grande con la posición confirmada; el scroll es una
  posición absoluta atada a su `pos`, así que el iframe vuelve arriba solo al
  cambiar de beat sin una escritura extra ni un cron de limpieza.
- **`espejo` y `puntero` degradan bien.** `urlPara` y `punteroPara` comparan
  `pos` antes de aplicar nada, así que un mensaje de la diapositiva de al lado no
  pinta un cursor sobre la fila que no es.
- **El middleware separa bien el vecindario.** `/remote` exacto (y `/remote/`
  con barra) es el mando público; `/remote/<sessionId>` sigue exigiendo sesión de
  admin. Cubierto por `e2e/auth.spec.ts`.
- **`/final.html` vive en `public/`**, así que el `frame-ancestors 'none'` que el
  middleware pone en las rutas no enmarcables no lo alcanza. Merece un comentario
  donde toque: no está en `isFramablePath`, así que el día que ese bundle pase a
  servirse desde una ruta SSR, los dos lienzos se quedan en blanco sin más pista
  que un aviso en consola.

Los 234 tests de `tests/presentacion-*.test.ts` pasan.

## 9. Orden sugerido

| # | Hallazgo | Depende de |
|---|---|---|
| 1 | 4. Flechas muertas tras clicar en la demo | nada. Es el único que muerde durante la charla y es independiente de la compuerta del paso 0 |
| 2 | 1. Dos escritores de `actual` | nada, si se toma la salida 2 (bandera). El paso 3 completo sigue detrás del paso 0 |
| 3 | 5. Cronómetro en `/remote` | nada |
| 4 | 2 y 3. Cupo propio del endpoint y bus | el paso 0 (§12.3): si sale "sala no", los dos dejan de hacer falta y hay que **retirar** el `anunciar()` y la apertura de CSP, no ampliarlos |
| 5 | 6 y 7. Vuelta del cierre, `?q=conducir` | nada |

El hallazgo 2 es el que puede cambiar el diseño, no solo la implementación, y
depende de una medida que todavía no se ha hecho. Los otros cuatro se pueden
entregar sin esperar a nadie.
