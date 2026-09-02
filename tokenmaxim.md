# Pendiente: `/present-admin` y la sala como seguidores

Estado a **2 sep 2026**. Documento de traspaso: lo que falta para cerrar la
sección 11 del control remoto de `final.html`, con el contexto mínimo para
retomarlo en frío.

La verdad completa vive en `docs/plan-control-final.md`: la **§11** es el diseño
(cerrado, no hay que rediseñar nada) y la **§12** es el orden de entrega con el
inventario. Este archivo es el resumen operativo de lo que queda.

## De qué va, en cuatro líneas

Hoy hay una sola pantalla, `/presentacion`, que hace dos papeles a la vez:
conduce el mazo y lo enseña. La sección 11 los separa en `/present-admin` (el
portátil del ponente, que conduce y puede **teclear dentro de la demo**) y
`/presentacion` (el equipo de cada asistente, que solo mira). El mando del
celular, `/remote`, no cambia.

## Lo que ya está hecho

**Actualizado el 2 sep (sesión de cierre).** Se entregaron los pasos 1, 2 y 4;
quedan el 0, el 3 y el 5, y el 3 y el 5 no los puede hacer quien retome el
código solo. Detalle al final, en «Lo que se cerró y lo que no».

| Pieza | Dónde |
|---|---|
| Descubrimiento del mazo y del iframe vivo | `src/lib/presentacion/lienzo.ts`, con tests |
| Espejo de URL, puro (`seq`, vínculo con la diapositiva) | `src/lib/presentacion/espejo.ts` |
| Cronómetro, puro (desfase, formato, arranque) | `src/lib/presentacion/cronometro.ts` |
| Scroll del iframe de un beat (sección 10 entera) | `desplazamiento.ts` + API + `/remote` |
| API, lado LECTURA | `?q=destino` devuelve `{ destino, scroll, espejo, inicio, ahora }` |
| API, arranque y reinicio del cronómetro | `POST` con `debeArrancar`, y `reiniciar-cronometro` |
| API, escritura del espejo | un reporte sin espejo no borra el que hay |
| API, publicación al bus | `anunciar()`, fail-open, en los dos caminos que cambian algo |
| CSP del bus para `/presentacion` | `isPresentView` en `src/middleware.ts` |
| **Scroll ABSOLUTO** (la vía de la rueda) | `situar()` en `desplazamiento.ts` + `accion: 'scroll'` en la API |
| **`/present-admin` entera** (capas a-f de §12.5) | `src/pages/present-admin.astro` |
| **RF-717, runbook §3 bis, §11 y §12 marcadas** | `documentacion.ts`, `runbook-sustentacion.md`, `plan-control-final.md` |

La suite completa pasa: **1714 tests**, `astro check` sigue en los siete errores
preexistentes de siempre.

## Lo que falta, en orden

### Paso 0 ⛔. La compuerta, y va primero

**Medir `final.html` en un teléfono de gama baja**, con el mazo real y a ser
posible en el WiFi del salón.

No es una verificación, es una decisión de diseño. El bundle es 1 MB con canvas
animados y la sección 11 apuesta a que treinta asistentes lo corren cada uno en
su equipo. Lo que se decide con el resultado:

- **sala sí**: se sigue con todo el plan.
- **sala no**: se entrega `/present-admin` y `/presentacion` se queda como está.
  El paso 3 entero se cae.

Hacerlo al final (que es donde lo dejaba §11.9, como punto 10) es construir el
bus, el rescate y el seguidor sin saber si sirven.

### Paso 1 ✅. Cerrar el lado de escritura de la API

**Hecho.** `situar()` en `src/lib/presentacion/desplazamiento.ts` (puro, acota
contra la geometría publicada igual que `mover`, y descarta un `y` que no sea
una posición posible) y `POST { accion: 'scroll', y }` en
`src/pages/api/presentacion.ts`.

Dos cosas que se decidieron al cerrarlo:

- El acotado de dos escrituras por segundo quedó en el **cliente**, como decía
  el plan. El servidor no descarta en silencio lo que le mandan.
- **`subir`/`bajar` ahora también anuncian al bus.** No lo hacían, y la sala se
  enteraba por rebote (la pantalla ve moverse la geometría y publica un latido):
  un viaje de ida y vuelta de más que dejaba al seguidor por detrás del propio
  proyector. Es la regla de §12.4.5 aplicada al camino que le faltaba.

