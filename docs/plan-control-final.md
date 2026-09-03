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
| Mando | `/remote` | dos botones, rejilla de salto (o ↑/↓ del iframe), posición real y guion |
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

El bundle solo sabe contar beats. Su contador repite el mismo número en la
cita y en la portada, y el último en el cierre: cuatro diapositivas reales
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
| beats | los que su contador cuente | el bundle, por teclas |
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

## 2.3. Lo que el mazo de septiembre enseñó

El 3 de septiembre de 2026 se reemplazó `final.html` por una iteración con más
contenido, que es exactamente el caso para el que se diseñó todo esto. El
descubrimiento de la forma aguantó lo que prometía: el mazo pasó de 19 a 25
beats y ni una línea de este código tuvo que cambiar de número.

Falló en otro sitio, y las tres cosas que se rompieron comparten causa: se
había aislado el CÓDIGO del mazo, pero no la LECTURA del mazo.

- **El contador cambió de tipografía**, de `01 / 19` a `/01 · 25`. La barra
  estaba cableada en `esTextoDeContador`, así que `descubrirMazo` devolvía
  `null` para siempre y el mando no se degradaba: no arrancaba. Ahora se
  aceptan varios separadores y el punto queda fuera a propósito (`8.1` del
  dossier sería un contador válido). Ver `SEPARADORES` en `lienzo.ts`.
- **Apareció un velo de grano de película**, un div a pantalla completa con
  `z-index` y opacidad 0.035. Pasaba por capa oculta, entraba en el cierre y
  añadía una posición de más cuyo único efecto era subir el grano a opacidad 1.
  Lo delata `pointer-events: none`: una diapositiva se pulsa, un adorno se deja
  atravesar (`esVeloDecorativo`).
- **El guion quedó corrido cuatro puestos**, porque cuatro de los seis beats
  nuevos entraron por DELANTE. Las zonas protegen de que una capa nueva
  desplace los beats, pero no de un beat insertado dentro de la zona de beats.

Ese tercero es el que cambió el diseño. El guion ya no se mantiene a mano
contra un mazo que se reemplaza entero: `npm run guion:sync` lo alinea leyendo
`public/final.html` (que solo se LEE, nunca se escribe), empareja por título
-lo único estable entre iteraciones- y por tanto conserva el discurso escrito
aunque el beat cambie de número. Los beats nuevos entran con las notas que el
propio mazo trae dentro, marcados con `delMazo: true` para saber que hay que
reescribirlas. `npm run guion:check` corre en CI y falla si el guion y el mazo
se separan.

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

Pantalla: 2 sondeos/s de `?q=destino`, que no arrastra el `actual` que ella
misma escribió, más un latido cada 5 s. Mando: 1 sondeo/s solo mientras se
mira. Ese es el techo del diseño: bajarlo es subir `SONDEO_MS`, a costa de
latencia.

**Cuentas al día (3 sep 2026).** Cada `?q=destino` son **cinco** lecturas, una
por clave: `destino`, `scroll`, `espejo`, `puntero` e `inicio` (empezaron siendo
dos, ver 10.3). Con la ventana que conduce sondeando dos veces por segundo eso
es del orden de **36.000 lecturas por hora**, más lo que escriben sus reportes
(entre uno y cinco comandos cada uno, según cuántas claves traigan novedad).
Un reporte por latido son cinco cada 5 s; con el ratón moviéndose sobre la
página viva (11.12) el reporte sube a su techo de dos por segundo, y la hora de
charla se va al orden de **70.000 comandos**. Cada seguidor que sondee en vez de
escuchar el bus suma otras 36.000 lecturas por hora él solo, que es exactamente
por lo que la sala tiene que acabar en el bus y no en el sondeo (12.6, paso 3).

Las dos palancas, por si un día importa: fusionar claves (cuesta lo que explica
10.3, que cada reporte de la pantalla borre lo que acaba de pedir el pulgar) y
subir el umbral del puntero, que cambia escrituras por precisión de la flecha.

## 7. Verificado en vivo (dev, 1 sep)

Contra el `final.html` real, con el mazo de agosto de 2026 (22 posiciones:
cita, portada, 19 beats, cierre). El mazo de septiembre trae 28 (25 beats) y
el sistema lo descubrió solo, sin tocar una cifra de este código:

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
src/lib/presentacion/desplazamiento.ts PURO paso y acotado del scroll del iframe
src/data/guion-final.ts               el discurso, por zonas (aquí se edita)
src/pages/presentacion.astro          la pantalla (iframe + reconciliación)
src/pages/remote/index.astro          el mando (`/presentacion/control` redirige aquí)
src/pages/api/presentacion.ts         destino + actual + scroll, una clave por escritor
tests/presentacion-estado.test.ts     14 tests
tests/presentacion-mapa.test.ts       21 tests (incluye convergencia de todos contra todos)
tests/presentacion-guion.test.ts      11 tests (forma del mazo, zonas, huecos)
tests/presentacion-desplazamiento.test.ts  19 tests (paso, topes, vínculo con la diapositiva)
```
## 10. Desplazar el iframe de un beat desde el mando

**Estado: implementado** (1 sep 2026). Tres beats del mazo proyectan una página
viva dentro de un iframe (14 la demo del portal, 16 `/status`, 17
`/engineering`). Antes el mando pasaba diapositivas pero no podía recorrer esas
páginas: había que ir al portátil en mitad de la demo.

### 10.1. Por qué se puede

Los tres iframes apuntan a `https://codebymike.tech/...`, que en producción es
el MISMO origen que sirve `/presentacion`. La cadena entera (página → mazo →
iframe interno) es de un solo origen y se puede mover con `scrollTo` desde
fuera. `isFramablePath` ya les da `frame-ancestors 'self'`, que es lo que hace
falta para que se enmarquen; el mismo origen es lo que además permite tocarlos.

Consecuencia para el desarrollo: **en local no se puede probar tal cual**. Esas
URLs son absolutas a producción, así que desde `localhost` son de otro origen y
no se dejan tocar. Se verifica apuntando el iframe descubierto a la ruta local
equivalente, solo durante la prueba (ver 10.8). Ese apaño no sobrevive a una
recarga de la página ni a que el mazo vuelva a montar el iframe al reentrar en
su beat, así que la prueba se hace de una sentada.

### 10.2. El scroll es otra posición absoluta

No un comando relativo. Es la misma decisión que sostiene todo lo demás: un
sondeo perdido no pierde nada, tres toques seguidos valen tres porque se
acumulan sobre el destino, y el estado completo cabe en un número.

| Clave | Quién escribe | Qué es |
|---|---|---|
| `presentacion:scroll` | el mando (vía servidor) | `{ pos, y }`: el desplazamiento que se pide, y **para qué diapositiva** |
| `actual.scroll` | la pantalla | `{ y, max, alto }`: dónde está de verdad y cuánto se puede bajar |

El `pos` de la clave es lo que hace que **el iframe vuelva arriba solo** al
cambiar de diapositiva: si el `pos` guardado no es el destino actual, el
desplazamiento pedido es 0. Sin escrituras extra, sin cron de limpieza y sin
carrera - cualquier camino que cambie de diapositiva (incluida la adopción de un
movimiento ajeno desde el teclado del portátil) lo reinicia por construcción.

Con una sola ranura, esa misma regla tiene una cara que conviene saber antes de
estar delante del público: **volver a la diapositiva que se dejó desplazada la
recupera donde estaba**, porque su `pos` vuelve a coincidir y nadie borró nada
al salir. En cambio, si entremedias se desplaza OTRA diapositiva, la ranura pasa
a ser suya y la primera vuelve arriba. Es el precio de no tener una entrada por
beat, y en una demo juega a favor más veces de las que estorba.

El paso lo calcula el SERVIDOR, no el teléfono: `alto / 3` sobre la geometría
que publicó la pantalla, igual que `mover()` acota contra el techo real del
mazo. El teléfono solo dice "subir" o "bajar" y no necesita saber nada de la
página que hay dentro del iframe.

### 10.3. Coste

Cero peticiones nuevas: la pantalla ya sondea `?q=destino` dos veces por
segundo, y esa respuesta pasa a ser `{ destino, scroll }`. Un número más en un
viaje que ya se hacía; el mando publica el desplazamiento en el mismo `POST` con
el que ya manda todo lo demás.

Lo que sí sube es el **almacén**: `scroll` es una clave aparte y no cabe en la
misma lectura que el destino, así que el sondeo de la pantalla pasa de una a dos
lecturas por vuelta. Del orden de 22.000 comandos por hora de charla en vez de
15.000. Fusionarla con `destino` ahorraría eso y costaría lo que la sección 3
explica: la pantalla también escribe `destino` (para acotarlo y para adoptar un
movimiento ajeno) y cada reporte suyo borraría el scroll que el pulgar acaba de
pedir.

### 10.4. La pantalla

1. **Descubrir el iframe en juego.** Como todo aquí, por forma y no por
   identidad: de los `<iframe>` del mazo, el visible más grande que se solape
   con el escenario (al menos un 15% de él). Un mazo nuevo con otros iframes
   funciona igual.
2. **Publicar su geometría** en `actual.scroll`. Si no hay iframe, si es de otro
   origen o si no tiene nada que desplazar, se publica sin `scroll` y el mando
   sencillamente no enseña los controles. Fail-open, como el resto.
