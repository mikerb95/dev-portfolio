# Control remoto de `/final.html`

Estado: **implementado** (1 sep 2026). Funciona contra el almacén en memoria
(dev) y contra Upstash (producción, la misma base que ya existe).

Es un sistema aparte de `/present/:sessionId` (decks subidos, PIN, público) y
del mando de `/sustentacion`. No comparte código ni claves con ninguno de los
dos: aquí no hay sesión, ni PIN, ni público que seguir. Solo la pantalla que
proyecta `final.html` y el teléfono que la mueve.

## 1. Las tres piezas

| Pieza | Ruta | Papel |
|---|---|---|
| Pantalla | `/presentacion` | monta `final.html` en un iframe y lo mueve por teclado |
| Mando | `/remote` | dos botones, rejilla de salto, posición real y guion |
| Estado | `/api/presentacion` | destino que pide el mando + posición que publica la pantalla |

`final.html` no se toca ni se edita, y además se **reemplaza entero** cada vez
que se itera la presentación. De ahí la regla dura del diseño: ni una sola cifra
suya vive en este código. Ni cuántos beats trae, ni cuántas capas, ni sus
z-index. La pantalla descubre su forma en cada carga y se mueve desde fuera
despachando el mismo `keydown` que su propio bundle ya escucha.

El mando vive en **`/remote` a secas** porque se teclea de memoria en el
celular con la sala esperando. `/presentacion/control`, que fue su primera
dirección, quedó como redirección 308.

**`/remote` es público; `/remote/<sessionId>` no.** Son dos sistemas distintos
compartiendo vecindario en la raíz: el segundo es el control de las
presentaciones con deck y PIN y sigue exigiendo sesión de admin. El matcher
`isAdmin` del middleware los separa por ruta exacta, incluida la variante con
barra final que Astro sirve igual. Abrir el mando no puede abrir el panel.

## 2. El mazo no son los beats

El bundle solo sabe contar beats. Su contador dice `01 / 19` en la cita, `01 /
19` otra vez en la portada y `19 / 19` en el cierre: cuatro diapositivas reales
colapsadas en dos números. Derivar la posición de ese contador -que es lo que se
hacía- daba dos fallos que se vieron en vivo:

- al arrancar, un solo toque del mando gastaba **tres** flechas de golpe (cerrar
  cita, cerrar portada, avanzar un beat), porque la reconciliación seguía
  disparando mientras el contador no se moviera;
- el cierre era **inalcanzable**: el servidor acota el destino contra el total
  publicado, y ese total no lo incluía.

La posición es ahora un **índice global** sobre las tres zonas del mazo:

| Zona | Qué es | Quién manda |
|---|---|---|
| capas de entrada | cita, portada | `/presentacion`, por estilo |
| beats | los que pinten `NN / MM` | el bundle, por teclas |
| capas de cierre | «¿Preguntas?», y lo que se añada detrás | `/presentacion`, por estilo |

El reparto de mando es lo que hace la navegación **reversible**. El bundle no
sabe volver a su portada: `closeCover` es de ida y su `go()` acota en el primer
beat. Pero su portada no es más que un div tapado, y ponerlo y quitarlo desde
fuera no necesita recargar nada. Las reglas viven en `src/lib/presentacion/mapa.ts`,
probadas sin DOM ni bundle.

### Cómo se descubre la forma

Al cargar, `/presentacion` busca en el iframe **capas**: cualquier elemento
apilado (z-index numérico) que cubra el escenario entero. Las que ya se ven van
**antes** de los beats; las que están ocultas, **después**. Dentro de la
entrada manda la más alta (tapa a las de abajo); en el cierre, la más baja (las
siguientes se apilan encima). Un bundle sin capas se comporta como antes: solo
beats. Añadir una diapositiva al final del mazo no toca este código.

## 2.1. Una sola verdad: el bundle

`final.html` es lo único que sabe en qué beat está y cuántos hay. Todo lo demás
se deriva de ahí:

- **`presentacion:destino`** es una INTENCIÓN, no un hecho. Lo escribe el mando.
- **`presentacion:actual`** (`{ pos, total, ts }`) es el HECHO, ya en índice
  global. Lo publica la pantalla.

Mientras difieren, la pantalla cierra la diferencia a flechazos. Cuando
coinciden, el sistema está en reposo. La versión anterior guardaba una sola
`pos` que hacía de las dos cosas a la vez, y por eso el mando podía decir "ok"
mientras nada se movía: confirmaba la intención, no el hecho.

Que el estado sea una **posición absoluta** y no una cola de comandos es lo que
hace que un sondeo perdido no pierda nada. Tres toques seguidos suman tres
porque se acumulan sobre el destino, no sobre la posición real, que va por
detrás durante la animación.

## 2.2. El guion en el mando

El mando enseña, de la diapositiva que se está viendo: el título, la frase que
el público está leyendo, la duración estimada y las notas de discurso.

