# Plan: Cotiza, consultoría con alcance que no se descontrola

> Requisitos: RF-220 a RF-224 en `src/data/documentacion.ts` (estado `planeado`).
> Relacionados: `docs/plan-plano.md` (cláusulas, reglas de pago, versiones
> congeladas), `docs/plan-asistente.md` (motor de IA del panel),
> `src/lib/sustentacion/acceso.ts` (la puerta por contraseña que sirve de
> modelo para el PIN).

## Qué es

Una herramienta del panel para cotizar y llevar los encargos de **consultoría
en logística, comercio exterior, compras y operaciones** (los 8 años de
experiencia de Mike antes del software). Se entra por `/cotiza`, que redirige a
`/admin/cotiza`. Con la sesión admin abierta se entra directo; sin sesión, con
un PIN de 4 dígitos que solo abre este módulo.

## El problema que resuelve

Lo que empieza como "ayúdame con unas presentaciones y revísame unos
documentos" termina en reuniones de una hora que nunca se pactaron, mensajes a
cualquier hora y pedidos nuevos justificados con "eso lo hablamos". Además, el
precio tiene que quedar definido al inicio: subirlo a mitad de camino es mala
práctica y daña la relación.

## Método (las cinco reglas que la herramienta hace cumplir)

1. **Se cotizan entregables contables, no "ayuda".** "2 presentaciones de hasta
   15 diapositivas", "revisión de hasta 5 documentos de hasta 20 páginas".
2. **Lo incluido son cupos**, y la herramienta los descuenta.
3. **Lo que no está escrito no está pactado.** Tras cada llamada sale un
   resumen escrito; el cliente tiene 1 día hábil para corregirlo y, si no lo
   hace, vale lo escrito.
4. **El precio base nunca se toca.** Lo nuevo entra como **adicional**, con un
   precio que sale de la tarifa ya pactada en la propuesta, y se aprueba por
   escrito **antes** de hacerlo.
5. **Fuera de horario cuesta más**, y ese recargo también va pactado desde el
   inicio.

La "calculadora" no ajusta el precio pactado: muestra **precio base congelado +
adicionales aprobados + consumo de cupos**. Cuando un cupo se agota, el
siguiente uso se propone solo como adicional.

## Tarifas (COP por hora)

Datos de Mike (6 oct 2026): consultoría en logística y operaciones entre
$60.000 y $80.000 según la complejidad del entregable; presentaciones y
revisión de documentos a $50.000.

| Nivel | Tarifa | Ejemplos |
|---|---|---|
| Documental | $50.000 | Elaboración de presentaciones, revisión de documentos |
| Operativa | $60.000 | Procedimientos, apoyo puntual en compras o proveedores |
| Analítica | $70.000 | Costeo de importaciones, análisis de fletes, indicadores |
| Estratégica | $80.000 | Optimización de procesos, rediseño de la cadena de suministro, reducción de costos de envío |

En dólares hay **una sola tarifa: US$35 por hora para cualquier asesoría**,
sin niveles (decisión de Mike, 6 oct 2026). Es independiente de los pesos,
nunca una conversión. El colchón, el recargo de urgencia y el redondeo hacia
arriba (a US$50) se aplican igual.

> Propuesta: el reparto de 60/70/80 entre los tres niveles lo propuse yo a
> partir del rango que dio Mike. **Pendiente de confirmar.**

Cada encargo **congela** la tabla de tarifas vigente al enviarse (mismo
principio 4 de Plano): cambiar las tarifas no reescribe un encargo aceptado, y
los adicionales de ese encargo se cobran con la tarifa congelada.

### Horas por entregable (tabla inicial)

| Entregable | Horas | Regla |
|---|---|---|
| Presentación | 1 h | Hasta 10 diapositivas, sin anexos, hasta 3 documentos fuente |
| Presentación | 2 h | Más de 10 diapositivas, con anexos o más de 3 documentos fuente |
| Presentación grande | +1 h | Por cada 10 diapositivas por encima de 20 |
| Revisión de documentos | 1 h | Por cada 3 documentos de hasta 20 páginas (propuesta, pendiente) |