3. **Reconciliar** con `scrollTo({ behavior: 'smooth' })`, con un cierre de unos
   400 ms después de cada empujón: el sondeo va a 500 ms y la animación dura
   parecido, así que sin ese cierre el siguiente ciclo pelearía con la animación
   en curso. Y nunca mientras `aplicando` esté activo: si se está cruzando el
   mazo, el scroll espera.

Un movimiento de la página de dentro se republica como **`latido`**, no como
`ajena`: `ajena` significa "manda la realidad, adopta esta posición como
destino", y aquí no hay ninguna posición nueva que adoptar, solo geometría que
refrescar para que el mando pinte la barra y los topes.

#### Quién recorta a quién (lo que costó la depuración)

Medir el área visible de un iframe con su `getBoundingClientRect` no basta, y no
es teoría: el mazo monta las tres páginas desde el primer beat y las guarda en
cajas plegadas de 336x186 con `overflow:hidden`, que se despliegan al llegar a
su diapositiva. El rectángulo del iframe ignora ese recorte y devuelve sus
1572x776 aunque solo se asome una esquina, así que sin subir por los ancestros
los tres parecían estar en pantalla a la vez.

Y al subir hay que respetar la regla de CSS: un `overflow:hidden` solo recorta a
los descendientes de los que es **bloque contenedor**. El mazo cuelga su
escenario de un `position:fixed` y deja `<body>` y `<html>` con altura CERO y
`overflow:hidden`. Recortando contra todo ancestro, esas dos cajas vacías daban
área 0 y el iframe no se descubría nunca. Por eso un ancestro estático no
recorta a un descendiente absoluto, y por encima de un `fixed` ya no recorta
nadie.

### 10.5. El mando

Los controles **sustituyen a la rejilla de saltos** mientras la diapositiva
tenga algo que desplazar, y la rejilla vuelve sola al salir. Es el sitio que
menos se usa en mitad de una demo y no empuja el guion.

- Dos botones grandes, ↑ y ↓, uno al lado del otro.
- **Mantener pulsado repite**: el primer empujón sale en el `pointerdown` (no al
  soltar: el retardo del `click` se nota cuando se está mirando la proyección) y
  luego se repite cada ~350 ms mientras el dedo siga puesto. Un empujón en vuelo
  a la vez, o con la red lenta la página seguiría bajando después de levantar el
  dedo.
- Cada empujón es **un tercio de la altura visible**, animado.
- Se apagan en los topes, comparando contra lo PEDIDO y acotando contra el
  máximo REAL - misma regla que "Siguiente" con el total del mazo. Mirar la
  posición real dejaría el botón encendido en el fondo de la página, porque
  llega hasta dos segundos tarde.
- Una barra fina de 2 px marca por dónde va la página dentro del iframe. Esa sí
  enseña la posición REAL: es la referencia de lo que está viendo el público.

**Recorrido mínimo de 32 px para que la diapositiva cuente como desplazable.**
No es un umbral de gusto: la demo del portal publica `max: 10` porque su login
cabe entero y esos diez píxeles son el redondeo de un iframe escalado. Con el
listón en un píxel, esa diapositiva sacaría dos botones que mueven la proyección
un pelo, que delante del público se lee como un mando roto.

### 10.6. Archivos

```
src/lib/presentacion/desplazamiento.ts   PURO  paso, acotado y vínculo con la diapositiva
src/lib/presentacion/estado.ts           + `scroll` en `Actual` (opcional, se descarta si no cuadra)
src/pages/api/presentacion.ts            + acciones subir/bajar, + `scroll` en `?q=destino`
src/pages/presentacion.astro             descubrir el iframe, publicar geometría, reconciliar
src/pages/remote/index.astro             botones ↑/↓ con repetición, en lugar de la rejilla
tests/presentacion-desplazamiento.test.ts  19 tests
tests/presentacion-estado.test.ts          + 2 tests (geometría en `Actual`)
src/data/documentacion.ts                RF-715
```

### 10.7. Fuera de alcance

- **Sin clics dentro del iframe.** Solo desplazamiento. El modelo de posición
  absoluta admitiría después un clic por coordenadas, pero un clic no es
  idempotente y no se acumula: es otro problema.
- **Sin scroll horizontal.** Ninguna de las tres páginas lo necesita.
- **Sin control del vídeo.** Si el mazo se exporta con `DEMO_MODE=video`, no hay
  nada que desplazar y los controles no aparecen; pausar o rebobinar sería otra
  cosa distinta.

### 10.8. Verificado en vivo (dev, 1 sep)

Contra el `final.html` real, con los tres iframes reapuntados a las rutas
locales equivalentes (ver 10.1):

- en el beat 16 (`/status`, posición global 18) se descubre el iframe y se
  publica su geometría sola: `{ y: 0, max: 2130, alto: 920 }`, sin nada
  cableado;
- tres toques de ↓ seguidos suman los tres (0 → 307 → 614 → 921) y la
  proyección los sigue hasta `y = 921`;
- el tope de abajo aguanta el martilleo: seis toques más dejan el pedido y la
  página en 2130, que es el máximo real, y el botón se apaga en vez de mentir;
- ↑ vuelve un tercio por toque (2130 → 1823 → 1516);
- cambiar de diapositiva devuelve el desplazamiento pedido a 0 en el mismo
  `POST`, sin escribir nada;
- el beat 17 (`/engineering`) descubre SU iframe, con otro máximo (702): el
  descubrimiento es por diapositiva, no una vez por carga;
- el beat 14 (la demo del portal) publica `max: 10` -su login cabe entero- y por
  eso no saca controles;
- en una diapositiva sin iframe (la 5) la geometría desaparece del `actual` y la
  rejilla de saltos vuelve sola.

## 11. `/present-admin`: el mando con lienzo, y el público como público

**Estado: entregada la ventana que conduce; la sala sigue detrás de su
compuerta.** Hecho: los tres módulos puros, `lienzo.ts`, el lado servidor
COMPLETO (lectura y escritura, incluido el scroll absoluto de la rueda), la
línea del middleware, `src/pages/present-admin.astro` con sus seis capas
(§12.5 a-f), el runbook y RF-717 en `documentacion.ts`.

Falta el **paso 3** (§12.6): que `/presentacion` deje de publicar y pase a
seguidor puro por el bus. Está detrás del **paso 0** (§12.3), que es una
compuerta de diseño y no una verificación: medir `final.html` en un teléfono de
gama baja. Si ahí no va fluido, el paso 3 entero se cae y no hay que
construirlo. Mientras tanto `/presentacion` se queda como está - lo que impone
el orden de §12.2: **no se abren `/present-admin` y `/presentacion` a la vez**,
serían dos escritores de la misma clave.

Falta también la vuelta en vivo de §11.9, que no se puede cerrar desde el
portátil solo.

Hasta aquí el sistema tenía una sola pantalla. Esta sección la desdobla en dos
papeles que hoy están mezclados en `/presentacion`: quien **conduce** el mazo y
quien lo **mira**.

| Ventana | Dónde | Cuántas | Papel |
|---|---|---|---|
| `/present-admin` | portátil del ponente | 1 | conduce: descubre el mazo, lo toca, publica dónde va |
| `/remote` | celular del ponente | 1 | manda: pasa diapositivas y enseña el guion |
| `/presentacion` | equipo de cada asistente | N | mira: obedece y no dice nada |

El motivo de que exista `/present-admin` es que la demo hay que **usarla**:
escribir en el login del portal, clicar, navegar. `/remote` no puede, y
`/presentacion` tiene el lienzo deliberadamente inerte.

### 11.1. La inversión: quién es ahora la pantalla

`/presentacion` no es hoy un espectador. Es **el escritor** de `presentacion:actual`,
y con origen `ajena` el servidor **adopta** lo que publique como destino
(sección 4). Esa fila existe para que la flecha pulsada en el portátil mande
sobre el mando, y es correcta mientras haya una sola pantalla.

Con el público encima deja de serlo, y no porque nadie toque nada: es
automático. Un asistente bloquea el teléfono, el navegador congela los
temporizadores y las transiciones (nota 6), lo desbloquea, su copia lee una
posición atrasada y la publica como `ajena`. El servidor la adopta y **la sala
entera y el ponente viajan hacia atrás**. Treinta espectadores son treinta
copias con derecho a voto.

La corrección es quitarles la voz, y al hacerlo el papel de pantalla queda
vacante. Lo recoge quien ya lo tiene todo para ejercerlo:

> **`/present-admin` es la pantalla del sistema.** Descubre el mazo, publica
> `actual` y obedece `destino`. `/presentacion` pasa a ser un seguidor puro:
> lee, mueve su propia copia y **no hace un solo `POST`**.

La disciplina de la sección 3 se conserva intacta: sigue habiendo **un escritor
por clave**, solo que el de `actual` cambia de ventana. Y sigue habiendo un solo
sitio que sabe la forma del mazo, que es lo que el mando necesita para acotar el
destino y para sacar la nota del guion.

Cada seguidor descubre su propio mazo en su propio navegador (todos cargan el
mismo `final.html`) y se mueve solo con el número. No necesita el `actual` de
nadie: le basta el destino.

### 11.2. Que la sala no tumbe el sitio

`/api/presentacion` cuenta para el paraguas por IP, y el límite es **600
peticiones por minuto** (`src/middleware.ts:337`), con freno progresivo desde el
80%. Una copia de `/presentacion` gasta hoy 120 lecturas/min (sondeo de 500 ms)
más 12 escrituras/min de latido.