El guion vive en `src/data/guion-final.ts`, **no dentro del mazo**, por lo mismo
que el resto: el bundle se reemplaza entero en cada iteración y el discurso no
puede irse con él. Las notas actuales nacieron dentro de `final.html` y se
sacaron a ese archivo para poder reescribirlas sin tocarlo.

Va por **zonas**, no por número global: `GUION_INTRO`, `GUION_BEATS`,
`GUION_OUTRO`. Con una lista plana del 1 al 22, añadir una capa de entrada
desplazaría el guion entero un puesto y cada nota quedaría en la diapositiva de
al lado. Por zonas, una diapositiva nueva al final no mueve nada de lo demás.

Un hueco no es un error: una zona más corta que el mazo real (beats nuevos
todavía sin escribir) enseña **"sin notas para esta diapositiva"**, que es
justo lo que hay que ver para saber que falta.

Para resolver la zona, la pantalla publica **la forma del mazo** (`intro` y
`outro`) junto a la posición. Son opcionales en `Actual` y se validan aparte:
una forma rota se descarta entera y el mando se queda sin notas, nunca sin
control. Y si no hay forma, no se enseña ninguna nota: delante del público, la
nota de otra diapositiva es peor que ninguna.

### La nota va con el destino, el número con la realidad

Es la única cosa de este sistema que NO enseña la posición confirmada, y es
deliberado. La posición real llega hasta dos segundos tarde: el mando avisa al
servidor, la pantalla lo lee en su sondeo (500 ms), mueve la diapositiva
(350 ms), publica, y el teléfono lo sondea (1 s). En ese hueco lo que se lee es
la nota anterior, y es justo el instante en que se mira el teléfono. Peor en un
salto largo, donde la pantalla publica cada cuatro pasos.

Con el destino, la nota cambia en el mismo fotograma del toque. No rompe la
regla de no mentir: el destino ES lo que se va a decir, la línea de "avanzando
a N" de justo encima avisa de que la proyección va por detrás, y si la pantalla
no llegara, publica su posición como movimiento `ajena`, el servidor la adopta
como destino y la nota vuelve sola a la realidad.

**El guion viaja en el JS de `/remote`, que es una página pública.** Quien
teclee la URL puede leerlo. Para un discurso que se va a dar en voz alta
delante de un tribunal no es gran cosa, pero es un cambio respecto a "lo peor
que puede hacer quien la encuentre es pasar una diapositiva": si alguna vez
importa, el sitio para poner la puerta sigue siendo el que dice la sección 8.

## 3. Quién escribe qué, y por qué son dos claves

El almacén no tiene CAS. Con una sola clave compartida, el toque del pulgar y
la publicación de la pantalla se pisarían justo en el instante en que más se
pulsa, y el fallo sería el peor posible: un botón que no hace nada. Dos claves
con un escritor cada una hacen que esa carrera no exista en el camino caliente.

La pantalla escribe `destino` solo en dos casos raros, ambos en
`destinoTrasReporte()`:

- **acotar** contra el total real en cuanto se conoce (el mando pudo pedir la
  40 antes de que nadie dijera cuántas hay);
- **adoptar** un movimiento ajeno.

## 4. Los cuatro orígenes de un reporte

Es la única decisión con enjundia del módulo puro, y la que evita dos fallos de
los que se ven en vivo:

| Origen | Qué pasó | Qué hace con el destino |
|---|---|---|
| `inicial` | la pantalla acaba de cargar | **nada**: si la charla iba por la 7 y la pestaña se recarga, se reconstruye sola hasta la 7 |
| `latido` | nadie se mueve desde hace 5 s | nada: solo refresca `ts` |
| `mando` | se movió obedeciendo | acota |
| `ajena` | alguien pulsó la flecha en el portátil | **adopta**: manda la realidad |

Sin `ajena`, el sondeo siguiente arrastraría la presentación de vuelta y
pelearía con quien está delante del teclado. Sin la regla de `inicial`, una
recarga a mitad de charla dejaría la presentación clavada en la portada.

## 5. Detalles que costaron una depuración

1. El `KeyboardEvent` se construye con el constructor **del iframe**. Uno
   creado en el realm de la página no dispara el listener del bundle.
2. La posición se lee del **DOM**, no del evento `sustentacion:beat`. El script
   es un módulo diferido y el iframe puede haber cargado antes, con lo que el
   `load` ya no vuelve a dispararse.
3. El bundle arranca con sus capas de entrada abiertas y **se traga una tecla
   por cada una** antes de mover un beat. Esa deuda se paga una sola vez y en
   orden; después, mandarle una tecla para retirar una capa movería un beat que
   nadie pidió. Aun así el corte de la reconciliación siguen siendo tres
   no-movimientos, no uno: es la red por debajo, no la regla.
4. Los botones de la rejilla los crea el script, así que **no** llevan el
   `[data-astro-cid-…]` con el que Astro reescribe los selectores del `<style>`
   scoped: necesitan `:global(...)` o salen con el estilo por defecto del
   navegador, y eso solo se ve ya montado en el móvil.