Los entregables de los niveles operativo, analítico y estratégico se cotizan en
horas que escribe Mike (o que sugiere la IA desde la tabla), no por fórmula: son
demasiado distintos entre sí para una regla fija. La tabla crece con el uso.

### Reglas de precio

- Precio = horas × tarifa del nivel + **colchón de coordinación del 15 %**
  (correos y llamadas cortas que hoy no se cobran; configurable).
- Redondeo hacia arriba a $50.000 (regla general de tarifas).
- Cotización válida 15 días.
- Plan de pagos: las reglas de Plano por monto (hasta $1.500.000, 50/50).
- Descuentos: solo los decide Mike.

## Cupos incluidos por defecto (aprobados por Mike el 6 oct 2026)

- 2 reuniones de 45 minutos.
- 2 rondas de cambios por entregable.
- Atención de lunes a viernes de 8:00 a 18:00 (festivos de Colombia fuera),
  respuesta en 1 día hábil.
- Recargo del 50 % por urgencias fuera de ese horario.
- Resumen escrito de cada reunión, con 1 día hábil para corregirlo.

Una reunión de más se cobra a la tarifa del encargo en bloques de 30 minutos
(propuesta, pendiente). Los cupos son editables por encargo.

## Qué hace la IA

Regla heredada de Plano: **la IA nunca pone cifras**. Elige entregables de la
tabla, propone horas desde ella y redacta; el motor calcula. La guardia de
cifras de `lib/asistente/guardia.ts` revisa todo texto de la IA.

1. **Pedido → alcance.** Del mensaje, el correo o las notas del cliente saca
   entregables con cantidades, exclusiones, supuestos y las preguntas que hay
   que hacer **antes** de cotizar (cuántas diapositivas, cuántos documentos, de
   cuántas páginas, para cuándo).
2. **Clasificador de solicitudes.** Compara un pedido nuevo con el alcance
   firmado y dice: dentro del alcance, consume un cupo, o adicional. Redacta la
   respuesta amable y, si toca, la orden de cambio.
3. **Resumen de reunión.** Desde las notas de Mike, el resumen para el cliente
   con lo acordado y lo que queda fuera.

Corre sobre el motor del asistente (`lib/asistente/motor-api.ts`). Si falta
`ANTHROPIC_API_KEY` o el modelo falla, la herramienta funciona igual a mano.

## Acceso con PIN (RF-220)

Modelo: `src/lib/sustentacion/acceso.ts`. Una llave aparte que abre una lista
cerrada de rutas y ninguna más.

- **Sesión admin abierta:** entra directo, sin PIN.
- **Sin sesión:** `/cotiza/entrar`, pantalla propia (no `/login`).
- **El PIN:** 4 dígitos, decisión de Mike. Se guarda solo su hash (scrypt con
  sal) en `app_settings`, se cambia desde el panel con sesión completa y sin
  redesplegar. Sin PIN configurado, la puerta **no existe**.
- **Cookie** `cotiza_acceso`, firmada con HMAC, 12 horas. Lleva la versión del
  PIN: cambiarlo invalida todas las cookies emitidas.
- **Freno por IP:** 5 fallos, 15 minutos bloqueado (rate limit durable).
- **Freno general:** 4 dígitos son 10.000 combinaciones, así que el freno por IP
  no basta contra un intento repartido entre muchas IP. Con 10 fallos en una
  hora, sumando todas, la puerta del PIN se apaga una hora y llega un aviso por
  ntfy. GitHub sigue funcionando.
- **Falla cerrada.** Es autorización, no observabilidad (misma excepción que la
  revocación de sesiones): si no se puede leer el hash o el contador, el PIN no
  abre. Nunca afecta la entrada con GitHub.
- **Micro-SIEM:** los fallos son `cotiza.pin_failed` (se suman a
  `ADMIN_ACCESS_FAILURE_RULES`) y las entradas buenas son `cotiza.pin_access`
  con categoría `admin_action`, que ya es de rastro (igual que la entrada a la
  sustentación); no hizo falta una categoría nueva.