Si la sala está en el WiFi del salón comparten una IP pública. **A partir del
cuarto asistente empieza el freno y del quinto el bloqueo**: el middleware
defendiendo el sitio de la propia audiencia, con el peor síntoma posible (media
sala clavada en una diapositiva y sin nada que lo explique). Contra Upstash,
treinta asistentes serían ~216.000 lecturas/hora cuando la sección 6 daba 15.000
como el techo del diseño.

Se arregla con la infraestructura que ya existe y que se construyó exactamente
para esto. `src/lib/present/client-sync.ts` abre un `EventSource` **contra
Upstash directamente**, no contra nosotros, con un token de solo lectura, y su
comentario de cabecera dice el porqué: "si cada espectador abriera un SSE contra
una función de Vercel, tendríamos una invocación viva por persona". Un seguidor
por ese canal **no toca Vercel ni una vez** después de cargar la página, así que
no roza el rate limit ni suma coste por asistente.

Se reusan sus tres capas tal cual, que no son opcionales (el pub/sub no
garantiza entrega):

1. **Bus**, la vía normal, decenas de ms.
2. **Resincronía** cada 10 s, que cura un mensaje perdido.
3. **Rescate por sondeo** si el bus no conecta. Aquí sí a **3 s y solo lectura**,
   no a 500 ms: es el modo degradado de treinta teléfonos a la vez, y a ese
   ritmo la sala entera cabe holgada bajo los 600/min de la IP compartida.

Quien publica al bus es `/present-admin`, en el mismo momento en que ya escribe
`actual`. El mensaje lleva el destino, el desplazamiento y la URL del iframe
(11.5): es un solo mensaje para las tres cosas.

### 11.3. La interacción: `pointer-events` por dentro, no por fuera

Quitarle el `pointer-events: none` al `<iframe>` devuelve un fallo entero: el
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

Esto es **solo de `/present-admin`**. `/presentacion` conserva su
`pointer-events: none` de siempre, que ahora tiene un motivo más: es lo que
garantiza que un asistente no mueva su propia copia por su cuenta y se quede
desincronizado del resto sin entender por qué.

El descubrimiento del iframe es **por forma**, como todo aquí: el visible más
grande que se solape con el escenario. Es el mismo que la sección 10 ya descubre
para desplazarlo, así que se reutiliza. Un beat sin iframe deja la lámina entera
inerte.

El estilo se **re-afirma en cada sondeo**, por la misma razón que `afirmarCapas`
existe: el bundle monta y desmonta esos iframes al cambiar de beat.

Detalle que se ve en la pared: el bundle escala el iframe con `transform`
(`transform-origin: 0 0` sobre 1864x920). El hit-testing del navegador atraviesa
la transformación, así que el clic cae donde se ve. No hay que corregir
coordenadas.

### 11.4. El teclado: quién se queda cada tecla

Tres consumidores posibles en `/present-admin`, y hay que repartirlos a mano o
dos se pisan.

**1. La página.** Flechas, espacio, `PageUp`/`PageDown`, `Home`/`End` y dígitos
para salto directo. No mueve nada por su cuenta: hace el `POST` de destino, igual
que el pulgar, y deja que la reconciliación haga el resto. `preventDefault` para
que la barra espaciadora no desplace la página.

**2. El bundle.** Registra `window.addEventListener('keydown', ...)` en fase de
burbuja, que es el último eslabón. Si el foco cae dentro del iframe del mazo (y
un clic lo lleva ahí), una flecha nativa movería un beat **sin pasar por el
servidor**: la sala entera se quedaría atrás y el mando enseñaría un número que
no es.

Se le tapa con un listener en **fase de captura** sobre el documento del bundle,
que es el reverso exacto de `disparar()`. Aquella inyecta el evento con el
constructor del iframe; esta lo intercepta antes de que el bundle lo vea. El
discriminador es `isTrusted`:

```js
// Las teclas de carne y hueso no llegan al bundle: mover un beat por fuera del
// servidor dejaría a la sala y al mando enseñando un número que no es. Las
// sintéticas -las que dispara la reconciliación- sí pasan: son la única forma
// que tiene esta página de mover el mazo.
d.addEventListener('keydown', (e) => {
  if (e.isTrusted) { e.stopPropagation(); e.preventDefault() }
}, true)
```

**3. La página viva dentro del beat.** Sus teclas nacen en otro documento y no
suben ni al bundle ni a nosotros, así que escribir en el login del portal
funciona sin hacer nada.

**Corregido el 3 sep 2026: tapar no basta, hay que ENRUTAR.** Tal como estaba
escrito arriba, el listener de captura se comía la tecla y ahí terminaba todo:
un `keydown` nacido dentro de un iframe no propaga al documento padre, así que
el listener de la página que haría el `POST` no llegaba a ejecutarse. La flecha
no es que moviera un beat por fuera del servidor, es que **no hacía nada, y sin
ningún rastro**. Y se llegaba ahí clicando dentro de la demo viva, que es justo
lo que 11.3 quiere que se pueda hacer: en el momento en que se acaba de tocar la
demo y toca seguir.

El mismo listener que intercepta la tecla la manda ahora por `mandar()`, que es
la regla de esta sección aplicada entera: **un solo camino por el que se mueve la
presentación**, esté el foco donde esté. Con dos cuidados:

- Se engancha **también al documento de la página viva**, junto a
  `engancharRueda` y `engancharPuntero`, que ya resuelven ese mismo problema
  para la rueda y el ratón (con la misma marca `__enganchado` para no apilar un
  listener por sondeo). El listener del bundle vive un nivel más arriba y el
  evento de un iframe anidado tampoco sube hasta ahí.
- Se salta `input`, `textarea`, `select` y `[contenteditable]`: `/portal/login`
  es uno de los `ATAJOS` del panel, y una flecha dentro de un campo de texto es
  del campo.

### 11.5. El espejo: que la sala vea lo que tocas

Tres cosas, y solo una es trabajo nuevo:

| Qué | Cómo llega a la sala | Estado |
|---|---|---|
| la diapositiva | `presentacion:destino`, que ya escribe como mando | hecho |
| el desplazamiento del beat | `presentacion:scroll`, sección 10 | hecho, falta que lo escriba la rueda |
| la URL del iframe vivo | `presentacion:espejo`, 11.5.2 | nuevo |
| tecleo y clics sin cambio de URL | no llega, 11.5.3 | fuera de alcance |

#### 11.5.1. El login del portal se resuelve solo

El beat de la demo enmarca `codebymike.tech/portal/login`, y una sesión de
verdad sería intransferible: la sala vería el formulario vacío mientras el
ponente enseña el panel.

**Se entra por la demo pública**, y con eso el problema desaparece entero.
`/api/portal/demo` es un `GET` normal desde un `<a>`, sin login, que siempre
entra como el mismo usuario de mentira contra la base de demo. No hay sesión que
espejar: quien abra esa dirección ve **la misma pantalla con los mismos datos**,
sea el ponente o cualquiera de la sala. Basta con que la URL viaje.

Consecuencia operativa para el runbook: en ese beat se entra **siempre** por el
enlace de demo, nunca con credenciales reales. Un login real dejaría a la sala
mirando un formulario.

#### 11.5.2. La URL, por el servidor

Clave `presentacion:espejo`, escrita por `/present-admin` cuando la URL del
iframe vivo cambia, y leída por los seguidores en el mismo mensaje del bus.

- Lleva `{ pos, href, seq }`. El `pos` vincula la URL a **su** diapositiva, con
  la misma idea que hace que el scroll vuelva arriba solo al cambiar de beat
  (sección 10.2): una URL de otra diapositiva no se aplica.
- `seq` monótono: un mensaje que llegue tarde se descarta en vez de deshacer una
  navegación buena.
- El seguidor navega su iframe con `location.replace()` y no con `src`, para no
  llenar de historial una ventana que nadie va a navegar hacia atrás.
- **Nunca contra la navegación guionizada del propio bundle.** El mazo ya mueve
  ese iframe por su cuenta (`this.frame.src = new URL(p.nav, DEMO_SRC).href`)
  como parte de la coreografía de algunos beats. El espejo solo actúa si el
  `href` recibido difiere del que ya hay, y espera a que el beat se asiente
  (`PASO_MS`). Si no, el espejo y la coreografía se pelearían por el mismo
  iframe en el peor momento.

#### 11.5.3. La rueda escribe donde escribe el pulgar

Si la rueda del ratón desplazara el iframe en `/present-admin` sin escribirlo,
pasarían dos cosas malas: la sala no seguiría, y un "bajar" posterior desde el
celular daría un salto, porque el servidor cree que la página sigue arriba.

Así que `/present-admin` publica su desplazamiento en `presentacion:scroll`. Son
dos escritores con el mando, y aquí se acepta: esta ventana **es** un mando, la
ventana de carrera es de milisegundos y el peor caso es un salto de scroll, no
un botón que no hace nada. La regla de la sección 3 se guarda para lo que de
verdad se pulsa a ciegas.

Con un acotado: se escribe **cuando el valor cambia y como mucho dos veces por
segundo**. Una rueda sin acotar son cincuenta escrituras por gesto.

#### 11.5.4. Lo que no llega a la sala, y por qué está bien

Tecleo carácter a carácter, clics que solo cambian estado de cliente (una
pestaña, un desplegable), foco. Reflejarlo es duplicar el DOM entre N
navegadores, y ese es otro problema entero.

En la práctica no se echa de menos: lo que la sala necesita ver es el
**resultado**, y todo resultado en estas páginas pasa por una navegación. Se
teclea con la sala viendo el formulario vacío, se pulsa entrar, y todas las
pantallas enseñan el panel a la vez.