5. El teléfono sondea **solo con la pestaña visible**, pero la primera lectura
   es incondicional: abrirlo en segundo plano dejaba el mando en "conectando".
6. La intención de cada capa se lleva en memoria, no se lee del DOM. Con la
   pestaña en segundo plano el navegador congela las transiciones CSS y la
   opacidad calculada se queda a medias: comparar contra ella hacía que la
   pantalla se peleara consigo misma al volver.
7. Un viaje largo publica su avance cada cuatro pasos, y de esa misma respuesta
   saca el destino: cruzar el mazo entero son veinte pasos, y en ese rato el
   mando daría a la pantalla por muerta (15 s sin hablar) y no habría forma de
   cambiar de idea a mitad de camino.

## 6. Coste

Pantalla: 2 lecturas/s (`?q=destino`, que no arrastra el `actual` que ella
misma escribió) más un latido cada 5 s. Mando: 2 lecturas/s solo mientras se
mira. Da del orden de 15.000 comandos por hora de charla contra Upstash, y es
el techo del diseño: bajarlo es subir `SONDEO_MS`, a costa de latencia.

## 7. Verificado en vivo (dev, 1 sep)

Contra el `final.html` real, ya con el mazo completo (22 posiciones: cita,
portada, 19 beats, cierre):

- descubrimiento correcto de las tres capas y del total, sin nada cableado;
- `1 → 22` y `22 → 1` de punta a punta, con el cierre alcanzable y la cita
  reabierta después de haber pasado por el final, **sin recargar el iframe**;
- topes en las dos puntas: la flecha de más no mueve el destino;
- ida y vuelta paso a paso por la frontera cita/portada/beat 1.

Y antes, con el sistema de solo beats:

- recarga con la charla en la 9: la pantalla se reconstruye sola hasta la 9;
- tres toques rápidos: llegan los tres (destino 9 → 12), ninguno se pierde;
- salto directo a la 19 y flecha de más: el destino se queda en 19 y el botón
  se apaga en vez de mentir;
- flecha pulsada dentro del bundle (19 → 18): el destino adopta 18 y no
  arrastra la presentación de vuelta.

## 8. Fuera de alcance

- **Sin PIN ni sesión.** Es el estado completo del sistema y lo peor que puede
  hacer quien lo encuentre es pasar una diapositiva de algo que ya está
  proyectado en la pared. Si alguna vez importa, el sitio para ponerlo es el
  `POST`, no la página.
- **Sin notas del ponente en el mando.** Cargarlas exigiría meter el bundle en
  el teléfono, que es justo lo que este diseño evita.
- **Sin SSE.** El sondeo de 500 ms cumple de sobra para una persona moviendo
  diapositivas, y el peor caso del sondeo es el caso normal.

## 9. Archivos

```
src/lib/presentacion/estado.ts        PURO  acotar, techo, orígenes, adopción
src/lib/presentacion/mapa.ts          PURO  zonas del mazo, índice global, paso a paso
src/lib/presentacion/guion.ts         PURO  qué nota le toca a cada posición
src/data/guion-final.ts               el discurso, por zonas (aquí se edita)
src/pages/presentacion.astro          la pantalla (iframe + reconciliación)
src/pages/remote/index.astro          el mando (`/presentacion/control` redirige aquí)
src/pages/api/presentacion.ts         destino + actual, dos claves en Redis
tests/presentacion-estado.test.ts     12 tests
tests/presentacion-mapa.test.ts       21 tests (incluye convergencia de todos contra todos)
tests/presentacion-guion.test.ts      11 tests (forma del mazo, zonas, huecos)
```

## 10. Pendiente: desplazar el iframe de un beat desde el mando

**Estado: planeado.** Tres beats del mazo proyectan una página viva dentro de un
iframe (14 la demo del portal, 16 `/status`, 17 `/engineering`). Hoy el mando
mueve diapositivas pero no puede recorrer esas páginas: hay que ir al portátil.

### 10.1. Por qué se puede

Los tres iframes apuntan a `https://codebymike.tech/...`, que en producción es
el MISMO origen que sirve `/presentacion`. La cadena entera (página → mazo →
iframe interno) es de un solo origen y se puede mover con `scrollTo` desde
fuera. `isFramablePath` ya les da `frame-ancestors 'self'`, que es lo que hace
falta para que se enmarquen; el mismo origen es lo que además permite tocarlos.

Consecuencia para el desarrollo: **en local no se puede probar tal cual**. Esas
URLs son absolutas a producción, así que desde `localhost` son de otro origen y
no se dejan tocar. Se verifica apuntando el iframe descubierto a la ruta local
equivalente, solo durante la prueba.

### 10.2. El scroll es otra posición absoluta

No un comando relativo. Es la misma decisión que sostiene todo lo demás: un
sondeo perdido no pierde nada, tres toques seguidos valen tres porque se
acumulan sobre el destino, y el estado completo cabe en un número.