- **Aviso por ntfy en cada entrada con PIN** (prioridad baja): si alguien más
  lo sabe, Mike se entera en el momento y no al revisar el SIEM.
- **PIN triviales rechazados al fijarlo:** repetidos (0000), escaleras (1234,
  9876) y parejas (1212). Con cuatro dígitos, los frenos solo sirven si el PIN
  no está entre los primeros que prueba cualquiera.

### Aislamiento

- Rutas que abre el PIN: `/admin/cotiza`, `/admin/cotiza/<id>` y
  `/api/admin/cotiza/*`. Se comparan con patrones anclados y con test, no con
  `startsWith('/admin/cotiza')`, que abriría `/admin/cotizaciones` el día que
  existiera.
- Cualquier otra ruta de `/admin` con esa cookie y sin sesión va a `/login`
  como si no hubiera nada.
- Con el PIN, el layout no muestra el menú del panel ni la caja del asistente.
- **Solo con sesión completa:** convertir un encargo en cliente, proyecto o
  cuentas de cobro, cambiar el PIN y editar la tabla de tarifas. Con el PIN se
  cotiza, se registra y se usa la IA (con su propio rate limit).
- `/en/cotiza` da 404, como toda ruta privada.

## Enlace del cliente (RF-224)

`/acuerdo/<token>` (nombre provisional): la propuesta, los cupos que le quedan,
la bitácora de solicitudes y los adicionales pendientes con **Aprobar** o
**Rechazar**. Cada aprobación queda con constancia: fecha, versión y huella
SHA-256 de lo aprobado, igual que la aceptación de Plano. `Cache-Control:
no-store`, token guardado solo como hash y rate limit por ruta.

## Datos (migración aditiva)

- `cotiza_encargos`: cliente (nombre, empresa, contacto), estado (borrador,
  enviado, aceptado, en curso, cerrado), tarifas y cupos congelados, versión con
  huella, hash del token.
- `cotiza_entregables`: tipo, parámetros (diapositivas, documentos, páginas),
  nivel, horas.
- `cotiza_solicitudes`: fecha, canal, texto, clasificación (dentro, cupo,
  adicional), fuera de horario sí/no.
- `cotiza_reuniones`: fecha, minutos, resumen, plazo de corrección.
- `cotiza_adicionales`: horas, nivel, recargo, monto congelado, estado
  (propuesto, aprobado, rechazado) y constancia.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 0 | Puerta con PIN, redirección de `/cotiza`, layout aislado, tests de que el PIN no abre nada más | ✅ 6 oct 2026 |
| 1 | Motor puro de alcance, cupos, adicionales y precio (`src/lib/cotiza/`), con tests sin base de datos | ✅ 6 oct 2026 |
| 2 | Migración, encargos, bitácora de solicitudes y reuniones, consumo de cupos | ✅ 6 oct 2026 (0045 aplicada en Turso) |
| 3 | IA: pedido → alcance, clasificador, resumen de reunión | ✅ 6 oct 2026 (probada con el modelo real) |
| 4 | Enlace del cliente y aprobación de adicionales | ✅ 6 oct 2026 (0046 aplicada en Turso) |
| 5 | Requisitos promovidos en `/docs`, nota en `/notes` | ✅ 6 oct 2026 |

## Fase 0 entregada (6 oct 2026)

- `src/lib/cotiza/acceso.ts`: alcance (patrones anclados), cookie firmada con
  la versión del PIN, frenos y forma del PIN. Puro, lo carga el middleware.
- `src/lib/cotiza/pin-db.ts`: hash en `app_settings` (`cotiza_pin`, scrypt de
  `lib/portal/passwords.ts`), contadores propios en `rate_limit_buckets`
  (`cotiza-pin:ip:*`, `cotiza-pin:global`, `cotiza-pin:cierre`). No usa
  `enforceLimit` porque ese limitador es fail-open y esta puerta no puede serlo.
  Caché de 30 s del PIN por instancia para no leer la base en cada clic.
- `src/middleware.ts`: sin sesión y en ruta de Cotiza, la cookie del PIN pone
  `locals.cotizaPin`; sin nada, las páginas van a `/cotiza/entrar` y las APIs
  reciben 401. Con sesión admin la cookie ni se mira.