### 11.6. El cronómetro

Una isla flotante en la parte superior de `/present-admin` con el tiempo que
lleva la sustentación. Como esa ventana **solo la ve el ponente**, el reloj no
llega a nadie más y no hace falta ni ocultarlo ni excluirlo del espejo.

#### 11.6.1. El arranque vive en el servidor

Por lo mismo que todo lo demás: una recarga a mitad de charla es un escenario
contemplado (sección 4, origen `inicial`), y un cronómetro que se pone a cero
justo ahí sería peor que no tenerlo.

- Clave `presentacion:inicio`, epoch en ms, mismo TTL de 6 h.
- **La escribe el servidor**, dentro del `POST` que mueve el destino, la primera
  vez que el destino sale de `POS_INICIAL` y la clave no existe. Sin escritor
  nuevo, sin viaje nuevo y sin un gesto más que recordar con la sala esperando:
  el primer toque para salir de la cita arranca el reloj.
- **Se lee de gorra** en `?q=destino`, que pasa a devolver
  `{ destino, scroll, espejo, inicio, ahora }`. Números más en un viaje que ya se
  hacía, que es la misma decisión de la sección 10.3.
- La isla cuenta en local con un tick de 1 s. No depende del sondeo: si Upstash
  se cae a mitad de charla, el reloj sigue.
- No viaja al bus: a la sala no le importa.

#### 11.6.2. El desfase de reloj, que no es teórico

`inicio` lo pone el reloj del servidor y la cuenta la hace el reloj del
portátil. Si el portátil va dos minutos adelantado, el cronómetro arranca en
`02:00`, y es el tipo de fallo que no se nota ensayando y sí en vivo. Se corrige
con el `ahora` que viene en la misma respuesta: de su diferencia con el
`Date.now()` local sale el desfase que se aplica a la cuenta.

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
por delante justo la barra de navegación del portal durante la demo.

Por tanto: **`pointer-events: none` en el contenedor de la isla**, y `auto` solo
en el cronómetro, que es lo único que se pulsa. Es la misma regla que gobierna
11.3, aplicada a nuestra propia UI. Es también lo que obliga a que el reloj se
mantenga **estrecho** por mucho que crezca de alto: cada píxel suyo es un píxel
que la demo pierde.

Lo demás: cifras tabulares (`font-variant-numeric: tabular-nums`) para que no
bailen de ancho al pasar de `9` a `10`, y `mm:ss` hasta la hora, `h:mm:ss`
después.

**Forma (corregida el 2 sep 2026).** Nació como un pastillero flotante de 13 px
al 35% de opacidad, con el argumento de que era un dato de apoyo y no el
protagonista. Ensayando de pie no se leía: a la distancia a la que está el
portátil cuando se habla, un dato que hay que acercarse a mirar es un dato que
no se mira. Pasa a ser un **notch** colgado del borde superior, sin esquinas de
arriba, con las cifras en rojo de cronómetro (2,3 rem) y un halo que lo despega
de las láminas claras. El estado de confirmación baja a 16 px porque la pregunta
no cabe en el cuerpo del reloj, y en rojo grande parecería una alarma en vez de
una pregunta. El mismo rojo lo lleva el reloj de la barra del panel (11.11), que
es el mismo dato en el otro estado.

Sin fuente de siete segmentos: habría que alojarla (la CSP sirve
`font-src 'self'`, ver `src/styles/sustentacion-fuentes.css`) y son kilobytes
nuevos en el camino de una presentación por un guiño tipográfico. La
monoespaciada del sistema en rojo, con cifras tabulares, ya lee como un
cronómetro.

#### 11.6.4 bis. Y en el mando (3 sep 2026) ✅

El reloj vivía **solo** en la isla del portátil, que es la pantalla que no se
está mirando mientras se habla de pie. El celular, que es lo que se tiene en la
mano, era el único de los tres que no sabía qué hora era.

Se corrige sin estado nuevo: el `GET` sin `q` (el que sondea `/remote` una vez
por segundo) pasa a devolver `inicio` y `ahora`, que ya existían y ya viajaban en
las otras ramas. La cuenta la hace el mismo módulo puro, con el mismo tick propio
de un segundo para que el reloj siga con el teléfono sin red. Va en la cabecera,
a la derecha del estado del enlace, y lleva pegado el desvío contra el guion
(`ritmo`, 11.6.5) porque el mando ya tiene el mazo publicado delante.

#### 11.6.5. Ritmo contra el guion ✅ (entregado en 11.11)

`GUION_BEATS` ya trae la duración estimada de cada diapositiva (sección 2.2).
Sumarla da un presupuesto, y contra el tiempo real sale un "vas 2 min por
delante", que es más útil que el número desnudo. Se dejó fuera del plan
original porque era cero estado nuevo sobre datos que ya existían y convenía
ver antes si el reloj a secas bastaba. No bastaba, y entró con el panel: 11.11.

### 11.7. Ruta, puerta y encabezados

Ruta `/present-admin` a secas, un archivo `src/pages/present-admin.astro`. El
guion en vez de la barra no es cosmético: `/present/<sessionId>` es el sistema
de decks con PIN y `/remote/<algo>` exige sesión de admin. Con un guion,
`startsWith('/present/')` e `isAdmin` no la rozan por construcción, y no hay que
añadir ninguna excepción como la que `/remote` a secas necesitó.

`/presentacion` sí necesita un cambio en el middleware: pasa a ser una vista
que abre la sala entera, así que entra en `isPresentView` para que su CSP abra
`connect-src` al origen del bus. Sin eso el `EventSource` se bloquea y los
treinta teléfonos caen al rescate por sondeo, con el único rastro de un aviso en
la consola de cada uno.

**Sin puerta**, por lo mismo que la sección 8 y con un argumento más: el día de
la charla, una sesión de GitHub caducada dejaría sin mando. Pero cambia una cosa
respecto a la original y hay que decirla en voz alta: aquí quien encuentre la URL
no solo pasa una diapositiva, puede **teclear dentro de la demo**. Lo que hay
dentro es la demo pública del portal, `/status` y `/engineering`: tres cosas que
ya son públicas y con su propio rate limit. Enmarcarlas no añade superficie,
solo la acerca. Si alguna vez importa, el sitio para la puerta sigue siendo el
`POST`, no la página.

`Cache-Control: no-store` y `noindex, nofollow` en las dos, y fuera de sitemap.

### 11.8. Archivos

```
src/pages/present-admin.astro           el mando con lienzo (nuevo)
src/pages/presentacion.astro            deja de publicar; se engancha al bus
src/lib/presentacion/lienzo.ts    PURO  descubrimiento del mazo y del iframe vivo,
                                        compartido por las dos ventanas
src/lib/presentacion/espejo.ts    PURO  forma del mensaje, `seq`, vínculo con la
                                        diapositiva, cuándo se aplica y cuándo no
src/lib/presentacion/cronometro.ts PURO desfase de reloj, formato, arranque
src/pages/api/presentacion.ts           + `espejo`, `inicio` y `ahora` en `?q=destino`
                                        + `accion: 'reiniciar-cronometro'`
                                        + publicación al bus en cada cambio
src/lib/present/client-sync.ts          reuso para el canal de la sala
src/middleware.ts                       `/presentacion` entra en `isPresentView`
tests/presentacion-lienzo.test.ts       zonas, quién recorta a quién, geometría
tests/presentacion-espejo.test.ts       orden por `seq`, diapositiva ajena, sin canal
tests/presentacion-cronometro.test.ts   desfase, formato, arranque idempotente
tests/presentacion-endpoint.test.ts     la costura: reglas puras contra el almacén
src/data/documentacion.ts               RF-717 (el 716 ya estaba cogido)
docs/runbook-sustentacion.md            montaje real y la regla del login de demo
docs/plan-control-final.md              esta sección, marcada al entregar
```

### 11.9. Verificación en vivo

Con `/present-admin` en el portátil, `/remote` en el móvil y `/presentacion`
abierta en **dos equipos distintos**, uno de ellos un teléfono:

1. Flecha en el portátil: se mueven las tres pantallas, y el móvil ve el número.
2. Clic en la lámina, fuera del iframe vivo: **no pasa nada**. Es la prueba de
   que `onStageClick` está tapado.
3. Beat de la demo: se entra por el enlace de demo pública, se navega el panel.
   Los dos equipos de prueba navegan igual, sin ver el formulario de login.
4. Con el foco dentro de la demo, flecha derecha: no cambia de diapositiva
   (esperado, 11.4). Se pasa desde el móvil.
5. Rueda del ratón sobre `/status`: la sala sigue, y un "bajar" posterior desde
   el celular continúa desde donde estaba.
6. **Bloquear el teléfono espectador dos minutos y desbloquearlo**: se pone al
   día y **no arrastra a nadie**. Es la prueba de 11.1 y la que justifica la
   sección entera.
7. Recarga de `/present-admin` a mitad de charla: vuelve a la diapositiva
   correcta y el cronómetro sigue donde iba.
8. Reiniciar el cronómetro: arranca con el movimiento siguiente, no al instante.
9. Cortar el bus (token vacío en local): los seguidores caen al sondeo de 3 s y
   la charla sigue, más lenta pero entera.
10. Medir el bundle en un teléfono de gama baja. `final.html` es 1 MB con canvas
    animados: si ahí no va fluido, la opción de la sala se cae y hay que
    replantearla, no maquillarla.

### 11.10. Fuera de alcance

