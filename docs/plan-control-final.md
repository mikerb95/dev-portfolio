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

## 11. `/present-admin`: la pantalla que sí se toca

**Estado: planeado.**

`/presentacion` monta el mazo con `pointer-events: none` a propósito: un clic
dentro movería el bundle por su cuenta y el sondeo siguiente lo devolvería de
golpe. Eso está bien para lo que se proyecta al público y **no se cambia**.

Lo que falta es una pantalla gemela desde la que se pueda **usar** la demo:
escribir en el login del portal, clicar, recorrer `/status`. Vive en
`/present-admin`, se abre a la vez que `/presentacion`, y la diferencia entera
cabe en una frase: obedece al mando igual que la otra, pero **no publica nada**
y deja pasar el ratón a la ventana viva del beat.

Supuesto explícito, porque cambia lo que ve la sala: **lo que se proyecta es
`/present-admin`**. `/presentacion` sigue abierta como pantalla del ponente y
como respaldo, pero la demo se ve en la que se toca. Nada de lo que se escriba
o clique dentro del iframe se refleja en la otra (ver 11.7).

### 11.1. Dos pantallas, un solo escritor de `actual`

Que las dos sondeen `?q=destino` y reconcilien no choca: son dos iframes
distintos convergiendo al mismo número, cada uno con sus propias capas.

Lo que sí choca es `presentacion:actual`, y en concreto el origen `ajena`. Si
`/present-admin` publicara la 5 como movimiento ajeno mientras `/presentacion`
va camino de la 7, el servidor **adoptaría** la 5 como destino y la otra daría
media vuelta. Cada pantalla arrastrando a la otra, y el número bailando en el
teléfono. Es el mismo fallo que `ajena` resuelve para el teclado del portátil,
solo que aquí el "alguien" es otra pantalla igual de legítima.

La regla es una sola:

> **`/present-admin` nunca escribe `actual`.** Es un seguidor: lee `destino`,
> mueve su propio iframe y calla.

Y su teclado local no publica una posición, publica un **destino**: el mismo
`POST { accion }` que manda `/remote`. Es un mando incrustado en la pantalla.
Con eso, una flecha pulsada en el portátil llega a las dos pantallas por el
mismo camino que el toque del pulgar, y la adopción de movimientos ajenos no
tiene que existir en este lado.

Consecuencia que vale por sí sola: **`/presentacion` no cambia ni una línea**.
El escritor único de `actual` sigue siendo el de siempre, y la carrera que la
sección 3 evita en el camino caliente sigue sin existir.

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
  quiere evitar si la otra pantalla reaparece a mitad de un viaje.

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

El descubrimiento del iframe es **por forma**, como todo aquí y como ya pide la
sección 10.4: de los `<iframe>` del mazo, el visible más grande que se solape
con el escenario. Un beat sin iframe deja la lámina entera inerte, que es
exactamente el comportamiento de hoy. Un mazo nuevo con otros iframes funciona
igual, y ninguna cifra de `final.html` entra en este código.

El estilo se **re-afirma en cada sondeo**, por la misma razón que `afirmarCapas`
existe: el bundle monta y desmonta esos iframes al cambiar de beat, y el nodo
al que se le puso `auto` puede haber dejado de estar.

Detalle que se ve en la pared: el bundle escala el iframe con `transform`
(`transform-origin: 0 0` sobre 1864x920). El hit-testing del navegador atraviesa
la transformación, así que el clic cae donde se ve. No hay que corregir
coordenadas.

### 11.4. El teclado: quién se queda cada tecla

Hay tres consumidores posibles y hay que repartirlos a mano, o dos de ellos se
pisan.

**1. La página `/present-admin`.** Flechas, espacio, `PageUp`/`PageDown`,
`Home`/`End` y dígitos para salto directo. No mueve nada por su cuenta: hace el
`POST` de destino y deja que la reconciliación de las dos pantallas haga el
resto. `preventDefault` para que la barra espaciadora no desplace la página.