| Clave | Quién escribe | Qué es |
|---|---|---|
| `presentacion:scroll` | el mando (vía servidor) | `{ pos, y }`: el desplazamiento que se pide, y **para qué diapositiva** |
| `actual.scroll` | la pantalla | `{ y, max, alto }`: dónde está de verdad y cuánto se puede bajar |

El `pos` de la clave es lo que hace que **el iframe vuelva arriba solo** al
cambiar de diapositiva, que es lo que se pidió: si el `pos` guardado no es el
destino actual, el desplazamiento pedido es 0. Sin escrituras extra, sin cron de
limpieza y sin carrera - cualquier camino que cambie de diapositiva (incluida la
adopción de un movimiento ajeno desde el teclado del portátil) lo reinicia por
construcción.

El paso lo calcula el SERVIDOR, no el teléfono: `alto / 3` sobre la geometría
que publicó la pantalla, igual que `mover()` acota contra el techo real del
mazo. El teléfono solo dice "subir" o "bajar" y no necesita saber nada de la
página que hay dentro del iframe.

### 10.3. Coste: cero peticiones nuevas

La pantalla ya sondea `?q=destino` dos veces por segundo. Esa respuesta pasa a
ser `{ destino, scroll }`: un número más en un viaje que ya se hacía. El mando
publica el desplazamiento en el mismo `POST` con el que ya manda todo lo demás.

### 10.4. La pantalla

1. **Descubrir el iframe en juego.** Como todo aquí, por forma y no por
   identidad: de los `<iframe>` del mazo, el visible más grande que se solape
   con el escenario. Un mazo nuevo con otros iframes funciona igual.
2. **Publicar su geometría** en `actual.scroll`. Si no hay iframe, si es de otro
   origen o si no tiene nada que desplazar, se publica sin `scroll` y el mando
   sencillamente no enseña los controles. Fail-open, como el resto.
3. **Reconciliar** con `scrollTo({ behavior: 'smooth' })`, con un cierre de unos
   400 ms después de cada empujón: el sondeo va a 500 ms y la animación dura
   parecido, así que sin ese cierre el siguiente ciclo pelearía con la animación
   en curso. Y nunca mientras `aplicando` esté activo: si se está cruzando el
   mazo, el scroll espera.

### 10.5. El mando

Los controles **sustituyen a la rejilla de saltos** mientras la diapositiva
tenga algo que desplazar, y la rejilla vuelve sola al salir. Es el sitio que
menos se usa en mitad de una demo y no empuja el guion.

- Dos botones grandes, ↑ y ↓, uno al lado del otro.
- **Mantener pulsado repite**: el primer empujón sale al tocar y luego se repite
  cada ~350 ms mientras el dedo siga puesto.
- Cada empujón es **un tercio de la altura visible**, animado.
- Se apagan en los topes (`y <= 0`, `y >= max`), por la misma regla que ya
  gobierna "Siguiente": un botón que no puede hacer nada se apaga en vez de
  mentir.
- Una barra fina de 2 px marca por dónde va la página dentro del iframe.

### 10.6. Archivos

```
src/lib/presentacion/desplazamiento.ts   PURO  paso, acotado y vínculo con la diapositiva
src/lib/presentacion/estado.ts           + `scroll` en `Actual` (opcional, se descarta si no cuadra)
src/pages/api/presentacion.ts            + acciones subir/bajar, + `scroll` en `?q=destino`
src/pages/presentacion.astro             descubrir el iframe, publicar geometría, reconciliar
src/pages/remote/index.astro             botones ↑/↓ con repetición, en lugar de la rejilla
tests/presentacion-desplazamiento.test.ts
src/data/documentacion.ts                RF-715, `planeado` → `implementado` al entregarlo
```

### 10.7. Fuera de alcance

- **Sin clics dentro del iframe.** Solo desplazamiento. El modelo de posición
  absoluta admitiría después un clic por coordenadas, pero un clic no es
  idempotente y no se acumula: es otro problema.
- **Sin scroll horizontal.** Ninguna de las tres páginas lo necesita.
- **Sin control del vídeo.** Si el mazo se exporta con `DEMO_MODE=video`, no hay
  nada que desplazar y los controles no aparecen; pausar o rebobinar sería otra
  cosa distinta.


## 11. `/present-admin`: el mando con lienzo

**Estado: planeado.**

`/presentacion` monta el mazo con `pointer-events: none` a propósito: un clic
dentro movería el bundle por su cuenta y el sondeo siguiente lo devolvería de
golpe. Eso está bien para lo que se proyecta y **no se cambia**.

Lo que falta es una pantalla desde la que se pueda **usar** la demo: escribir en
el login del portal, clicar, recorrer `/status`. Vive en `/present-admin`, se
abre a la vez que `/presentacion`, y el reparto de papeles es:

| Ventana | Dónde | Quién la ve | Qué hace |
|---|---|---|---|
| `/presentacion` | proyector | el público | obedece, publica `actual`, no se toca |
| `/present-admin` | portátil | solo el ponente | se toca, y lo que hace se refleja en la otra |
| `/remote` | celular | el ponente | pasa diapositivas y enseña el guion |