Cubierto por 5 casos nuevos en `tests/presentacion-desplazamiento.test.ts` y 5
de costura en `tests/presentacion-endpoint.test.ts` (incluido el que fija que la
rueda y el pulgar comparten clave sin pisarse).

### Paso 2 ✅. `/present-admin`

**Hecho**, las seis capas, en `src/pages/present-admin.astro` (714 líneas).
Type-check limpio y responde 200 con `Cache-Control: no-store` y
`X-Robots-Tag: noindex, nofollow`. **Sin verificar a ojo con el mazo real**: eso
es el paso 5. Lo que se entregó, capa por capa:

- **a. Lienzo y reconciliación.** Monta `final.html`, descubre el mazo y obedece
  el destino, reusando `lienzo.ts`. Al terminar esta capa ya es la pantalla del
  sistema: es el punto en que empieza a publicar `actual`.
- **b. `pointer-events` por dentro** (§11.3). `auto` en el marco, `none` en el
  `body` del bundle, `auto` en el iframe vivo. Re-afirmado en cada sondeo, como
  `afirmarCapas`. Quitarle el `pointer-events: none` al iframe por fuera no
  sirve: el bundle escucha `onStageClick` y cualquier clic avanza un beat.
- **c. Teclado en fase de CAPTURA** (§11.4) sobre el documento del bundle, que
  se come las teclas `isTrusted`. Es el reverso exacto de `disparar()`: aquella
  inyecta el evento con el constructor del iframe, esta lo intercepta antes de
  que el bundle lo vea. Sin esto, una flecha con el foco dentro del mazo mueve
  un beat sin pasar por el servidor y la sala se queda atrás.
- **d. Rueda del ratón** contra la vía del paso 1.
- **e. Espejo de URL** (§11.5.2), respetando la navegación guionizada que el
  propio bundle hace en algunos beats.
- **f. Isla del cronómetro** (§11.6), con `pointer-events: none` en el
  contenedor y `auto` solo en el pastillero: si la isla comiera los clics de la
  franja superior se llevaría por delante la barra de navegación del portal
  justo durante la demo.

Ruta sin puerta y **sin excepción en el middleware**: el guion de
`/present-admin` la deja fuera de `startsWith('/present/')` y de `isAdmin` por
construcción. `Cache-Control: no-store`, `noindex, nofollow`, fuera de sitemap
(que es una lista explícita, no un glob, así que no había nada que quitar).

**Lo que el plan no decía y salió al construirlo:**

- **Hubo que registrar la ruta en `RESERVED_ROOT_SEGMENTS`**
  (`src/lib/present/reserved.ts`). Es un segmento en la raíz y compite con el
  espacio de los PIN de presentación: un PIN generado podría coincidir y mandar
  a quien escanee el QR a la ventana de conducción en vez de a su deck. Lo cazó
  `tests/present-pin.test.ts`, no una revisión. **`presentacion-end` tampoco
  estaba registrada** (del tercer bloque de este archivo) y se arregló de paso.
- **El guardia anti-repetición de la rueda tuvo que llevar la diapositiva
  dentro.** Con solo el número, recorrer dos beats distintos hasta la misma
  altura hacía que el segundo se descartara por repetido: el servidor seguiría
  creyendo esa diapositiva arriba y devolvería la página de un tirón en el
  sondeo siguiente. Mismo patrón `{pos, y}` que ya usa la clave del scroll.
- **Hay una ventana de inercia de 900 ms** en la que `/present-admin` deja de
  obedecer el scroll del servidor. Sin ella, la inercia del trackpad sigue
  llegando casi un segundo después de levantar los dedos y el desplazamiento
  pedido de antes del gesto tira de la página hacia atrás mientras se recorre.
- **El espejo se manda en cada reporte, no solo cuando cambia.** El servidor lo
  reescribe idéntico (barato) y los seguidores lo descartan por `seq` empatado,
  pero así una clave que venció por TTL vuelve sola en el latido siguiente.

### Paso 3 ⛔. `/presentacion` pasa a seguidor puro

**Sin empezar, y a propósito: depende del paso 0**, que nadie ha hecho. Lo mismo
vale para parametrizar `client-sync.ts`, que es su única pieza de apoyo: tocar
hoy un módulo que sostiene tres charlas en producción para dejarlo esperando a
una compuerta que puede cerrarse es arriesgar lo que funciona por algo que quizá
no se use.

