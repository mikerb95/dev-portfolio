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

58 tests de presentación en verde.

## Lo que falta, en orden

### Paso 0. La compuerta, y va primero

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

### Paso 1. Cerrar el lado de escritura de la API

Queda **una sola cosa**: la escritura de **scroll absoluto** para la rueda del
ratón (§11.5.3). Hoy solo existen `subir` y `bajar`, que van a saltos de un
tercio de pantalla, así que la rueda de `/present-admin` no tiene por dónde
entrar. Acota contra la geometría publicada igual que las otras dos.

El acotado de dos escrituras por segundo va en el **cliente**, no en el
servidor: el servidor no debe descartar en silencio lo que le mandan.

Archivo: `src/pages/api/presentacion.ts`. Se prueba con `curl` contra el dev
server.

### Paso 2. `/present-admin`, que no existe

`src/pages/present-admin.astro`. Es el grueso. Se entrega por capas, cada una
comprobable a ojo antes de seguir:

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
construcción. `Cache-Control: no-store`, `noindex, nofollow`, fuera de sitemap.

### Paso 3. `/presentacion` pasa a seguidor puro

Solo si el paso 0 dio "sala sí".

Hoy sigue teniendo **siete llamadas a `reportar`**. Hay que dejarlo en cero
`POST` y engancharlo al canal, con rescate a 3 s y solo lectura.

Conserva su `pointer-events: none`, que ahora tiene un motivo más: que un
asistente no desincronice su propia copia sin entender por qué.

### Paso 4. Documentación

- **RF-716** en `src/data/documentacion.ts`. Un feature entregado que no aparece
  en `/docs` no existe para la sustentación.
- **`docs/runbook-sustentacion.md`**, sin tocar desde el 28 de agosto: el
  montaje real y la regla del login de demo.
- Marcar **§11 y §12** de `docs/plan-control-final.md` al cerrar.

### Paso 5. Verificación en vivo

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
igual. Sigue sin parametrizar.

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

### 1. Sincronizar la documentación

**Es lo único que choca con la convención del repo** (`CLAUDE.md`: un feature
entregado que no aparece en `/docs` no existe para la sustentación). Cuatro cosas
se entregaron después de escribir los RF y no están en
`src/data/documentacion.ts` ni en el plan:

- La dirección del documento (`SEÑORES` / `DEBE A`) y por qué el orden es
  contraintuitivo.
- El alta de deudor desde el propio flujo de creación.
- El anclaje de fechas a zona de Colombia, con las dos clases de fecha.
- Que la razón social manda sobre el nombre de contacto de la ficha.

Además el plan sigue diciendo que faltan los datos del emisor, que ya están.

### 2. Validación contable de la parametrización

Lo único que separa "funciona" de "se puede emitir con confianza". Las tarifas,
las bases en UVT y el valor de la UVT los tiene que confirmar un contador. Pesa
más que antes: ya hay una cuenta emitida a un cliente real.

### 3. Tres parámetros sin configurar (caen a valores por defecto)

| Clave | Efecto de que falte | Urgencia |
|---|---|---|
| `uvt_cents` | usa la UVT 2026 correcta ($52.374) por defecto | baja |
| `smmlv_cents` | no se muestra el piso del IBC en el detalle | baja |
| `ret_reteica_por_mil` | ReteICA apagado, no se practica | ninguna, es deliberado |

### 4. Fase 4: envío (opcional)

Reutilizaría `lib/notify.ts` o la plantilla de WhatsApp de `cobros.ts`, más el
vínculo opcional con un pago de `/cobrar`. Se dejó fuera a propósito:
automatizar el envío antes de saber cómo lo pide cada cliente es construir sobre
una suposición. Hoy el PDF se descarga y se manda a mano.

### 5. Artículo en `/notes` (opcional)

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