- `/cotiza` (atajo), `/cotiza/entrar` (pantalla propia, el cuarto dígito envía
  solo), `/api/cotiza/pin`, `/api/cotiza/salir` (POST, no GET),
  `/admin/cotiza` con `CotizaLayout` (sin sidebar, paleta ni asistente) o
  `AdminLayout` según la puerta, y la sección "Acceso a Cotiza con PIN" en
  `/admin/settings` (activar, cambiar, quitar, reabrir tras un cierre) sobre
  `/api/admin/settings/cotiza-pin`.
- `cotiza` reservado en `lib/present/reserved.ts` (lo cazó el test de rutas
  raíz) y `/cotiza` privado para i18n: `/en/cotiza` da 404.
- Verificado: `tests/cotiza-acceso.test.ts` y `tests/cotiza-pin-db.test.ts`
  (30 casos), y un recorrido real contra el dev server con base libSQL local
  (34 comprobaciones: con PIN, `/admin`, `/admin/settings`, `/admin/plano`,
  `/admin/cotizaciones`, `/cobrar` y las APIs del panel rebotan; cambiar el PIN
  saca la cookie vieja; el sexto intento de una IP se frena aun con el PIN
  correcto; el décimo fallo global apaga la puerta para una IP limpia mientras
  GitHub sigue entrando; Ajustes la reabre). Capturas en escritorio y móvil.
- Nota: el CSS de la paleta del panel viaja en el HTML de la vista con PIN
  (Astro empaqueta los estilos de todo componente importado, y la página
  importa `AdminLayout` para la otra puerta). Es solo CSS, sin datos.
- Gotcha de verificación: en Chromium headless de esta máquina, cualquier
  `location.assign` deja la pestaña en 0 fps (pasa también entre dos páginas
  públicas). Las capturas tras entrar se toman en una pestaña nueva.

## Fase 1 entregada (6 oct 2026)

`src/lib/cotiza/motor.ts`, puro e isomorfo (la vista podrá recalcular en el
navegador lo mismo que el servidor). Reglas en `src/data/cotiza.ts`
(`REGLAS_COTIZA`, `HORAS_ENTREGABLE`).

- **Entregables:** `presentacion` (1 h básica, 2 h con más de 10
  diapositivas, anexos o más de 3 documentos de base, +1 h por cada 10
  diapositivas por encima de 20, `cantidad`), `revision` (un documento largo
  pesa como varios de 20 páginas; 3 por hora) y `libre` (horas de Mike en
  medias horas, con nivel). Cada línea explica su regla en texto.
- **Precio:** horas × tarifa del nivel + 15 % de colchón, redondeado hacia
  arriba a $50.000 / US$50, nunca por debajo del mínimo. Las tarifas se pueden
  pasar congeladas: una propuesta enviada se recalcula con las suyas.
- **Plan de pagos:** los tramos de Plano por monto (`tramoPara` y `repartir`
  de `lib/plano/pagos.ts`, no un reparto paralelo), con conceptos de
  consultoría: "Al aceptar la propuesta", "Con la primera entrega", "Al
  entregar todo".
- **Cupos:** las reuniones se cuentan en orden; las primeras ocupan los cupos
  y lo que pase de 45 min (+5 de gracia) es adicional; las siguientes son
  adicionales completas. Las rondas se cuentan por entregable.
- **Adicionales:** tarifa congelada × horas, +50 % si llegó fuera de horario,
  **sin colchón** (ya es trabajo medido), redondeados a $5.000 / US$5. Las
  reuniones de más, en bloques de 30 minutos y al nivel del encargo (el de más
  horas; en empate, el más alto). Las rondas de más las estima Mike en horas.
- **`totalVigente`:** precio base intacto + aprobados; los propuestos se
  informan y no se suman.
- **Horario:** `fueraDeHorario` mira la hora de Bogotá (no la del servidor, que
  corre en UTC), fines de semana y festivos de Colombia. `plazoCorreccion` da
  el día hábil hasta el que se corrige el resumen de una reunión.