Mientras tanto **`/presentacion` se queda como está**, y eso impone una regla de
operación: **no abrir `/present-admin` y `/presentacion` a la vez**, porque
serían dos escritores de la misma clave.

Hoy sigue teniendo **siete llamadas a `reportar`**. Hay que dejarlo en cero
`POST` y engancharlo al canal, con rescate a 3 s y solo lectura.

Conserva su `pointer-events: none`, que ahora tiene un motivo más: que un
asistente no desincronice su propia copia sin entender por qué.

### Paso 4 ✅. Documentación

**Hecho**, con una corrección: **el RF salió el 717, no el 716** - ese ya lo
tenía el planteamiento del proyecto. Entra como `parcial` y no `implementado` a
propósito: la ventana que conduce está, la sala como seguidores no, y un RF que
dice "implementado" sobre medio diseño es peor que uno que no existe.

- **RF-717** en `src/data/documentacion.ts`.
- **`docs/runbook-sustentacion.md`**: sección propia `3 bis` con las tres
  ventanas, el orden de montaje, la regla del login de demo y las tres cosas que
  sorprenden en vivo (flechas muertas con el foco en la demo, clic inerte en la
  lámina, cronómetro que arranca solo). Va **separada** del sistema de
  `/sustentacion`, que es otra cosa y solo comparte el día. Más dos ítems en el
  chequeo de los diez minutos previos.
- **§11 y §12** de `docs/plan-control-final.md` marcadas, con los pasos
  etiquetados ✅/⛔ y el inventario de §12.1 puesto al día.

### Paso 5 ⛔. Verificación en vivo

Los diez puntos de §11.9 menos el décimo, ya gastado en el paso 0. **No se
cierra desde el portátil solo**: los puntos 1, 6 y 9 piden `/presentacion`
abierta en dos equipos distintos, uno de ellos un teléfono, y el 9 pide cortar
el bus a propósito.

El punto 6 es el que justifica la sección entera: bloquear el teléfono
espectador dos minutos, desbloquearlo, y comprobar que **no arrastra a nadie**.
Si ese no se hace, no se ha verificado nada.

## Dos cosas que corrigen a la sección 11

**1. `client-sync.ts` no se reusa "tal cual".** §11.2 y §11.8 lo dan por
reutilizable. Sus tres capas (bus, resincronía cada 10 s, rescate por sondeo)
son justo lo que no conviene volver a derivar, porque es la única lógica del
sistema ya probada en vivo con público delante. Pero el módulo está atado al
sistema de decks: sondea `/api/present/<sessionId>/snapshot`, espera un
`Snapshot` con `pin` y `deckTitle`, y su rescate va a **1 s**, no a los 3 s que
pide §11.2 para treinta teléfonos bajo una IP compartida.

Hay que **parametrizarlo** (canal, endpoint de resincronía, forma del mensaje,
cadencia del rescate) dejando el sitio de llamada de los decks funcionando
igual. Sigue sin parametrizar, **y se dejó así a conciencia**: su único
consumidor es el paso 3, que está detrás del paso 0, y tocar hoy un módulo que
sostiene tres charlas en producción para dejarlo esperando a una compuerta que
puede cerrarse es arriesgar lo que funciona por algo que quizá no se use.

Aviso para quien lo retome: en el repo ya hay **dos** copias de estas tres capas
(`lib/present/client-sync.ts` y `lib/sustentacion/seguir.ts`, que documenta en su
cabecera por qué no reusó la primera). La tercera no se escribe: se parametriza
la primera.

**2. El orden entre los pasos 2 y 3 es obligatorio.** Hoy el único escritor de
`actual` es `/presentacion`. Si deja de publicar antes de que `/present-admin`
publique, queda una ventana sin nadie que diga la forma del mazo: el mando
pierde el techo real, la rejilla de saltos y el guion. `/present-admin` publica
primero, `/presentacion` se calla después, y **mientras dure el solape no se
abren las dos a la vez**: serían dos escritores de la misma clave.

## Una pregunta abierta, que no hay que resolver a ciegas

Qué queda del origen **`ajena`** (§4) cuando el único que reporta es
`/present-admin` y además tiene el teclado tapado por §11.4. Deja de significar
"alguien pulsó la flecha en el portátil" y pasa a cubrir solo la navegación que
el bundle hace por su cuenta dentro de un beat. No se borra: se decide con la
regla escrita y se ajusta el comentario de la §4, que si no queda mintiendo
sobre su propio motivo.