**2. El bundle.** Registra `window.addEventListener('keydown', ...)` en fase de
burbuja, que es el último eslabón. Si el foco cae dentro del iframe del mazo (y
un clic lo lleva ahí), una flecha nativa movería un beat **sin pasar por el
servidor**: la pantalla pública se quedaría atrás y el mando enseñaría un número
que no es.

Se le tapa con un listener en **fase de captura** sobre el documento del bundle,
que es el reverso exacto de `disparar()`. Aquella inyecta el evento con el
constructor del iframe; esta lo intercepta antes de que el bundle lo vea. El
discriminador es `isTrusted`:

```js
// Las teclas de carne y hueso no llegan al bundle: mover un beat por fuera del
// servidor dejaría a la otra pantalla y al mando enseñando un número que no es.
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

### 11.5. Ruta, puerta y encabezados

Ruta `/present-admin` a secas, un archivo `src/pages/present-admin.astro`. El
guion en vez de la barra no es cosmético: `/present/<sessionId>` es el sistema
de decks con PIN y `/remote/<algo>` exige sesión de admin. Con un guion,
`startsWith('/present/')` e `isAdmin` no la rozan por construcción, y no hay que
añadir ninguna excepción como la que `/remote` a secas necesitó.

**Sin puerta**, por lo mismo que la sección 8 y con un argumento más: el día de
la charla, una sesión de GitHub caducada dejaría sin pantalla. Pero cambia una
cosa respecto a la original y hay que decirla en voz alta: aquí quien encuentre
la URL no solo pasa una diapositiva, puede **teclear dentro de la demo**. Lo que
hay dentro es `codebymike.tech/portal/login`, `/status` y `/engineering`, tres
páginas que ya son públicas y que ya tienen su propio rate limit: enmarcarlas no
añade superficie, solo la acerca. Si alguna vez importa, el sitio para la puerta
sigue siendo el `POST`, no la página.

`Cache-Control: no-store` y `noindex, nofollow` como la actual, y fuera de
sitemap y de cualquier enlace entrante.

### 11.6. Archivos

```
src/pages/present-admin.astro          la pantalla que se toca (nueva)
src/lib/presentacion/lienzo.ts   PURO  descubrimiento del mazo y del iframe vivo,
                                       extraído de presentacion.astro para no
                                       tener dos copias divergiendo
src/pages/api/presentacion.ts          + `?q=destino&relevo=1` (agrega solo `ts`)
src/lib/presentacion/estado.ts         + regla de relevo (rancio -> puedo publicar)
tests/presentacion-relevo.test.ts      quién publica y cuándo, sin DOM
src/data/documentacion.ts              RF-716, `planeado` -> `implementado`
docs/plan-control-final.md             esta sección, marcada al entregar
```

El único refactor de `/presentacion` que contempla el plan es **extraer** su
descubrimiento a `lienzo.ts` sin cambiar su comportamiento, para que las dos
pantallas descubran el mazo con el mismo código. Si al empezar resulta que
extraerlo obliga a tocar su reconciliación, se duplica y se anota: no vale la
pena arriesgar la pantalla que ya funciona.

### 11.7. Fuera de alcance

- **La demo no se refleja en `/presentacion`.** Lo que se escribe y se clica se
  ve en la pantalla que se toca, que es la que se proyecta. Espejar la sesión
  del iframe entre dos navegadores es otro problema entero.
- **Sin los controles de scroll del mando en esta pantalla.** Aquí hay ratón.
  El `presentacion:scroll` de la sección 10 sigue siendo cosa de la pantalla
  pública y esta ni lo lee ni lo escribe, para no pelearse con la rueda.
- **Sin modo alternable.** La interacción se activa sola en cuanto el beat trae
  un iframe, y solo sobre él. No hay tecla que recordar ni indicador que mirar.
- **Sin control del vídeo.** Si el mazo se exporta con `DEMO_MODE=video`, no hay
  iframe que descubrir y la lámina queda inerte, como hoy.