- **Espejo del DOM.** Solo diapositiva, scroll y URL (11.5.4).
- **Login real en la demo del portal.** Se entra por la demo pública o la sala
  se queda mirando un formulario (11.5.1).
- **Sin modo alternable de interacción.** Se activa sola en cuanto el beat trae
  un iframe, y solo sobre él. No hay tecla que recordar.
- **Sin control del vídeo.** Si el mazo se exporta con `DEMO_MODE=video`, no hay
  iframe que descubrir, la lámina queda inerte y el espejo no tiene nada que
  decir.
- **La sala es prescindible por diseño.** Si el bus no conecta, si el WiFi del
  salón se cae o si los teléfonos no aguantan el bundle, el ponente sigue con su
  portátil y su móvil sin enterarse. Ninguna ruta del camino caliente depende de
  que haya alguien mirando.

### 11.11. El panel del ponente (2 sep 2026) ✅

El cronómetro fue el primer instrumento que se metió en esta ventana; el panel
es el resto. Lo que resuelve es concreto: hasta aquí, el guion, la rejilla de
saltos y el estado del enlace solo existían en `/remote`, es decir, en el
celular. Conduciendo desde el portátil había que mirar dos pantallas.

**No hay estado nuevo, ni clave nueva, ni escritor nuevo.** Todo lo que el panel
enseña ya viajaba, y todos sus botones pasan por el mismo `POST` que hace el
pulgar. Es una vista.

#### 11.11.1. Por qué empuja en vez de superponerse

`final.html` encaja su escenario con `scale(min(w/1920, h/1080))` y lo rehace en
cada `resize` de **su** ventana, que es el iframe. Así que quitarle altura al
iframe no tapa nada: el mazo se re-encaja solo, entero y más pequeño.

Un panel superpuesto, en cambio, se comería justo la franja de abajo, que es
donde el bundle pinta su contador y donde el portal pone su navegación durante
la demo. Es el mismo error que 11.6.4 evita en la isla, un tamaño más grande.

Dos consecuencias que no son evidentes y sí importan:

- **La sala no ve nada de esto.** Los seguidores pintan su propia copia del
  mazo; lo que viaja es la posición y la URL. El panel no entra en el espejo
  porque el espejo no es un espejo de píxeles (11.5.4).
- **La geometría de scroll no cambia.** El iframe vivo está dentro del escenario
  de 1920 con píxeles fijos: al encoger el marco cambia su escala visual, nunca
  la `y` ni el `max` que se publican. Abrir el panel no mueve la página de la
  sala.

Y una tercera que se comprobó antes de escribirlo, porque habría tumbado la
idea: `iframeEnJuego` elige el iframe vivo por cobertura mínima del 15% de la
ventana del mazo (11.5). Encoger el marco encoge las dos cosas a la vez y la
proporción se sostiene con holgura, así que el panel abierto no deja al mando
sin controles de desplazamiento.

#### 11.11.2. Tres estados, no dos

`oculto` (el mazo a pantalla completa), `barra` (una franja de 52 px con reloj,
posición, título y estado) y `consola` (guion, ritmo, rejilla e instrumentos).
Se cicla con **P** y se guarda en `localStorage`.

Que un valor corrupto caiga en `consola` y no en `oculto` es deliberado: una
recarga a mitad de charla es un escenario contemplado (origen `inicial`), y
recuperar el panel es una tecla mientras que descubrir que se perdió es mirar
una pantalla vacía delante del jurado.

**P no colisiona con nada**, y merece decirse porque parece que sí: el mazo usa
esa misma tecla para su ventana de presentador. No llega a usarla nunca, porque
11.4 le tapa el teclado entero; y lo que se teclea dentro de la demo no sale del
iframe, así que tampoco puede disparar el panel por accidente.

El tirador cabalga el borde superior del panel y sube con él. Va **fuera** del
elemento que anima: el `overflow:hidden` que hace posible la transición de
altura lo recortaría justo cuando el panel mide cero, que es cuando hace falta
verlo. Asomarse cuesta un cuarto de segundo de espera sobre el tirador, porque
el cursor cruza esa franja cada vez que se clica algo abajo en la demo, y un
panel que asoma solo delante del público es peor que no tenerlo.

#### 11.11.3. Qué enseña

- **Guion** (`notaDeGlobal`, los mismos datos que `/remote`), con el título de
  la siguiente. Va con el **destino** y no con la posición confirmada, por lo
  mismo que en 10.3: el destino es lo que se va a decir, y durante los dos
  segundos de un viaje largo lo que hay que estar leyendo es la diapositiva a la
  que se va. Los rótulos de la barra van también con el destino, o la barra y el
  guion se contradicen en ese hueco.
- **Ritmo** (11.6.5): transcurrido contra la suma de `dur` de lo ya recorrido,
  con tolerancia de un minuto. Un tramo sin ninguna estimación **no** produce
  desvío: calcularlo contra cero diría "vas 8 minutos largo" en el minuto ocho
  de una charla que va perfecta, que es justo el aviso que hace acelerar a quien
  no debía.
- **Rejilla de saltos** sobre la forma descubierta, no sobre la longitud del
  guion: un beat nuevo sin notas escritas tiene que seguir siendo alcanzable.
- **Salud del enlace**: `sin-mazo` antes que `sin-red`, porque culpar a la red
  de un bundle sin descubrir manda a mirar el WiFi cuando lo que hay que hacer
  es recargar el lienzo.
- **Página viva**: la URL del espejo y cuatro atajos (demo del portal, login,
  `/status`, `/engineering`) que navegan el iframe, resueltos contra la URL viva
  y no contra el origen de esta ventana - en local el mazo enmarca producción.
  Más los `↑/↓` de 11.5.3, que es la misma vía del pulgar.
- **Rescate**: republicar, reiniciar el reloj y recargar el lienzo, los tres con
  la confirmación de dos toques de 11.6.3 y por la misma razón.

"Republicar" no fuerza ningún `POST` a mano: olvida lo último publicado, y el
sondeo siguiente lo reporta entero con origen `inicial`, que es el que **no**
adopta la posición como destino. Refresca la marca de tiempo y la forma del mazo
sin robarle el viaje al mando.

#### 11.11.4. Dos detalles que costaron una vuelta

**El CSS va `is:global`.** Astro escopa por atributo los elementos que ve en la
plantilla, y media consola (la rejilla, los atajos, las líneas del guion) la
construye el script cuando la pantalla ya dijo cuántas diapositivas hay. Con el
escopado por defecto esos nodos salían con el estilo por defecto del navegador.

**El espacio y el enter son del botón que tenga el foco.** El teclado de esta
ventana convierte el espacio en "siguiente"; sin excluir el panel, pulsar
espacio después de clicar un salto avanzaba además una diapositiva que nadie
había pedido.

#### 11.11.5. Archivos

```
src/lib/presentacion/panel.ts        modos, índice, ritmo y salud (puro, nuevo)
tests/presentacion-panel.test.ts     25 casos (nuevo)
src/pages/present-admin.astro        la vista y el cableado
```

Lo que **no** está verificado: el panel se probó en el navegador contra el mazo
real, pero con el iframe vivo de otro origen (en local esas URLs apuntan a
producción). El bloque de página viva se comprobó de forma, no de
funcionamiento: la navegación por atajo y los `↑/↓` con geometría real solo se
pueden cerrar desde producción.

### 11.12. El puntero: que la sala vea qué señalas (2 sep 2026) ✅

El espejo lleva la URL, así que la sala ve la misma página. Lo que no veía era
el **ratón**: el ponente pasa por encima de una fila de la tabla de facturas,
esa fila se ilumina en su portátil, y en los equipos de la sala no pasa nada. Se
habla de "esta fila" y cada quien mira la suya, que delante de un jurado es peor
que no señalar.

Esto NO es el espejo del DOM que 11.10 deja fuera, y la diferencia es lo que lo
hace barato: no viaja un árbol, viaja **una ruta**.

#### 11.12.1. Lo que viaja

Clave `presentacion:puntero`, escrita por `/present-admin` en el mismo `POST`
con el que ya publica su posición. Mismo escritor, misma vía, sin clave nueva en
el camino caliente:

```
{ pos, seq, objetivo: { ruta: [1,3,0,5], tag: 'tr', fx: 0.4, fy: 0.6 } | null }
```

- **`ruta`** son índices de hijo ELEMENTO desde `documentElement`. El seguidor la
  resuelve en SU copia de la misma página. Es independiente de la resolución: un
  proyector 4:3 y un portátil 16:9 no comparten el píxel (240, 512), pero sí
  comparten la fila tercera.
- **`tag`** es el sello. Si no cuadra con lo que hay en esa ruta, no se pinta
  nada: el seguidor está en otra página o en otra versión del bundle.
- **`fx`/`fy`** es dónde cae el puntero dentro de la caja del elemento, de 0 a 1,
  que es lo que permite dibujar la flecha en el punto equivalente.
- **`objetivo: null`** no es un mensaje vacío: es "el ratón salió de la página" y
  es lo único que apaga el cursor. Sin él, la última fila que se rozó se quedaría
  encendida el resto del beat.
- **`pos` y `seq`**, con las dos reglas del espejo: atado a SU diapositiva
  (cambiar de beat apaga el cursor sin escribir nada) y monótono (un mensaje que
  llegue tarde se descarta en vez de devolver el cursor medio segundo atrás).

#### 11.12.2. El `:hover` no se puede falsificar, pero sus reglas sí se duplican