**Sigue abierta, y es lo correcto**: la respuesta depende del paso 3, porque
mientras `/presentacion` siga publicando hay dos posibles emisores de `ajena` y
no uno. Lo único que se hizo fue no empeorarla: en `/present-admin` la rama que
reporta `ajena` lleva escrito **por qué** sigue existiendo ahí (la navegación
guionizada del propio bundle, ya no el teclado del portátil). El comentario de
la §4 de `estado.ts` no se tocó: cambiarlo ahora, con el otro escritor todavía
vivo, lo dejaría mintiendo en la dirección contraria.

## Gotchas del entorno

- **Node 22**: `source ~/.nvm/nvm.sh && nvm use 22`. El shell trae Node 20 y
  rompe `astro build` y `astro dev`.
- **El almacén en memoria del dev server se reinicia solo** cuando Astro
  reevalúa módulos. El destino vuelve a 1 y la pantalla obedece. No es un fallo
  del sistema: es `presentStore()` cacheado a nivel de módulo.
- **En local los tres iframes del mazo son de otro origen**: sus URLs son
  absolutas a `codebymike.tech`. Para probar el scroll o el espejo hay que
  reapuntarlos a la ruta local equivalente, y ese apaño **no sobrevive** ni a
  una recarga ni a que el mazo remonte el iframe al reentrar en su beat.
- **`astro check` deja 7 errores de tipos preexistentes** (`payments/webhook.ts`,
  `docs/presentacion.astro`, `tests/indexnow.test.ts`). Son de antes; el listón
  es no subir de siete.
- **`tests/portal-isolation.test.ts` se cae por timeout bajo carga** (diez
  scrypt seguidos contra 5 s). Pasa solo cuando se corre aislado.
- **Hay más de una sesión trabajando en este repo**, y los commits salen solos.
  Conviene mirar `git log` antes de empezar: buena parte del paso 1 se cerró
  entre que se escribió el plan y hoy.

## Lo que NO entra

- Ritmo contra el guion (§11.6.5): cero estado nuevo sobre datos que ya existen,
  se puede añadir después sin tocar nada. Conviene ver primero si el reloj a
  secas basta.
- Espejo del DOM: solo viajan diapositiva, scroll y URL.
- Login real en la demo del portal: se entra por la demo pública o la sala se
  queda mirando un formulario.
- Puerta en `/present-admin`: si algún día importa, el sitio es el `POST`, no la
  página.

---
---

# Pendiente: cuentas de cobro (`/admin/cuentas-cobro`)

Estado a **2 sep 2026**. Tema **independiente** del bloque de arriba: lo de
`/present-admin` y lo de aquí no comparten código, plan ni entrega. Si retomas
uno, el otro no te hace falta.

La verdad completa vive en `docs/plan-cuentas-de-cobro.md` (§1 es el marco
normativo, §7 los pendientes). Este es el resumen operativo.

## De qué va, en cuatro líneas

Emisión de cuentas de cobro de persona natural **no responsable de IVA** desde
el panel: numeración `CC-AAAA-NNN` propia, valor en letras, retenciones
parametrizables, leyendas normativas y PDF de una página. No es una tabla nueva:
es `invoices` discriminada por `doc_type`, con el mismo precedente que
`payments.source`. El portal del cliente filtra por tipo para que un documento
con datos personales del emisor no aparezca nunca en su sesión.

## Estado verificado contra producción (2 sep)

No es lo que dice el plan, es lo que respondió la base:

| Cosa | Estado |
|---|---|
| Migración `0030` | aplicada a las **dos** bases Turso (principal y demo), 14/14 columnas + índice |
| Datos del emisor en `app_settings` | los **seis obligatorios completos** (el plan todavía los lista como pendientes) |
| `CC-2026-001` | emitida y **sana**: deudor congelado = razón social, sin retenciones, fecha correcta |
| Tests | 1689 en verde bajo UTC y `America/Bogota` |
| `astro check` | 0 errores propios (siguen los 7 preexistentes de siempre) |