### 11.1. La idea que ordena todo lo demás

> **`/present-admin` no es una segunda pantalla: es un mando con lienzo.**

Escribe exactamente lo que escribe `/remote` (el destino, y el desplazamiento
del beat) y **no escribe nada de lo que escribe la pantalla** (`actual`). Que
además pinte el mazo es para poder tocarlo, no para que nadie lo mire.

Esa frase resuelve las tres cosas que parecían difíciles:

- **La carrera de las dos pantallas no existe.** Si `/present-admin` publicara
  `actual`, y en concreto con origen `ajena`, el servidor adoptaría su posición
  como destino y las dos ventanas se arrastrarían mutuamente: ping-pong, y el
  número bailando en el teléfono. Como no lo publica, el escritor único de
  `actual` sigue siendo el de siempre y la disciplina de la sección 3 se
  mantiene entera.
- **Su teclado local no necesita nada nuevo.** Una flecha en el portátil hace el
  mismo `POST { accion }` que el pulgar. Llega a las dos ventanas por el mismo
  camino, y el origen `ajena` (que existe para el teclado del portátil dentro
  del bundle) no tiene que aparecer en este lado.
- **Medio espejo sale gratis.** La posición ya se refleja por `destino`, y el
  desplazamiento del iframe por `presentacion:scroll`, que la sección 10 ya
  dejó montado. Lo único que hay que inventar es la URL (11.5).

Consecuencia que vale por sí sola: **`/presentacion` no cambia ni una línea.**

### 11.2. Relevo: qué pasa si `/presentacion` no está abierta

Ensayando en solitario sobre el portátil no habría nadie publicando `actual`, y
eso degrada tres cosas de verdad: `techo()` cae a `POS_MAX` y el mando deja de
acotar, la forma del mazo desaparece y con ella las notas del guion (sin forma
no se enseña ninguna, sección 2.2), y `viva` dice que la pantalla está muerta.

Relevo por caducidad, sin coordinación ni bandera nueva:

- `/present-admin` publica `actual` **solo si el que hay está rancio**, con el
  mismo umbral que ya define "viva" (`FRESCURA_MS`, 15 s).
- Con `/presentacion` abierta, su latido de 5 s lo mantiene fresco y
  `/present-admin` no escribe nunca. Sin ella, releva en 15 segundos.
- Si la otra vuelve, el primer sondeo ve el `ts` fresco y `/present-admin` se
  calla otra vez. Converge en un ciclo, sin negociar nada.
- Aun relevando, **nunca publica con origen `ajena`**: `inicial`, `latido` y
  `mando` no tocan el destino salvo para acotarlo. Adoptar es justo lo que se
  quiere evitar si la otra ventana reaparece a mitad de un viaje.

Para saberlo necesita el `ts`, que `?q=destino` no devuelve a propósito (no
duplicar lecturas de lo que la pantalla misma escribió). Se añade
`?q=destino&relevo=1`, que agrega **solo el `ts`**, no el `actual` entero. Lo
pide únicamente `/present-admin`; el coste de `/presentacion` no se mueve.

### 11.3. La interacción: `pointer-events` por dentro, no por fuera

Quitarle el `pointer-events: none` al `<iframe>` devuelve el fallo entero: el
bundle escucha `onStageClick` y **cualquier clic en el escenario avanza un
beat**. Lo que se quiere es más fino: que el ratón llegue a la página viva del
beat y a nada más.

Se hace por dentro, con el mismo truco que ya usa `pintarCapa`. Todo es mismo
origen, así que se escribe estilo en el documento del bundle:

| Nodo | `pointer-events` |
|---|---|
| el `<iframe>` de la pantalla | `auto` |
| el `body` del bundle | `none` |
| el iframe vivo descubierto | `auto` |

Un descendiente puede volver a habilitarlos, así que la lámina queda inerte y
solo la ventanilla recibe clics. `onStageClick` no se dispara ni por accidente,
y no hace falta ni parchearlo.

El descubrimiento del iframe es **por forma**, como todo aquí: el visible más
grande que se solape con el escenario. Es el mismo que la sección 10 ya
descubre para desplazarlo, así que se reutiliza tal cual. Un beat sin iframe
deja la lámina entera inerte, que es el comportamiento de hoy.

El estilo se **re-afirma en cada sondeo**, por la misma razón que `afirmarCapas`
existe: el bundle monta y desmonta esos iframes al cambiar de beat, y el nodo al
que se le puso `auto` puede haber dejado de estar.

Detalle que se ve en la pared: el bundle escala el iframe con `transform`
(`transform-origin: 0 0` sobre 1864x920). El hit-testing del navegador atraviesa
la transformación, así que el clic cae donde se ve. No hay que corregir
coordenadas.

### 11.4. El teclado: quién se queda cada tecla

Tres consumidores posibles, y hay que repartirlos a mano o dos se pisan.