`:hover` lo decide el navegador por dónde está el ratón **de verdad**: un
`mouseover` sintético no lo mueve. Y disparar eventos de ratón en la página del
seguidor sería peor que inútil, porque abriría sus menús y sus tooltips en cada
equipo de la sala.

Lo que sí se puede es leer las hojas de estilo del documento y, por cada regla
que use `:hover`, escribir su **gemela** con `[data-puntero]`. Marcar el elemento
señalado y sus ancestros con ese atributo enciende exactamente el mismo estilo.
Dos recortes del regex que valen una regla rota cada uno, y las dos roturas
estaban en la página que se enseña:

- `(?<!\\)`: el `:hover` **escapado** de un nombre de clase de Tailwind
  (`.md\:hover\:bg-x`) no es una pseudoclase. Sustituirlo ahí no da una regla de
  más, da una regla rota.
- `(?![\w-])`: un `:hover-intent` de terceros no es `:hover`.

Y el anidamiento nativo hay que resolverlo, no ignorarlo: Tailwind 4 no emite
`.hover\:underline:hover{...}` sino `.hover\:underline{&:hover{...}}`. Sin
resolver el `&` se perdía el hover de casi toda la interfaz del portal.

La especificidad de `[data-puntero]` es la misma que la de `:hover` (0,1,0), así
que la gemela no gana ni pierde contra el resto de la hoja por serlo: gana los
empates solo porque se inyecta al final. Una clase habría dado igual; un `#id` o
un `!important` habrían reordenado la cascada y el resultado habría dejado de ser
el que ve el ponente.

#### 11.12.3. Solo la página viva, y por qué eso no es una limitación

Del mazo no se lee nada, porque no hay nada que leer: su `body` está inerte a
propósito (11.3) y el ratón no llega a sus elementos. Lo que se refleja es
exactamente lo único que se toca.

#### 11.12.4. Lo que costó, y el coste que no tiene

- **Ni una petición nueva, pero sí más comandos.** La lectura del ratón se acota
  a 60 ms (para no gastar el hilo del ponente resolviendo rutas que nadie va a
  mandar) y la publicación va montada en el reporte que ya se hacía dos veces por
  segundo, con un umbral de movimiento dentro del mismo elemento: un pulso quieto
  sobre un botón no publica nada. Lo que sí sube es el almacén, y conviene
  decirlo con números en vez de con "es gratis": el sondeo pasa de cuatro a cinco
  lecturas por vuelta, y mientras el ratón se mueve el reporte deja de llegar
  cada cinco segundos para llegar dos veces por segundo. Las cuentas al día están
  en la sección 6.
- **`puntero` ausente y `puntero: null` significan cosas distintas** en el bus:
  ausente es "sin novedad", `null` es "apaga el cursor". Por eso el anuncio de la
  rueda no lleva el campo: si mandara `null` por no tenerlo a mano, el cursor de
  la sala parpadearía en cada giro.

#### 11.12.5. El seguidor, que hasta aquí no obedecía ni el espejo

Al implementar esto salió un hueco real: `espejo.ts` estaba escrito, probado y
publicándose, pero **nadie lo aplicaba**. `/presentacion` leía `destino` y
`scroll` del sondeo y descartaba el resto, así que la sala seguía viendo el
arranque del beat mientras el ponente navegaba la demo.

Sin eso, el puntero no tiene sentido: una ruta solo resuelve si las dos ventanas
están en la misma página. Así que el seguidor cierra las dos cosas de una vez,
con los tres frenos que ya pedía 11.5.2: nunca contra la navegación guionizada
del propio bundle (se espera a que el beat se asiente y se compara contra el
`href` que ya hay), nunca a mitad de una reconciliación, y `location.replace` en
vez de `src`.

#### 11.12.6. Archivos

```
src/lib/presentacion/puntero.ts      reglas puras + lectura de DOM (nuevo)
tests/presentacion-puntero.test.ts   43 casos (nuevo)
src/pages/api/presentacion.ts        clave `presentacion:puntero`, sondeo y anuncio
src/pages/present-admin.astro        lectura del ratón en la página viva
src/pages/presentacion.astro         aplica el espejo Y el puntero (seguidor)
tests/presentacion-endpoint.test.ts  5 casos de la costura con el almacén
```

Lo que **no** está verificado: en local las URLs de las páginas vivas son
absolutas a producción, o sea de otro origen, y ni el ratón ni las hojas de
estilo se dejan leer a través de esa frontera. El camino entero (hover en el
portátil, hover en la sala) solo se puede cerrar desde producción, con dos
equipos, y entra en la lista de 11.9.

#### 11.12.7. El popover de `/engineering`, que no es hover de CSS (3 sep 2026) ✅

El beat de la salud de ingeniería enmarca `/engineering`, y sus cards abren un
panel de detalle al pasar por encima: de dónde sale la cifra, contra qué se
compara, cuándo se midió. En el portátil del ponente se abría; en la sala, no.
La card se iluminaba (eso sí es `:hover`, y la gemela de `[data-puntero]` lo
cubre) pero el panel no aparecía, así que la sala veía "312 ms" sin el párrafo
que explica qué es TTFB.

**La causa es una excepción a 11.12.2 que había que encontrar**: ese panel no lo
abre una regla de CSS sino un `mouseenter` que añade una clase
(`CardPopover.astro`, con su temporizador de apertura y su volteo hacia arriba
cuando abajo no cabe). Duplicar reglas no puede alcanzarlo: no hay regla que
duplicar, la decisión la tomó un script que en el seguidor nunca recibe el ratón.

Se replica el **estado**, no el evento: `sincronizarPopover` pone la misma clase
que pondría el componente, en el popover que contiene al elemento señalado, y la
quita de los demás. Inyectar un `mouseenter` sintético habría vuelto a pasar por
el temporizador y, sobre todo, habría despertado cualquier otro listener de la
página en cada equipo de la sala. El volteo se recalcula igual que allí, con la
caja del disparador y el alto de la ventanilla, y **no se reescribe lo que ya
está abierto**: esto corre dos veces por segundo, y volver a poner la clase
reiniciaría la transición del panel en cada vuelta.

Las clases (`card-pop`, `is-open`, `flip-up`) son un contrato con
`src/components/CardPopover.astro`, escrito en los dos sitios.

### 11.14. El eco: que la sala vea lo que se ESCRIBE (3 sep 2026) ✅

Tercer y último hueco del mismo montaje, y el más grande: el beat del
**diagnóstico público de un sitio** (`/lab/site-check`). El espejo lleva la URL
y el puntero lleva el ratón; ninguno de los dos cuenta lo que pasa ahí, porque
ahí no pasa nada de eso. El ponente teclea un dominio, pulsa Analizar, y las
doce tarjetas llegan por un `POST` en streaming sobre el mismo documento: la URL
no cambia ni una letra. La sala se quedaba mirando un formulario vacío durante
el minuto largo que dura el análisis, que es justo el minuto en el que se está
hablando de él.

#### 11.14.1. Las tres decisiones, y lo que se descartó en cada una

- **No se espeja HTML.** El canal no tiene puerta (11.7): quien conozca la URL
  puede escribir en él. Un `innerHTML` con lo que venga de ahí sería XSS en el
  mismo origen y en todos los equipos de la sala a la vez. Lo que viaja son
  **datos**, y quien los pinta es la página con su propio renderizador y su
  propio escapado.
- **No se repite el trabajo.** La alternativa fácil era mandar solo el dominio y
  dejar que cada seguidor analizara por su cuenta: treinta navegadores lanzando
  treinta sondeos reales contra el sitio y treinta llamadas a la cuota de
  PageSpeed Insights. El análisis lo corre el ponente una vez; lo demás es
  reparto.
- **La página se descubre por su forma**, como todo lo demás en este sistema. Ni
  `eco.ts` ni las dos ventanas saben qué es un diagnóstico: la página viva
  publica `window.ESPEJO_VIVO` con `leer()` y `aplicar()`, y la que no lo publica
  sencillamente no tiene eco. Otro beat interactivo mañana no toca nada del
  transporte.

#### 11.14.2. Lo que viaja, y lo que NO vuelve en cada sondeo

Un `{ pos, seq, estado }` con las mismas dos reglas del espejo y el puntero: el
`seq` solo sube (un mensaje atrasado no deshace lo tecleado) y el `pos` lo ata a
su diapositiva (cambiar de beat devuelve el formulario de la sala a su arranque
sin escribir nada).

El `estado` es **opaco para el transporte**: validar su forma es cosa de quien lo
va a pintar, que es la única que sabe cuál es. Lo que sí se valida aquí es que
sea JSON y que quepa (`ECO_MAX`, 12 000 caracteres); la página degrada sola
antes de llegar al techo -primero suelta los detalles, luego las tarjetas más
viejas- porque un estado que no cabe se descarta entero y quedarse sin espejo
justo en el análisis largo sería el peor momento posible.

Y una diferencia con los otros dos, por tamaño: el eco es el único campo que
pesa kilobytes, y `?q=destino` lo sondea dos veces por segundo **por
asistente**. El seguidor manda en `?eco=` el `seq` que ya tiene y el servidor
omite el campo si es el mismo. Ausente significa "sin novedad" y `null`
significa "no hay nada escrito en esta diapositiva", igual que en el puntero: el
análisis viaja una vez, no doscientas.

#### 11.14.3. Archivos