**No hay datos que reparar.** La cuenta emitida se creó antes de varios arreglos
posteriores, pero ninguno la afectó: su `payer_snapshot` ya traía la razón social
correcta (en esa ficha `name` y `company` coinciden) y no lleva retenciones, así
que tampoco le falta el `labelCorto`.

## Lo que falta, en orden

### 1. ✅ Sincronizar la documentación

**Hecho** (2 sep). Las cuatro cosas entraron así:

| Qué | Dónde quedó |
|---|---|
| Dirección del documento (`SEÑORES` / `DEBE A`) | notas de **RF-308**, y §4 bis del plan |
| La razón social manda sobre el nombre de contacto | notas de **RF-308**, y §4 bis |
| Alta de deudor desde el flujo de creación | **RF-311**, nuevo |
| Anclaje de fechas a Colombia, con las dos clases | **RNF-29**, nuevo |

Se repartieron así y no todo en RF-308 por una razón: el alta de deudor es una
**capacidad** propia con su propio motivo (la cuenta se redacta cuando el
cliente la pide, que casi nunca es cuando se dio de alta en el CRM), y el
anclaje de fechas dejó de ser cosa de este módulo en cuanto se convirtió en
`lib/fecha-co.ts` compartido con las facturas del portal y los hitos - un RNF,
no un RF.

El plan (`docs/plan-cuentas-de-cobro.md`) recibió una subsección nueva en §4 bis
("Cuatro cosas que se entregaron después de escribir los RF") y su §7 ya no
miente sobre los datos del emisor.

### 2. ⛔ Validación contable de la parametrización

Lo único que separa "funciona" de "se puede emitir con confianza". Las tarifas,
las bases en UVT y el valor de la UVT los tiene que confirmar un contador. Pesa
más que antes: ya hay una cuenta emitida a un cliente real.

### 3. ⛔ Tres parámetros sin configurar (caen a valores por defecto)

Son **configuración en `app_settings`, no código**: se cambian desde
`/admin/settings`, no desde el repo. Quedan anotados en §7 del plan.

| Clave | Efecto de que falte | Urgencia |
|---|---|---|
| `uvt_cents` | usa la UVT 2026 correcta ($52.374) por defecto | baja |
| `smmlv_cents` | no se muestra el piso del IBC en el detalle | baja |
| `ret_reteica_por_mil` | ReteICA apagado, no se practica | ninguna, es deliberado |

### 4. ⛔ Fase 4: envío (opcional)

Reutilizaría `lib/notify.ts` o la plantilla de WhatsApp de `cobros.ts`, más el
vínculo opcional con un pago de `/cobrar`. Se dejó fuera a propósito:
automatizar el envío antes de saber cómo lo pide cada cliente es construir sobre
una suposición. Hoy el PDF se descarga y se manda a mano.

### 5. ⛔ Artículo en `/notes` (opcional)

El ángulo no es el CRUD: es **por qué el documento con validez fiscal es el del
pagador y no el mío**, y cómo esa inversión decide qué campos son obligatorios.

## Gotchas de este módulo

- **`DEBE A` encabeza a quien COBRA, no a quien paga.** La fórmula colombiana es
  "[DEUDOR] DEBE A [EMISOR]". Invertirlo no rompe nada visible: solo convierte la
  cuenta de cobro en un reconocimiento de deuda propia. El orden vive en
  `bloquesIdentificacion` (módulo puro) y tiene test que lo fija.
- **Hay DOS clases de fecha y los errores son OPUESTOS.** Los instantes
  (emisión, pago) se formatean en `America/Bogota`; las fechas de calendario
  (vencimiento, periodo) se anclan con `parseFechaCalendario` al entrar. Arreglar
  solo una mitad produce la otra. Todo en `src/lib/fecha-co.ts`.
- **`sena-ep.ts` ancla al MEDIODÍA UTC, no a medianoche colombiana**, y es
  correcto: esas fechas se pintan en el navegador con accesores locales. El
  criterio lo fija quién lee la fecha, no quién la escribe. Garantía real:
  UTC±11, no universal.
- **`/admin/cuentas-cobro` está vetada en la demo por patrón** (`lib/demo.ts`).
  El PDF imprime cédula, dirección y cuenta bancaria, y es un GET: "solo lectura"
  no lo detendría, y el aislamiento por base tampoco (el emisor sale de
  `app_settings`, que la base de demo también tiene).