- Verificado: `tests/cotiza-motor.test.ts` (29 casos con cifras calculadas a
  mano), pasando con `TZ=UTC`, `America/Bogota` y `Asia/Tokyo`.

Decisiones de esta fase que Mike puede cambiar (todas en `src/data/cotiza.ts`):
el redondeo de los adicionales a $5.000, los 5 minutos de gracia, que los
adicionales no lleven colchón y el nivel con que se cobran las reuniones.

## Fase 2 entregada (6 oct 2026)

- **Migración `drizzle/0045_low_dormammu.sql`**, solo `CREATE TABLE` y
  `CREATE INDEX`: `cotiza_encargos`, `cotiza_solicitudes`, `cotiza_reuniones`,
  `cotiza_rondas`, `cotiza_adicionales`. **Pendiente: aplicarla en Turso
  (principal y demo).** Sin ella, `/admin/cotiza` carga y avisa que falta.
- **`src/lib/cotiza/encargo.ts`** (puro): configuración, normalización de lo
  que manda el navegador, faltantes para congelar (título, cliente, un
  entregable y **al menos una exclusión**: sin "no incluye" escrito no hay
  con qué decir después "eso no estaba"), máquina de estados y lectura de la
  hora del formulario como hora de Bogotá.
- **Estados:** borrador → enviado → aceptado → cerrado; borrador y enviado se
  descartan; reabrir solo antes de aceptar. Las transiciones son
  condicionales (`WHERE estado = ...`): dos clics cruzados chocan con 409.
- **`src/lib/cotiza/db.ts`:** al congelar, el servidor recalcula con el motor y
  guarda el resultado completo (tarifas, cupos y reglas del día) con su huella
  SHA-256 (`huellaSnapshot` de Plano). Las notas privadas no se congelan.
  Cada anotación de la bitácora va en una transacción con su adicional:
  - pedido clasificado como adicional → adicional con recargo si llegó fuera
    de horario (lo decide la hora del pedido en Bogotá, no una casilla);
  - reunión que no cabe o se alarga → adicional en bloques de 30 min al nivel
    del encargo; los cupos se gastan en el orden en que se anotan;
  - tercera ronda de un entregable → exige las horas de Mike y nace adicional.
  Aprobar o rechazar es una sola vez y con el encargo en el `WHERE`.
- **Endpoints:** `POST /api/admin/cotiza/encargos` (alta) y
  `POST /api/admin/cotiza/encargos/<id>` con `{ accion }`. Dentro de las rutas
  que abre el PIN. Rastro en el micro-SIEM solo de lo que cambia el acuerdo.
- **Pantallas:** listado con estado, total vigente y lo que está por decidir;
  ficha con tres caras: editor con precio en vivo (el mismo motor en el
  navegador) y aviso al salir sin guardar, propuesta congelada, y encargo en
  curso con cupos, adicionales, formularios para anotar y bitácora.
- **Textos para copiar a WhatsApp:** la propuesta completa (incluye, no
  incluye, supuestos, cupos, tarifa de adicionales, recargo, pagos y
  vigencia), el mensaje de cada adicional pidiendo aprobación antes de
  empezar, y el resumen de cada reunión con su plazo de corrección. Mientras
  llega el enlace del cliente (Fase 4), la aprobación del cliente la marca
  Mike.
- Verificado: `tests/cotiza-encargos.test.ts` (20 casos, con las tablas
  creadas por el SQL real de la migración y el reloj fijo) y un recorrido en
  el navegador con PIN contra base local: editor → $850.000 en vivo →
  congelado por el servidor → aceptado → pedido de noche con recargo
  ($210.000) → reunión larga y reunión extra como adicionales → aprobación.
  Capturas en escritorio y móvil.

## Fase 3 entregada (6 oct 2026)

- **`src/lib/cotiza/ia.ts`** (puro): prompts, esquemas y validación de los tres
  usos. La llamada reutiliza `pedirJson` de `lib/plano/ia/motor.ts` (Opus 5.5,
  salida con esquema, prompt de sistema en caché, `fallbacks: "default"`).