**1. La página `/present-admin`.** Flechas, espacio, `PageUp`/`PageDown`,
`Home`/`End` y dígitos para salto directo. No mueve nada por su cuenta: hace el
`POST` de destino y deja que la reconciliación de las dos ventanas haga el
resto. `preventDefault` para que la barra espaciadora no desplace la página.

**2. El bundle.** Registra `window.addEventListener('keydown', ...)` en fase de
burbuja, que es el último eslabón. Si el foco cae dentro del iframe del mazo (y
un clic lo lleva ahí), una flecha nativa movería un beat **sin pasar por el
servidor**: la proyección se quedaría atrás y el mando enseñaría un número que
no es.

Se le tapa con un listener en **fase de captura** sobre el documento del bundle,
que es el reverso exacto de `disparar()`. Aquella inyecta el evento con el
constructor del iframe; esta lo intercepta antes de que el bundle lo vea. El
discriminador es `isTrusted`:

```js
// Las teclas de carne y hueso no llegan al bundle: mover un beat por fuera del
// servidor dejaría a la proyección y al mando enseñando un número que no es.
// Las sintéticas -las que dispara la reconciliación- sí pasan: son la única
// forma que tiene esta página de mover el mazo.
d.addEventListener('keydown', (e) => {
  if (e.isTrusted) { e.stopPropagation(); e.preventDefault() }
}, true)
```

**3. La página viva dentro del beat.** Sus teclas nacen en otro documento y no
suben ni al bundle ni a nosotros, así que escribir una contraseña en el login
del portal funciona sin hacer nada. El precio es la otra cara de lo mismo y hay
que saberlo antes de estar delante del tribunal: **con el foco dentro de la
demo, las flechas no pasan de diapositiva**. Se sale clicando fuera, o se usa el
móvil, que es lo que ya se hace.

### 11.5. El espejo: qué se refleja y qué no

Lo que hace `/present-admin` tiene que verse en el proyector. Tres capas, y solo
una es trabajo nuevo:

| Qué | Cómo se refleja | Estado |
|---|---|---|
| la diapositiva | `presentacion:destino`, que ya escribe como mando | **hecho** |
| el desplazamiento del beat | `presentacion:scroll`, sección 10 | **hecho**, falta que lo escriba también la rueda |
| la URL del iframe vivo | `BroadcastChannel`, 11.5.2 | nuevo |
| tecleo y clics sin cambio de URL | no se refleja, 11.5.3 | fuera de alcance |

#### 11.5.1. La rueda escribe donde escribe el pulgar

Hoy `presentacion:scroll` lo escribe el mando. Si la rueda del ratón desplazara
el iframe en `/present-admin` sin escribirlo, pasarían dos cosas malas: el
proyector no seguiría, y un "bajar" posterior desde el celular daría un salto,
porque el servidor cree que la página sigue arriba.

Así que `/present-admin` publica su desplazamiento en esa misma clave. Son dos
escritores, y aquí sí se acepta: es coherente con 11.1 (esta ventana **es** un
mando), la ventana de carrera es de milisegundos, y el peor caso es un salto de
scroll, no un botón que no hace nada. La regla de la sección 3 se guarda para lo
que de verdad se pulsa a ciegas.

Con un acotado: se escribe **cuando el valor cambia y como mucho dos veces por
segundo**. Una rueda sin acotar son cincuenta escrituras por gesto, y la sección
6 ya vive cerca de su techo.

#### 11.5.2. La URL: `BroadcastChannel`, y por qué no el servidor

Si haces login en el portal, el iframe navega. El proyector tiene que navegar
igual o se queda en el formulario vacío mientras tú enseñas el panel.

El canal es **`BroadcastChannel`**, no una clave más en Upstash. La razón no es
la latencia ni el coste (que también): es que **el espejo de una demo
autenticada obliga ya a que las dos ventanas compartan el mismo navegador.** La
sesión del portal vive en una cookie de `codebymike.tech`; si la proyección
saliera de otra máquina o de otro perfil, navegar su iframe a `/portal` lo
devolvería al login delante del tribunal. Como el mismo navegador es un
requisito duro, un canal que solo funciona dentro del mismo navegador no pierde
nada, y ahorra una clave, un escritor y un camino que puede discrepar del otro.

- Emisor: `/present-admin` observa la URL del iframe vivo (mismo origen, así que
  se lee) y emite `{ seq, href }` cuando cambia.
- Receptor: `/presentacion` navega su propio iframe vivo con
  `location.replace()` y no con `src`, para no llenar de historial una ventana
  que nadie va a poder navegar hacia atrás.
- `seq` monótono: un mensaje viejo que llegue tarde se descarta en vez de
  deshacer una navegación buena.
- **Nunca contra la navegación guionizada del propio bundle.** El mazo ya mueve
  ese iframe por su cuenta (`this.frame.src = new URL(p.nav, DEMO_SRC).href`)
  como parte de la coreografía de algunos beats. El espejo solo actúa si el
  `href` recibido difiere del que ya hay, y espera a que el beat se asiente
  (`PASO_MS`) antes de mirar. Si no, el espejo y la coreografía se pelearían por
  el mismo iframe en el peor momento.