- **Emitir congela emisor, deudor y retenciones en la fila.** Reimprimir no
  vuelve a leer `app_settings` ni `clients`. Corregir una cuenta emitida se hace
  anulando y emitiendo otra, no con un `UPDATE`.
- **Las fuentes públicas se contradicen** entre 2 y 4 UVT para la base de
  servicios (Decreto 572 de 2025). Por eso es configuración y no código.
- **Cuota de Turso**: comprobado con `EXPLAIN QUERY PLAN` contra la base real.
  Los tres accesos a `invoices` van por índice (`invoices_client_idx`,
  `invoices_doc_type_idx`, covering index del `number`), y el filtro nuevo del
  portal **no cambió el plan**. Nada nuevo en rutas públicas.

## Lo que NO entra

- Envío automático por correo o WhatsApp (es la Fase 4, decisión aparte).
- Firma escaneada: la columna `signature_url` existe sin usar. Se añade el día
  que un pagador la exija.
- Caché del PDF en Blob: descartada. Se genera en milisegundos y cachearlo
  obligaría a invalidar en cada corrección del borrador.
- Liquidar aportes de seguridad social: solo se calcula el IBC de referencia.
  Eso lo hace la PILA.

# Pendiente: comprobaciones de entorno para la sala

Estado a **2 sep 2026**. Esto **no** es el paso a paso de `/present-admin`: ese
vive en el primer bloque de este archivo y en la §12 del plan, y no se repite
aquí. Son dos comprobaciones que no pertenecen a ningún paso de
implementación, y un riesgo del repositorio que se cobró trabajo real en la
sesión del 1 de septiembre.

## 1. Las credenciales del bus en producción, sin verificar

Toda la rama "sala" da por hecho que el bus funciona. **Nadie lo ha
comprobado en producción.**

En local no existe ninguna de las variables (`PRESENT_BUS_REST_URL`,
`PRESENT_BUS_READONLY_TOKEN`, `KV_REST_API_*`, `UPSTASH_REDIS_REST_*`), que es
lo esperable, pero significa que el camino del `EventSource` **no se ejercita
en desarrollo**: en local todo cae al rescate por sondeo y parece que funciona.

Si en producción tampoco están, el fallo no se ve venir y aparece con la sala
delante: cada asistente cae a su sondeo de rescate, y ahí vuelve entero el
problema que la §11.2 resuelve, treinta teléfonos bajo la IP compartida del
WiFi del salón contra el paraguas de 600 peticiones por minuto. El síntoma es
media sala clavada en una diapositiva sin nada que lo explique salvo un aviso
en la consola de cada uno.

Es un `vercel env ls`. Antes, **confirmar `cat .vercel/project.json`**: el
directorio local se llama `portfolio` y coincide por accidente con el proyecto
de Vercel equivocado. El que sirve `codebymike.tech` es `dev-portfolio`.

Si faltan, decidirlo pronto: es alta de variables y redespliegue, no código, y
bloquea el sentido del paso 3 entero.

## 2. La medición del teléfono sigue sin hacerse

Ya está como Paso 0 en el primer bloque. Se repite aquí por una sola razón: es
la única tarea de la lista que **puede borrar otras tres**, y es la única que
no puede hacer quien retome el código.

## 3. El repositorio revierte trabajo, no solo commitea solo

El primer bloque avisa de que hay más de una sesión y de que los commits salen
solos. Es más afilado que eso, y conviene saberlo antes de perder una hora:

**Los archivos se revierten a versiones anteriores, incluso a mitad de una
edición.** Pasó dos veces el 1 de septiembre:

- `docs/plan-control-final.md` perdió la **§11 entera** (de 727 a 421 líneas).
  Se recuperó de `5e756f2` y se injertó sobre el archivo de ese momento, para
  no perder a cambio lo que `b9b333a` había añadido a la §10.
- `src/pages/api/presentacion.ts` se revirtió **entre dos ediciones seguidas**:
  los imports y el `GET` sobrevivieron, el `POST` volvió a la versión anterior.
  Quedó una API a medio escribir que compilaba y que `astro check` daba por
  buena.

Lo segundo se detectó **solo porque los tests fallaron**, con `undefined` por
todas partes en respuestas que parecían correctas. De ahí la regla práctica:

- Después de editar, **releer lo editado** en vez de fiarse de que la
  herramienta dijo que aplicó. Un `grep -c` del símbolo nuevo basta.