```
src/lib/presentacion/eco.ts          transporte + contrato ESPEJO_VIVO (nuevo)
tests/presentacion-eco.test.ts       31 casos (nuevo)
src/pages/lab/site-check/index.astro implementa leer()/aplicar() con su saneado
src/pages/api/presentacion.ts        clave `presentacion:eco`, sondeo condicional
src/pages/present-admin.astro        lee el estado de la página viva y lo publica
src/pages/presentacion.astro         lo aplica (seguidor)
```

Lo que **no** está verificado, por lo mismo que 11.12: en local la página viva es
de otro origen y su `window` no se deja leer. El camino entero se cierra desde
producción con dos equipos, y entra en la lista de 11.9.

### 11.13. El final de la charla (2 sep 2026) ✅

Al llegar a la última diapositiva del mazo, `/present-admin` espera cinco
segundos y se va a `/presentacion-end`, la página que se comparte cuando la
sustentación ya terminó (sección 11.8 de este plan la describe; RF-718 la
documenta). El mazo acaba en "¿Preguntas?", así que lo que queda en pantalla
durante el turno de preguntas es el cierre con la documentación, las cifras del
kanban y el contacto, en vez de una lámina muerta.

**Lo único delicado aquí es la cancelación**, y es lo que decide si la feature
es útil o es una trampa: la última diapositiva se alcanza también por error (la
tecla `End`, un dígito de más en la rejilla, un salto mal contado). Si la cuenta
no se pudiera deshacer, un despiste se llevaría por delante la ventana que
conduce la charla, y recuperarla es volver a cargar el mazo y esperar a que
reconcilie veintidós posiciones con la sala mirando.

Hay un segundo caso, que salió en la auditoría y no en el diseño: **la ventana
llega al final reconstruyéndose**. El destino vive en el servidor con TTL de
seis horas (sección 3), así que abrirla después de un ensayo -o recargarla a
mitad del turno de preguntas- la manda al final sola, persiguiendo un destino
viejo. Sin defensa, sería una ventana que se va a la página de cierre en cuanto
se abre, y la única forma de recuperar el mazo sería pulsar "anterior" antes de
que corran cinco segundos. Es el mismo escenario que el origen `inicial` de la
sección 4 existe para proteger, y merece la misma prudencia.

Las reglas, en `src/lib/presentacion/cierre.ts` y probadas sin temporizadores.
Tres fases:

- `esperando` (recién cargada): **no se va a ninguna parte**, llegue donde
  llegue. Pasa a `listo` en cuanto la ventana se queda **en reposo fuera del
  final** por lo menos una vez. Un viaje de reconstrucción nunca lo está (va
  persiguiendo un destino) y una charla de verdad lo está en cada diapositiva de
  la que se habla: esa es toda la diferencia entre "llegué al final" y "aparecí
  en el final".
- `listo`: la última posición global, con el mazo en reposo, **arma** la cuenta.
- `armado`: cualquier movimiento que salga de ahí la **desarma**. Un destino que
  ya no es el final cuenta como movimiento aunque el mazo todavía no se haya
  movido: el ponente que se arrepiente pulsa "atrás" y la ventana se queda, en
  el acto.

Cancelar devuelve a `listo` y no a `esperando`: volver a entrar en la última
tiene que volver a armar, o cancelar una vez desactivaría el cierre para el
resto de la charla. Y una lectura que no se puede creer (sin total, o con una
posición que no es un entero) no arma nunca y **desarma** si había cuenta: si no
se sabe dónde está la pantalla, no se navega sola.

Recargar el lienzo desde el panel devuelve la vigilancia a `esperando`, por lo
mismo: el mazo vuelve a reconstruirse hacia el destino guardado.

Manda la posición **real** y no el destino: lo que decide que la charla acabó es
lo que hay proyectado, no lo que alguien acaba de pedir.

Y lo dice antes de hacerlo. El panel (11.11) enseña `cierre en 5s · atrás lo
cancela` en el sitio donde ya vive la salud del enlace. Una ventana que navega
sola sin avisar se lee como una caída, que es lo último que hace falta parecer
al terminar.

## 12. Entrega de la sección 11: inventario y orden

La sección 11 es un diseño cerrado y a medio construir. Esta sección no lo
rediseña: dice **qué hay de verdad hoy**, qué falta, y en qué orden se entrega
sin dejar el sistema roto entre paso y paso.

### 12.1. Inventario, contrastado contra el código

| Pieza | Estado | Nota |
|---|---|---|
| `lib/presentacion/lienzo.ts` | ✅ | descubrimiento del mazo y del iframe vivo, con tests |
| `lib/presentacion/espejo.ts` | ✅ puro | `seq`, vínculo con la diapositiva, cuándo navegar |
| `lib/presentacion/cronometro.ts` | ✅ puro | desfase, formato, arranque |
| `api/presentacion.ts`, lado LECTURA | ✅ | `?q=destino` (sala), `?q=conducir` (pantalla) y el `GET` del mando, los tres con `inicio`/`ahora` |
| `api/presentacion.ts`, lado ESCRITURA | ✅ | espejo, arranque y reinicio del reloj, scroll absoluto y `anunciar()` |
| `middleware.ts` | ✅ | `/presentacion` ya entra en `isPresentView` (CSP del bus) |
| `src/pages/present-admin.astro` | ✅ | las seis capas de 12.5, sin verificar en vivo |
| `/presentacion` como seguidor puro | 🟡 | ya no publica (bandera `?publicar=1`, §13); falta engancharla al bus, **detrás del paso 0** |
| `client-sync.ts` parametrizado | ❌ | hace falta solo para el paso 3 |
| RF-717, runbook, §11 marcada | ✅ | el RF es el 717: el 716 ya estaba cogido |

**El lado servidor está entero.** La última pieza que faltaba era la escritura
de scroll **absoluto** (`situar`, en `desplazamiento.ts`), que es por donde
entra la rueda del ratón de `/present-admin` (11.5.3): hasta entonces solo
existían `subir` y `bajar`, que van a saltos de un tercio de pantalla.

Dos decisiones que se tomaron al cerrarlo y no estaban escritas:

- **El acotado de frecuencia vive en el cliente**, no en el servidor. Un gesto
  de rueda son cincuenta eventos, pero un servidor que descarta en silencio lo
  que le mandan deja la sala en una posición que nadie puede explicar mirando
  el estado. `/present-admin` escribe como mucho dos veces por segundo.
- **`subir`/`bajar` también anuncian al bus.** No lo hacían: la sala se enteraba
  igual, pero por rebote (la pantalla ve moverse la geometría y publica un
  latido), que es un viaje de ida y vuelta de más y deja al seguidor por detrás
  del propio proyector. Es la regla de 12.4.5 aplicada al camino que faltaba.

### 12.2. Dos hallazgos que corrigen a la sección 11

**1. `client-sync.ts` no se reusa "tal cual".** 11.2 y 11.8 lo dan por
reutilizable, y sus tres capas (bus, resincronía, rescate) son justo lo que no
conviene volver a derivar. Pero el módulo está atado al sistema de decks: sondea
`/api/present/<sessionId>/snapshot`, acepta un `Snapshot` con `pin` y
`deckTitle`, y su rescate va a 1 s, no a los 3 s que pide 11.2 para treinta
teléfonos bajo una IP compartida. Hay que **parametrizarlo** (canal, endpoint de
resincronía, forma del mensaje, cadencia del rescate) dejando el sitio de
llamada de los decks funcionando igual. Escribir un hermano nuevo duplicaría la
única lógica del sistema que ya se probó en vivo con público delante.

**Sigue sin parametrizar, y a propósito.** Su único consumidor sería el paso 3,
que está detrás del paso 0. Tocar hoy un módulo que sostiene tres charlas en
producción para dejarlo esperando a una compuerta que puede cerrarse es
arriesgar lo que funciona por algo que quizá no se use. Se hace cuando el paso 0
diga "sala sí". Aviso para quien lo retome: en el repo ya hay **dos** copias de
estas tres capas (`present/client-sync.ts` y `sustentacion/seguir.ts`), así que
la tercera no se escribe - se parametriza la primera.

**2. El orden entre los pasos 2 y 3 es obligatorio, no una preferencia.** Hoy el
único escritor de `actual` es `/presentacion`. Si deja de publicar antes de que
`/present-admin` publique, queda una ventana sin nadie que diga la forma del
mazo: el mando pierde el techo real, la rejilla de saltos y el guion, que es
precisamente lo que la sección 2.2 protege. `/present-admin` publica primero;
`/presentacion` se calla después. Y mientras dure ese solape, **no se abren las
dos a la vez**: serían dos escritores de la misma clave.

### 12.3. Paso 0 ⛔: la compuerta, que hoy está la última

El punto 10 de 11.9 (medir `final.html` en un teléfono de gama baja) no es una
verificación, es una **compuerta de diseño**, y va primero. `final.html` es 1 MB
con canvas animados; la sección 11 entera apuesta a que treinta asistentes lo
corren cada uno en su equipo. Si ahí no va fluido, lo que cambia no es un
detalle de implementación: se cae la idea de la sala como seguidores y §11 se
reduce a `/present-admin` más el teclado y el espejo, con una sola proyección
para todos. Descubrirlo después de construir el bus, el rescate y el seguidor es
tirar el paso 3 entero.

Se mide con el mazo real, en un teléfono prestado de gama baja, en el WiFi del
salón si se puede. Lo que se decide con el resultado: **sala sí** (se sigue con
el plan) o **sala no** (se entrega `/present-admin` y `/presentacion` se queda
como está, sin tocar su lado escritor).