- Sin canal (proyección en otro navegador) no pasa nada roto: la posición y el
  scroll siguen yendo por el servidor, y solo la navegación de la demo se queda
  atrás. Fail-open, como el resto.

**El requisito operativo, escrito para el runbook:** las dos ventanas, el mismo
navegador y el mismo perfil. Portátil con pantalla extendida, que es el montaje
real.

#### 11.5.3. Lo que no se refleja, y por qué está bien

Tecleo carácter a carácter, clics que solo cambian estado de cliente (una
pestaña, un desplegable), foco. Reflejarlo es duplicar el DOM entre dos
ventanas, y ese es otro problema entero (y otro orden de fragilidad delante de
un tribunal).

En la práctica no se echa de menos: lo que la sala necesita ver es el
**resultado**, y todo resultado en estas tres páginas pasa por una navegación.
Escribes el email y la contraseña con el proyector mostrando el formulario
vacío, pulsas entrar, y las dos ventanas enseñan el panel a la vez. Un
tecleo espejado, además, enseñaría al tribunal cuántos caracteres tiene tu
contraseña.

### 11.6. El cronómetro

Una isla flotante en la parte superior de `/present-admin` con el tiempo que
lleva la sustentación. Como esta ventana **solo la ve el ponente** (11), el
reloj no llega a la pared y no hay nada que ocultar.

#### 11.6.1. El arranque vive en el servidor

Por lo mismo que todo lo demás de este sistema: una recarga a mitad de charla es
un escenario contemplado (sección 4, origen `inicial`), y un cronómetro que se
pone a cero justo ahí sería peor que no tenerlo.

- Clave `presentacion:inicio`, epoch en ms, mismo TTL de 6 h.
- **La escribe el servidor**, dentro del `POST` que mueve el destino, la primera
  vez que el destino sale de `POS_INICIAL` y la clave no existe. Sin escritor
  nuevo, sin viaje nuevo, y sin un gesto más que recordar con la sala esperando:
  el primer toque para salir de la cita arranca el reloj.
- **Se lee de gorra** en `?q=destino`, que pasa a devolver
  `{ destino, scroll, inicio }`. Un número más en un viaje que ya se hacía, que
  es la misma decisión que tomó la sección 10.3.
- La isla cuenta en local desde `inicio` con un tick de 1 s. No depende del
  sondeo: si Upstash se cae a mitad de charla, el reloj sigue.

#### 11.6.2. El desfase de reloj, que no es teórico

`inicio` lo pone el reloj del servidor y la cuenta la hace el reloj del
portátil. Si el portátil va dos minutos adelantado, el cronómetro arranca en
`02:00`, y es exactamente el tipo de fallo que no se nota ensayando y sí en
vivo.

Se corrige sin pedir nada: la misma respuesta trae el `ahora` del servidor, y de
la diferencia con el `Date.now()` local sale un desfase que se aplica a la
cuenta. Dos números en lugar de uno, en un viaje que ya se hacía.

#### 11.6.3. Reiniciar

Hace falta de verdad: con TTL de 6 h, el arranque de un ensayo de la mañana
llegaría vivo a la sustentación de la tarde y el reloj empezaría en `04:12`.

Un toque en la isla lo reinicia, con confirmación de un segundo toque (un clic
accidental en la única cosa clicable que hay sobre el lienzo no puede borrar el
tiempo). Es `POST { accion: 'reiniciar-cronometro' }`, que borra la clave; el
reloj vuelve a arrancar solo en el movimiento siguiente.

#### 11.6.4. La isla, y el detalle que la haría inservible

Va flotando sobre el lienzo, y el lienzo entero es una superficie que hay que
poder clicar. Si la isla comiera los clics de la franja superior, se llevaría
por delante justo la barra de navegación del portal en la demo.

Por tanto: **`pointer-events: none` en el contenedor de la isla**, y `auto`
solo en el pastillero del cronómetro, que es lo único que se pulsa. Es la misma
regla que gobierna 11.3, aplicada a nuestra propia UI.

Lo demás: cifras tabulares (`font-variant-numeric: tabular-nums`) para que no
bailen de ancho al pasar de `9` a `10`, `mm:ss` hasta la hora y `h:mm:ss`
después, y peso visual bajo - es un dato de apoyo, no el protagonista de la
ventana.

#### 11.6.5. Opcional, no incluido: ritmo contra el guion

`GUION_BEATS` ya trae la duración estimada de cada diapositiva (sección 2.2).
Sumarla da un presupuesto, y contra el tiempo real sale un "vas 2 min por
delante", que es más útil que el número desnudo. No entra en este plan: es
estado cero y datos que ya existen, así que se puede añadir después sin tocar
nada de lo de arriba, y conviene ver primero si el reloj a secas ya basta.