- **Lo que no tiene test, no se entera.** `tests/presentacion-endpoint.test.ts`
  existe justamente por esto: cubre la costura entre las reglas puras y el
  almacén, que es donde un revert deja el código compilando y mintiendo. Los
  pasos 2 y 3 tocan páginas `.astro`, que no tienen esa red debajo.
- Mirar `git log` al empezar y al terminar. Los commits `ceabae8`, `3227c77`,
  `4744ed7` y `b9b333a` no los hizo quien escribió el código que contienen.

Merece la pena averiguar qué lo genera antes de arrancar el paso 2, que es el
más largo y el que menos protegido está.

---
---

# Pendiente: `/presentacion-end`

Estado a **2 sep 2026**. Tema **independiente** de los dos bloques de arriba:
no comparte código ni plan con `/present-admin` ni con cuentas de cobro.

## De qué va, en cuatro líneas

Página de cierre para compartir DESPUÉS de la sustentación en vivo (no se
proyecta, no toca el sistema de beats de `/presentacion`): cards con links a
la documentación del proyecto, un corte de "en números" sacado en vivo de
`iteraciones-portfolio.ts`, y un cierre de agradecimiento + contacto. Pública,
indexable, con Navbar/Footer y traducida a `/en`.

## Lo que ya está hecho

- `src/pages/presentacion-end.astro` + cascarón `src/pages/en/presentacion-end.astro`.
- Diccionario `presentacionEnd` en `src/i18n/es.ts` y `en.ts` (textos, no los
  hrefs).
- Ruta dada de alta en `TRANSLATED_ROUTES` (`src/i18n/routing.ts`).
- `astro check` sin errores nuevos (siguen los mismos preexistentes de
  siempre) y `tests/i18n-dictionary.test.ts` en verde.

## Lo que falta, en orden

### 1. ⛔ Los links reales de documentación

El usuario los va a pasar aparte. Hoy `DOCS_META` en `presentacion-end.astro`
apunta a rutas ya existentes (`/docs`, `/docs/kanban`, `/architecture`,
`/security`, el repo de GitHub, `/notes`) como placeholder razonable, no como
la lista definitiva. Al recibir los links: actualizar `DOCS_META` (hrefs) y
`t.presentacionEnd.docs` (título/descripción) en `es.ts` **y** `en.ts` a la
vez, o el test de paridad de diccionarios los va a agarrar.

### 2. ⚠️ No se ha visto en navegador (a medias)

Se corrió el dev server: `/presentacion-end` y `/en/presentacion-end` responden
200. **La revisión a ojo sigue pendiente** y la tiene que hacer una persona: la
extensión de Chrome no estaba conectada en la sesión que lo intentó. Queda por
mirar que las tarjetas no se rompan con textos largos, que es lo que solo se ve
cuando lleguen los títulos y descripciones definitivos del punto 1.

Lo que sí se arregló, que era la otra mitad del punto: **las tarjetas y los dos
enlaces del cierre solo tenían estados `hover:`**. Quien navega con teclado se
quedaba con el contorno por defecto del navegador sobre una tarjeta de vidrio
oscuro, que es casi nada. Ahora llevan `focus-visible:` igualado al hover (anillo
cian en la tarjeta, y el punto y la flecha reaccionan igual con
`group-focus-visible:`). El repo corre axe en `/admin/lab/security`, así que era
un hallazgo esperando a ocurrir.

### 3. ✅ Alta en `src/data/documentacion.ts`

**Decidido: sí, entra.** Es **RF-718**, en estado `parcial`.

El argumento que desempató: la duda era si una página del sitio amerita entrada
frente a un requisito del sistema, pero `/presentacion` y `/remote` ya tienen la
suya (RF-714), y son exactamente eso. La convención del repo no distingue entre
las dos cosas: distingue entre entregado y no entregado.

`parcial` y no `implementado` porque los hrefs de hoy son un marcador razonable
y no la lista final (punto 1), y porque falta la revisión a ojo (punto 2). El RF
deja escrito qué falta, que es justo para lo que sirve ese estado.

## Gotchas de este módulo

- Los `docs` de la página NO salen de `src/data/documentacion.ts`: es un
  array local a propósito, porque el contenido definitivo llega después y se
  reemplaza directo en la página, sin indirección de datos.