- **Pedido → alcance** (borrador): entregables contables, exclusiones,
  supuestos y hasta 6 preguntas para el cliente. Se SUMA al borrador guardado
  (no borra nada de lo que Mike escribió; la moneda solo la decide si aún no
  hay entregables). Las preguntas y las citas verificadas quedan en las notas
  privadas.
- **Clasificador** (encargo en curso): dentro, cupo o adicional, con la cita
  del alcance que lo sustenta y un borrador de respuesta para WhatsApp. Llena el
  formulario de pedido; el precio estimado lo calcula el motor con las tarifas
  congeladas y el recargo si el pedido llegó fuera de horario. Anotar sigue
  siendo un clic de Mike.
- **Resumen de reunión**: ordena las notas sueltas en acordado, pendientes y
  lo que quedó por fuera del alcance. Reemplaza el texto del formulario con
  opción de deshacer.
- **Garantías en código:** citas literales (las inventadas se descartan), y la
  guardia de cifras (`lib/asistente/guardia.ts`) quita todo texto con dinero
  que no estuviera en lo que pegó Mike. Los esquemas no tienen campos de
  dinero.
- **Gasto:** sin tope diario, por decisión de Mike (6 oct 2026). Queda el límite
  de 20 llamadas por hora por IP. Cada respuesta muestra lo que costó.
- **Errores:** un 400 de la API (como el límite de uso de la cuenta) ahora dice
  "la API rechazó la solicitud" en vez de "no respondió", también en Plano.
- Verificado: `tests/cotiza-ia.test.ts` (14 casos con salidas fingidas,
  incluidas citas y cifras inventadas) y un recorrido en el navegador contra
  una API falsa con respuestas realistas: 4 entregables desde un pedido,
  $1.100.000 congelado, clasificación de un pedido de noche como adicional
  ($315.000 con recargo) y resumen con la línea de dinero inventado quitada.
- **Probada con el modelo real** el 6 oct 2026, después de que Mike subió el
  tope de gasto de la cuenta de Anthropic a US$50 al mes: alcance US$0,060,
  clasificación US$0,027, resumen US$0,021. Del pedido salieron 4 entregables
  con sus citas verificadas, 6 exclusiones y 6 preguntas; el pedido de noche se
  clasificó como adicional citando la exclusión exacta.