### 11.7. Ruta, puerta y encabezados

Ruta `/present-admin` a secas, un archivo `src/pages/present-admin.astro`. El
guion en vez de la barra no es cosmético: `/present/<sessionId>` es el sistema
de decks con PIN y `/remote/<algo>` exige sesión de admin. Con un guion,
`startsWith('/present/')` e `isAdmin` no la rozan por construcción, y no hay que
añadir ninguna excepción como la que `/remote` a secas necesitó.

**Sin puerta**, por lo mismo que la sección 8 y con un argumento más: el día de
la charla, una sesión de GitHub caducada dejaría sin mando. Pero cambia una cosa
respecto a la original y hay que decirla en voz alta: aquí quien encuentre la
URL no solo pasa una diapositiva, puede **teclear dentro de la demo**. Lo que
hay dentro es `codebymike.tech/portal/login`, `/status` y `/engineering`, tres
páginas que ya son públicas y con su propio rate limit: enmarcarlas no añade
superficie, solo la acerca. Si alguna vez importa, el sitio para la puerta sigue
siendo el `POST`, no la página.

`Cache-Control: no-store` y `noindex, nofollow` como la actual, y fuera de
sitemap y de cualquier enlace entrante.

### 11.8. Archivos

```
src/pages/present-admin.astro           el mando con lienzo (nuevo)
src/lib/presentacion/lienzo.ts    PURO  descubrimiento del mazo y del iframe vivo,
                                        extraído de presentacion.astro para no
                                        tener dos copias divergiendo
src/lib/presentacion/cronometro.ts PURO desfase de reloj, formato mm:ss / h:mm:ss,
                                        cuándo arranca
src/lib/presentacion/espejo.ts    PURO  forma del mensaje, `seq`, cuándo se aplica
                                        y cuándo se descarta
src/lib/presentacion/estado.ts          + regla de relevo (rancio -> puedo publicar)
src/pages/api/presentacion.ts           + `inicio` y `ahora` en `?q=destino`
                                        + `?q=destino&relevo=1` (agrega solo `ts`)
                                        + `accion: 'reiniciar-cronometro'`
src/pages/presentacion.astro            + receptor del espejo (única adición)
tests/presentacion-relevo.test.ts       quién publica y cuándo, sin DOM
tests/presentacion-cronometro.test.ts   desfase, formato, arranque idempotente
tests/presentacion-espejo.test.ts       orden por `seq`, mensajes viejos, sin canal
src/data/documentacion.ts               RF-716, `planeado` -> `implementado`
docs/runbook-sustentacion.md            el montaje de dos ventanas del mismo navegador
docs/plan-control-final.md              esta sección, marcada al entregar
```

El único refactor de `/presentacion` que contempla el plan es **extraer** su
descubrimiento a `lienzo.ts` sin cambiar su comportamiento, para que las dos
ventanas descubran el mazo con el mismo código. Si al empezar resulta que
extraerlo obliga a tocar su reconciliación, se duplica y se anota: no vale la
pena arriesgar la ventana que ya funciona. Su única adición real es el receptor
del espejo, que es un listener y una línea.

### 11.9. Verificación en vivo

Con las dos ventanas abiertas en el mismo navegador, una en la pantalla
extendida:

1. Flecha en `/present-admin`: las dos ventanas se mueven, y el celular ve el
   número nuevo.
2. Clic en la lámina (fuera del iframe vivo): **no pasa nada**. Es la prueba de
   que `onStageClick` está tapado.
3. Beat 14: clic dentro del formulario, se teclea, se entra. El proyector navega
   al panel al mismo tiempo, sin volver al login.
4. Con el foco dentro de la demo, flecha derecha: no cambia de diapositiva
   (comportamiento esperado, 11.4). Se pasa desde el móvil.
5. Rueda del ratón sobre `/status` (beat 16): el proyector sigue, y un "bajar"
   posterior desde el celular continúa desde donde estaba, no desde arriba.
6. Recarga de `/present-admin` a mitad de charla: vuelve a la diapositiva
   correcta y **el cronómetro sigue donde iba**.
7. Cerrar `/presentacion`, esperar 20 s: el celular sigue viendo la charla viva
   y con notas (relevo, 11.2). Volver a abrirla: `/present-admin` se calla.
8. Reiniciar el cronómetro y comprobar que arranca solo con el movimiento
   siguiente, no al instante.

### 11.10. Fuera de alcance

- **Espejo del DOM.** Solo posición, scroll y URL (11.5.3).
- **Proyección desde otra máquina.** La cookie de sesión del portal lo impide
  para la demo autenticada; la posición y el scroll seguirían funcionando.
- **Sin modo alternable de interacción.** Se activa sola en cuanto el beat trae
  un iframe, y solo sobre él. No hay tecla que recordar ni indicador que mirar.
- **Sin control del vídeo.** Si el mazo se exporta con `DEMO_MODE=video`, no hay
  iframe que descubrir, la lámina queda inerte y el espejo no tiene nada que
  decir.