### 12.4. Paso 1 ✅: cerrar el lado de escritura de la API

Autónomo y sin riesgo: no rompe nada de lo que ya funciona, y deja el resto del
trabajo apoyado en algo que se puede probar con `curl` antes de tener páginas.

1. **Arranque del cronómetro.** Dentro del `POST` que mueve el destino, la
   primera vez que sale de `POS_INICIAL` y la clave no existe (`debeArrancar`,
   que ya está importado). Sin escritor nuevo y sin un gesto más que recordar.
2. **`reiniciar-cronometro`.** Borra `K_INICIO`. El reloj vuelve a arrancar solo
   en el movimiento siguiente, no al instante: es lo que hace que el reinicio no
   necesite confirmación en el servidor.
3. **Espejo.** El `POST` acepta el `href` del iframe vivo y escribe
   `K_ESPEJO` con `siguienteEspejo` (que ya resuelve el `seq` y el vínculo con
   la diapositiva). Se descarta sin escribir si el `pos` no es el destino.
4. **Scroll absoluto.** Una vía para "la rueda dejó la página en `y`", que acota
   contra la geometría publicada igual que `subir`/`bajar`. El acotado de dos
   escrituras por segundo (11.5.3) va en el cliente, no aquí: el servidor no
   debe descartar en silencio lo que le mandan.
5. **Llamar a `anunciar()`** en cada camino que cambie algo, con el mismo objeto
   que devuelve `?q=destino`. Fail-open, ya escrito.

Verificación: lo que sea puro entra en `tests/presentacion-espejo.test.ts` y
`presentacion-cronometro.test.ts`, que ya existen; lo demás, con `curl` contra
el dev server, como se hizo con la sección 10.

### 12.5. Paso 2 ✅: `/present-admin`

La ventana que conduce. Es el grueso del trabajo y se entrega por capas, cada
una comprobable a ojo en el portátil antes de seguir:

- **a. Lienzo y reconciliación.** Monta `final.html`, descubre el mazo y obedece
  el destino, reusando `lienzo.ts` y la mecánica que ya está probada en
  `/presentacion`. Al terminar esta capa, `/present-admin` ya es la pantalla: es
  el punto en que empieza a publicar `actual`.
- **b. `pointer-events` por dentro** (11.3): `auto` en el marco, `none` en el
  `body` del bundle, `auto` en el iframe vivo. Re-afirmado en cada sondeo, como
  `afirmarCapas`. Prueba: clic en la lámina fuera de la ventanilla y que **no
  pase nada**.
- **c. Teclado** (11.4): flechas y dígitos de la página hacen `POST`; listener en
  **fase de captura** sobre el documento del bundle que se come las teclas
  `isTrusted`. Prueba: foco dentro del mazo, flecha, y que no se mueva un beat
  por fuera del servidor.
- **d. Rueda → scroll** (11.5.3), contra la vía del paso 1.4, acotada a dos
  escrituras por segundo.
- **e. Espejo de URL** (11.5.2), contra la vía del paso 1.3, respetando la
  navegación guionizada del propio bundle.
- **f. Isla del cronómetro** (11.6), con `pointer-events: none` en el contenedor
  y `auto` solo en el pastillero.

Ruta sin puerta y sin excepción en el middleware: el guion de `/present-admin`
la deja fuera de `startsWith('/present/')` y de `isAdmin` por construcción.
`Cache-Control: no-store`, `noindex, nofollow`, fuera de sitemap.

### 12.6. Paso 3 🟡: `/presentacion` pasa a seguidor puro

La mitad que no dependía de la compuerta se entregó el 3 sep 2026 (§13): la
ventana ya no publica. Lo que sigue detrás del paso 0 es engancharla al bus, que
es lo que la haría viable para treinta asistentes.

- ~~Quitar sus seis llamadas a `reportar`~~ ✅: cero `POST` por defecto, que es
  la corrección de 11.1 y el motivo de la sección. Queda `?publicar=1` como
  vuelta a la ventana escritora para ensayar sin portátil, nunca con
  `/present-admin` abierta a la vez.
- Engancharse al canal con el `client-sync` parametrizado (12.2), con rescate a
  3 s y solo lectura.
- Conserva su `pointer-events: none`, que ahora tiene un motivo más: que un
  asistente no desincronice su propia copia.

**Una pregunta que hay que responder aquí y no dejar pasar:** qué queda del
origen `ajena` (sección 4) cuando el único que reporta es `/present-admin` y
además tiene el teclado tapado por 11.4. Deja de ser "alguien pulsó la flecha en
el portátil" y pasa a cubrir solo la navegación que el bundle hace por su cuenta
dentro de un beat. No se borra a ciegas: se decide con la regla escrita y se
ajusta el comentario de la sección 4, que si no queda mintiendo sobre el motivo.

### 12.7. Paso 4 ✅: documentación

RF-717 en `src/data/documentacion.ts` (un feature entregado que no aparece en
`/docs` no existe para la sustentación), el montaje real y la regla del login de
demo en `docs/runbook-sustentacion.md`, y marcar §11 y esta §12 al cerrar.

Entregado así: el RF salió **717** y no 716, que ya lo tenía el planteamiento
del proyecto, y entra como `parcial` y no `implementado` a propósito - la
ventana que conduce está, la sala como seguidores no, y un RF que dice
"implementado" sobre medio diseño es peor que uno que no existe. El runbook
recibió una sección propia (`3 bis`), separada del sistema de `/sustentacion`
para que no se mezclen dos cosas que solo comparten el día.

### 12.8. Paso 5 ⛔: verificación en vivo

Los diez puntos de 11.9 menos el décimo, ya gastado en el paso 0. **No se puede
cerrar desde el portátil solo**: los puntos 1, 6 y 9 piden `/presentacion`
abierta en dos equipos distintos, uno de ellos un teléfono, y el 9 pide cortar
el bus a propósito. El punto 6 (bloquear el teléfono espectador dos minutos y
comprobar que al volver no arrastra a nadie) es el que justifica la sección
entera: si ese no se hace, no se ha verificado nada.

### 12.9. Lo que este plan no decide

- El ritmo contra el guion (11.6.5) sigue fuera: es cero estado nuevo sobre
  datos que ya existen y se puede añadir después sin tocar nada.
- El espejo del DOM, el login real en la demo y la puerta siguen fuera, por lo
  que dice 11.10.

## 13. Auditoría entre las tres ventanas (3 sep 2026)

Los hallazgos completos, con su reproducción, están en
[`hallazgos-presentacion.md`](./hallazgos-presentacion.md). Lo que sigue es qué
se hizo con cada uno. No se auditó cada pieza por separado: se auditó el
**protocolo** que las une, que es donde un fallo no degrada una función sino que
deja la charla parada con el jurado delante.

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Dos escritores de `actual`: cualquier `/presentacion` secuestraba el destino | ✅ bandera |
| 2 | `/api/presentacion` bajo el paraguas de 600/min: la sala tumba al mando | ⛔ paso 0 |
| 3 | `anunciar()` publica al vacío y la CSP ya paga por él | ⛔ paso 0 |
| 4 | Tras clicar en la demo viva, las flechas quedaban muertas | ✅ 11.4 |
| 5 | `/remote` era el único de los tres sin cronómetro | ✅ 11.6.4 bis |
| 6 | `/presentacion-end` no vuelve al mazo; la sala no cierra | ✅ runbook |
| 7 | `?q=destino` tiraba dos lecturas por sondeo en la ventana que conduce | ✅ `?q=conducir` |

**1. La bandera, que es la salida 2 de las tres que había.** `/presentacion`
deja de publicar: sus llamadas a `reportar()` quedan detrás de `?publicar=1`,
apagado por defecto. Es media corrección del paso 3 (12.6) sin tocar el servidor
y sin esperar a la compuerta: la ventana pasa a ser un seguidor de sondeo, que es
lo que hace falta. La regla de 12.2 ("no se abren las dos a la vez") existía,
pero no estaba escrita en ningún sitio que la hiciera cumplir, y abrir la ruta
desde el celular para comprobar la proyección es un gesto razonable.

El precio, ahora escrito en el runbook: sin nadie que publique la forma del mazo,
`/remote` se queda sin techo, sin rejilla y sin guion **salvo que
`/present-admin` esté abierta**, que es el montaje real de la sustentación.

**2 y 3 siguen detrás del paso 0, y hay que decirlo bien.** No son "pendientes
menores": si el paso 0 dice **sala no**, no se amplían, se **retiran** - hay que
quitar el `anunciar()` y la apertura de `connect-src` a Upstash de
`middleware.ts`, que hoy es una relajación de CSP sin ningún suscriptor detrás.
Si dice **sala sí**, el endpoint necesita cupo propio fuera del paraguas de
`isRateLimitablePath`, como ya lo tiene `/api/present/*/snapshot`: con la sala
compartiendo el NAT del salón, el 429 no cae solo sobre el público, cae sobre la
misma IP que usa el portátil que conduce y el celular que lleva el mando. Entregar
`/presentacion` a la sala sin el bus no es una versión reducida del plan, es una
avería.

**7. Un sondeo con su propia rama.** `/present-admin` pedía `?q=destino` dos
veces por segundo y descartaba siempre el espejo y el puntero, que los escribe
ella misma: 240 lecturas por minuto del almacén, toda la charla, para nada.
`?q=conducir` devuelve `{ destino, scroll, inicio, ahora }` y deja `?q=destino`
intacta para los seguidores. Son dos consumidores distintos de la misma clave, no
uno con dos modos.