- **Ajuste tras la prueba real:** la IA inventó un supuesto ("una ronda de
  ajustes por entregable") que contradecía los cupos y escribió supuestos
  dirigidos a Mike ("recibes..."), cuando los lee el cliente. El prompt ahora
  le prohíbe escribir sobre reuniones, rondas u horario (lo fijan los cupos) y
  le pide tercera persona. Repetido con el modelo: corregido.

## Fase 4 entregada (6 oct 2026)

- **Migración `drizzle/0046_woozy_dark_phoenix.sql`**, solo `ADD COLUMN` y un
  índice único: token del enlace (huella SHA-256 y copia cifrada), visitas,
  constancia de aceptación y quién decidió cada adicional. **Pendiente:
  aplicarla en Turso (principal y demo) después de la 0045.**
- **`src/lib/cotiza/enlace.ts`:** el token (128 bits) se busca por su SHA-256 y
  se guarda cifrado con la clave de la bóveda para que Mike lo vuelva a copiar;
  nunca en claro. Generar uno nuevo mata el anterior. Reabrir la propuesta la
  oculta del enlace hasta que se vuelva a congelar.
- **`/acuerdo/<token>`** (pública, noindex, sin caché, 60 solicitudes por
  minuto por IP, 404 bajo `/en`): propuesta, qué no incluye, cupos con lo
  usado, valor y pagos, resúmenes de reunión con su plazo de corrección y los
  adicionales por aprobar arriba de todo. Nunca las notas privadas ni los
  pedidos internos.
- **Aceptación del cliente:** nombre, cédula o NIT y casilla; vence a los 15
  días del envío. La página manda la huella de la propuesta que mostró: si
  Mike la cambió mientras tanto, no se acepta. Constancia SHA-256 recalculable.
- **Adicionales:** el cliente aprueba o rechaza cada uno con su nombre; se
  aprueba el monto que vio (va en el `WHERE`) y queda constancia. Lo que Mike
  marca desde el panel queda como "marcado por ti".
- **Avisos:** ntfy en cada aceptación y en cada decisión del cliente.
- **Panel:** tarjeta "Enlace del cliente" (copiar, generar uno nuevo, veces que
  se abrió, constancia de aceptación) y los textos para WhatsApp de la
  propuesta y de cada adicional ya traen el enlace.
- Verificado: `tests/cotiza-enlace.test.ts` (14 casos con el SQL real de 0045
  y 0046) y un recorrido en el navegador: el cliente sin sesión acepta y
  aprueba un adicional, Mike ve ambas constancias, el enlace no abre el panel,
  token inventado y `/en/acuerdo` dan 404. Capturas en celular.
- Hallazgo local: la `ENCRYPTION_KEY` del `.env` llega al servidor de
  desarrollo con 61 caracteres (no 64), así que localmente no se puede cifrar
  (tampoco la bóveda). En producción manda la de Vercel. Sin clave válida el
  enlace funciona igual; solo no se puede volver a copiar.

## Fase 5 entregada (6 oct 2026)

- Nota `/notes/el-precio-pactado-no-se-toca` y `/en/notes/the-agreed-price-does-not-move`,
  con su decisión en el frontmatter. Por OPSEC no publica tarifas, rutas del
  panel ni los umbrales de los frenos del PIN.
- RF-220 a RF-224 implementados en `src/data/documentacion.ts`; iteración
  `pf-cotiza` (Fase 53, seis historias) en `src/data/iteraciones-portfolio.ts`,
  con lo que falta marcado como pendiente.

## Dictado por voz (6 oct 2026)

Pedido de Mike: un micrófono para redactar. Botón "Dictar" debajo de los
campos largos de la ficha (pedido para la IA, exclusiones, supuestos, notas
privadas, qué pidió el cliente y resumen de reunión).

- `src/lib/cotiza/dictado.ts`: reconocimiento de voz del navegador (Web Speech
  API, `es-CO`), sin servicio de pago ni dependencias. Chrome, Edge y Safari;
  en Firefox el botón no aparece. Escribe donde está el cursor, cuida espacios
  y mayúsculas, y entiende "coma", "dos puntos", "punto" (solo al final de una
  frase: "punto de venta" es una palabra), "nueva línea", "punto y aparte" y
  "signo de pregunta". Se reanuda solo si Chrome lo corta tras un silencio; un
  solo campo dicta a la vez.
- **Privacidad:** en Chrome y Edge el audio lo transcriben Google o Microsoft.
- **Permiso:** `Permissions-Policy` abre `microphone=(self)` solo en las páginas
  de Cotiza (`esRutaDeCotiza`); el resto del sitio sigue en `microphone=()`.
- Verificado: `tests/cotiza-dictado.test.ts` (12 casos) y un recorrido en el
  navegador con un reconocimiento falso: el permiso por página, los botones,
  el texto dictado con puntuación, detener y que el borrador detecte el cambio.
  Encontró un error real (sin mayúscula después de un salto de línea), corregido.

## Pendientes de Mike

1. Confirmar el reparto 60/70/80 entre los niveles operativo, analítico y
   estratégico.
2. ~~Tarifas en dólares~~: resuelto, US$35/h para cualquier asesoría.
3. Horas de la revisión de documentos (propuesta: 1 h por cada 3 documentos de
   hasta 20 páginas).
4. Reunión adicional en bloques de 30 minutos, ¿sí o no?
5. Mínimo por encargo (hoy una presentación de 1 h da $57.500 con el colchón,
   que el redondeo sube a $100.000).
6. ¿Cobrar el anticipo con Wompi desde el enlace, como Plano, o solo por
   transferencia?
7. ~~Aplicar las migraciones 0045 y 0046 en Turso~~: aplicadas en principal y demo el 6 oct 2026.
8. ~~Límite de la cuenta de Anthropic~~: subido a US$50 al mes por Mike; IA de Cotiza y de Plano probadas con el modelo real el 6 oct 2026.
9. Revisar la `ENCRYPTION_KEY` del `.env` local (llega con 61 caracteres).