- **La ruta tuvo que entrar en `RESERVED_ROOT_SEGMENTS`** y no estaba: es un
  segmento en la raíz y competía con el espacio de los PIN de presentación, así
  que un PIN generado podía coincidir y mandar a quien escaneara el QR a esta
  página en vez de a su deck. Lo cazó `tests/present-pin.test.ts`, que es la red
  que existe justamente para esto. Cualquier página raíz nueva pasa por ahí.
- Las estadísticas de "en números" son en vivo, no cifras escritas a mano:
  cuentan sobre `ITER_PF.flatMap(i => i.historias)` filtrando por
  `col === 'aceptada'`. Si el kanban de `iteraciones-portfolio.ts` crece, la
  página no necesita tocarse.

---
---

# Lo que se cerró y lo que no (2 sep, sesión de cierre)

Un solo sitio para ver el estado de los tres bloques después de esta sesión.
**Todo lo que quedó abierto está abierto por una razón**, y en los tres casos la
razón es la misma: hace falta una persona, no más código.

## Entregado

| Bloque | Qué |
|---|---|
| `/present-admin` | Paso 1 (scroll absoluto en la API), Paso 2 (la página entera, seis capas), Paso 4 (RF-717, runbook §3 bis, §11 y §12 marcadas) |
| Cuentas de cobro | Punto 1: las cuatro cosas sin documentar, repartidas en RF-308, RF-311 y RNF-29, más §4 bis y §7 del plan |
| `/presentacion-end` | Punto 3 (RF-718) y la mitad del punto 2 (estados de foco de tarjetas y enlaces) |
| De propina | `present-admin` **y** `presentacion-end` registradas en `RESERVED_ROOT_SEGMENTS`; a la segunda le faltaba desde antes y competía con el espacio de los PIN |

`npx vitest run`: **1714 en verde**. `npx astro check`: **7 errores, los siete
preexistentes de siempre** (`payments/webhook.ts`, `docs/presentacion.astro`,
`tests/indexnow.test.ts`). El listón era no subir de siete.

## No entregado, y por qué

| Qué falta | Por qué no se hizo | Quién puede |
|---|---|---|
| **Paso 0**: medir `final.html` en un teléfono de gama baja | Es una compuerta de diseño, no una verificación. Necesita un teléfono prestado y el WiFi del salón | solo una persona |
| **Paso 3**: `/presentacion` como seguidor puro | Detrás del paso 0. Si sale "sala no", se cae entero, y construirlo antes es tirarlo | tras el paso 0 |
| **Parametrizar `client-sync.ts`** | Su único consumidor es el paso 3. Tocar un módulo que sostiene tres charlas en producción para dejarlo esperando sería arriesgar lo que funciona | tras el paso 0 |
| **Paso 5**: los nueve puntos de §11.9 | Piden `/presentacion` en dos equipos distintos, uno un teléfono, y cortar el bus a propósito | solo una persona |
| **Credenciales del bus en producción** | Es un `vercel env ls`, no código. Confirmar antes `cat .vercel/project.json`: el que sirve el dominio es `dev-portfolio`, no `portfolio` | solo una persona |
| **Validación contable** de tarifas, bases UVT y UVT | Lo tiene que confirmar un contador. Ya hay una cuenta emitida a un cliente real, así que ya no es preventivo | un contador |
| **Los tres parámetros** `uvt_cents`, `smmlv_cents`, `ret_reteica_por_mil` | Es configuración en `app_settings` (`/admin/settings`), no repo. Ninguno urgente, y el tercero está apagado a propósito | solo una persona |
| **Fase 4** (envío) y **artículo en `/notes`** | Los dos marcados como opcionales y con la decisión razonada en su sitio | cuando se quiera |
| **Los links reales** de `/presentacion-end` | El usuario los pasa aparte. Al llegar se tocan DOS sitios a la vez: `DOCS_META` y `presentacionEnd.docs` en `es.ts` **y** `en.ts`, o el test de paridad los agarra | solo una persona |
| **Ver `/presentacion-end` en el navegador** | La extensión de Chrome no estaba conectada. El dev server sí se corrió: la ruta y su gemela en `/en` responden 200 | solo una persona |

## La regla de operación que sale de todo esto

Mientras el paso 3 no se haga, **`/present-admin` y `/presentacion` no se abren
a la vez**: serían dos escritores de la misma clave y la presentación iría y
vendría sola. Para conducir, `/present-admin`. Está en el runbook.
