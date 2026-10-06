# Plan: Plano, el cotizador a la medida

> Requisitos: RF-214 a RF-218 en `src/data/documentacion.ts`.
> Relacionados: `docs/plan-asistente.md` (RF-211, mismo motor de precios),
> `docs/plan-cuentas-de-cobro.md`, `docs/plan-cobrar.md` (links firmados y
> Wompi), `docs/plan-portal-clientes.md`.

## Qué es

Una herramienta del panel (`/admin/plano`) para armar la propuesta de un
proyecto a la medida del cliente. Mientras se configura:

- el precio se recalcula en vivo y se muestra como un **rango que se cierra**
  a medida que se responden las preguntas de cada componente;
- salen **tres versiones** (Esencial, Recomendada, Completa) de la misma
  configuración;
- se arma el **plan de pagos** según el monto, con fechas hábiles reales;
- se eligen las **cláusulas** que aplican, en versión formal y "en cristiano";
- se fija el **mapa de contacto**: quién decide, quién paga, canal, horario y
  tiempos de respuesta.

La propuesta se le envía al cliente como un **enlace privado** donde puede mover
las perillas que Mike habilite, ver qué cambió entre versiones, aceptarla con
constancia y pagar el anticipo. Al entrar el anticipo, la propuesta se convierte
sola en cliente, proyecto, hitos y cuentas de cobro en borrador.

## Principios (no negociables)

1. **Un solo motor de precios.** Plano calcula con
   `src/lib/asistente/calculo-cotizacion.ts` y `src/data/tarifario.ts`, los
   mismos que usan `/paginas-web`, el asesor público y el cotizador del
   asistente. Si Plano tuviera su propio cálculo, el sitio y la propuesta le
   dirían cifras distintas al mismo cliente.
2. **La IA nunca pone precios ni redacta cláusulas.** Elige componentes de la
   tabla, cita al cliente y señala ambigüedades. Las cifras salen del motor y
   las cláusulas de la biblioteca (`src/data/clausulas.ts`). La guardia de
   cifras de `lib/asistente/guardia.ts` revisa todo texto de la IA.
3. **El monto nunca viaja desde el navegador.** Ni en el panel ni en el enlace
   del cliente: el servidor recalcula la propuesta desde la configuración y
   firma el checkout con la cifra que calculó él (mismo diseño que `/c/[code]`).
4. **Cada versión enviada queda congelada.** Se guarda el resultado completo
   (no la fórmula) con su huella SHA-256. Cambiar el tarifario en marzo no
   reescribe una propuesta aceptada en enero.
5. **Pagos idempotentes.** El anticipo usa `createPaymentIdempotent` con una
   clave derivada de la propuesta y la versión aceptada: dos clics, un cobro.
6. **Fail-open en lo accesorio, cerrado en lo que cobra.** Si la IA o ntfy
   fallan, la propuesta sigue. Si el recálculo del servidor no cuadra con lo
   que el cliente vio, no se acepta.

## Reglas de pago (aprobadas por Mike el 6 oct 2026)

| Monto (COP) | Pagos | Reparto |
|---|---|---|
| Hasta $1.500.000 | 2 | 50 % al firmar, 50 % al publicar |
| $1.500.000 a $5.000.000 | 3 | 40 % al firmar, 30 % al aprobar el diseño, 30 % al publicar |
| Más de $5.000.000 | 4 | 30 % al firmar, 25 % en el hito 1, 25 % en el hito 2, 20 % al publicar |

Cortes en dólares: US$500 y US$1.700 (tarifas independientes, nunca conversión).

**Cuotas con recargo (activadas, configurables):** solo para proyectos de más de
$3.000.000 (US$1.000). Anticipo del 40 % y el saldo en hasta 4 cuotas mensuales
después de publicar, con recargo del 1,5 % mensual sobre saldo (cuota fija,
sistema francés). El recargo se le muestra al cliente en pesos. Todo es
configurable en `/admin/plano/ajustes` (`app_settings`, clave `plano_reglas`):
activar o no, porcentaje, número máximo de cuotas, monto mínimo, anticipo. La
herramienta compara el recargo con la **tasa de usura** que Mike escribe cada
mes (la publica la Superfinanciera): si la supera o falta el dato, lo avisa.

**Descuento por contado:** casilla con porcentaje que solo escribe Mike. En cero
por defecto.

**Fechas:**
- Cada pago queda atado a un entregable; la fecha mostrada es la estimación del
  hito más 5 días hábiles (sin sábados, domingos ni festivos de Colombia).
- Persona natural: el vencimiento se corre a la quincena siguiente más cercana
  (día 15 o último día del mes, ajustados al hábil anterior).
- Empresa: se registran su día de corte para radicar y sus días de pago; la
  herramienta dice cuándo radicar la cuenta de cobro para llegar a tiempo.
- Las semanas de cada hito salen de las horas de la propuesta y de las horas
  semanales que Mike le puede dedicar (configurable).

## Biblioteca de cláusulas

Cada cláusula tiene versión formal y versión "en cristiano", y regla de cuándo
aplica. Las cifras (rondas, garantía, validez, hosting) salen del tarifario.
Lista completa en `src/data/clausulas.ts`; resumen:

- **Siempre:** alcance y exclusiones, cambios de alcance, rondas de cambios,
  reloj detenido, mora, propiedad, garantía, contenidos del cliente,
  confidencialidad, terminación anticipada, comunicación, validez, aceptación
  electrónica (Ley 527 de 1999), solución de conflictos.
- **Según el proyecto:** hosting y dominio (si hay web), servicios de terceros
  (pagos, facturación, integraciones, tiendas de apps), datos personales
  (Ley 1581 de 2012, si guarda datos de los clientes del cliente), accesos y
  credenciales, cambios de plataformas externas, posicionamiento en Google sin
  garantía, compatibilidad de navegadores, uso de herramientas de IA, cuotas y
  recargo (si se eligen cuotas), cuenta de cobro y retenciones.

Pendiente: revisión única por un abogado (sobre todo propiedad, datos
personales y terminación).

## Arquitectura

```
/admin/plano            listado + nueva propuesta
/admin/plano/[id]       constructor (cálculo en vivo en el navegador)
/admin/plano/ajustes    reglas de pago, recargo, usura, horas semanales
/propuesta/[token]      enlace del cliente (público, noindex, no-store)

src/data/plano.ts            reglas por defecto, preguntas por componente, hitos
src/data/clausulas.ts        biblioteca de cláusulas
src/lib/plano/*.ts           módulos PUROS e isomorfos (corren en el navegador)
src/lib/plano/db.ts          lectura y escritura (solo servidor)
src/lib/plano/hash.ts        huella SHA-256 (solo servidor)
src/lib/plano/conversion.ts  anticipo pagado → cliente, proyecto, hitos, cobros
src/lib/plano/ia/*.ts        del chat al plano, el cliente difícil
```

Datos (migración aditiva):

- `propuestas`: configuración editable, estado, token del enlace, mapa de
  contacto, perillas, aceptación (nombre, documento, fecha, huella), pago del
  anticipo, proyecto creado, gasto de IA.
- `propuesta_versiones`: cada versión congelada (snapshot JSON + SHA-256),
  UNIQUE por propuesta y número.
- `propuesta_horas`: horas reales por componente de una propuesta convertida,
  para calibrar la tabla.

Estados: `borrador → enviada → aceptada → convertida`, más `descartada`. La
vigencia (15 días) se calcula, no se guarda.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 0 | Reglas de pago, calendario, incertidumbre, versiones y cláusulas como módulos puros con pruebas | ✅ 6 oct 2026 |
| 1 | Constructor en el panel, versiones congeladas con huella, PDF, ajustes | ✅ 6 oct 2026 |
| 2 | IA: del chat al plano (con citas verificadas) y el cliente difícil | ✅ 6 oct 2026 |
| 3 | Encaje con tu vida: meses de gasto cubiertos y carga semanal | ✅ 6 oct 2026 |
| 4 | Propuesta viva: enlace del cliente, perillas, diff, aceptación, anticipo | ✅ 6 oct 2026 |
| 5 | De sí a proyecto: conversión al aprobarse el anticipo | ✅ 6 oct 2026 |
| 6 | Aprende: horas reales y sugerencia de colchón por componente | ✅ 6 oct 2026 |
| 7 | Motion, `/docs`, nota en `/notes`, plan al día | ✅ 6 oct 2026 |

## Decisiones tomadas

- **Incertidumbre sin inventar horas.** Cada componente conserva su rango de
  horas aprobado; las preguntas solo eligen una franja DENTRO de ese rango
  (`ajuste` de `cotizarSoftware`). Ninguna respuesta puede sacar un componente
  de la tabla de Mike.
- **Tres versiones por prioridad.** Cada línea se marca esencial, recomendada o
  extra. Descubrimiento y entrega son siempre esenciales.
- **Quincenas por defecto solo para personas.** Una empresa paga por su ciclo
  de tesorería, no por quincena.
- **Cuota fija.** Sistema francés: el cliente ve la misma cuota cada mes, que
  es lo que entiende cualquiera que haya sacado un crédito.
- **Token largo, no código corto.** El enlace lleva 128 bits aleatorios; aun
  así lleva el límite de peticiones de los links de cobro.
- **Opus 5.5 para la IA**, con `fallbacks: "default"`: es uso privado y de bajo
  volumen (unos centavos por propuesta), y la calidad de la lectura del chat
  importa más que el costo.
- **Solo en español por ahora.** Los montos pueden ir en USD; las cláusulas en
  inglés quedan pendientes.

## Qué quedó (6 oct 2026)

- **Migraciones** 0041 (tablas `propuestas`, `propuesta_versiones`,
  `propuesta_horas`), 0042 (precio y moneda desnormalizados) y 0043 (la
  configuración de cada versión, necesaria para recalcular las perillas desde
  la versión enviada). Solo aditivas. Aplicadas por Mike en Turso (principal
  y demo) el 6 oct 2026. Además, `payments.source` admite
  `'propuesta'` (solo tipo de TypeScript, sin migración).
- **Pruebas:** `tests/plano.test.ts` (lógica pura), `tests/plano-ia.test.ts`
  (citas literales, guardia de cifras, vista del cliente sin datos internos,
  huellas) y `tests/plano-db.test.ts` (flujo completo contra libSQL temporal
  creada con las migraciones reales).
- **Recorrido real** contra una base local (`.tmp/plano/`): crear, configurar,
  dos versiones, enviar, PDF, perillas del cliente, aceptación, anticipo con la
  pasarela simulada y conversión (cliente, proyecto, 4 hitos, 3 cuentas de
  cobro en borrador, invitación al portal). Capturas del constructor y del
  enlace del cliente en escritorio y móvil.
- El constructor del panel sí se pudo capturar con Chromium y GPU real
  (`--use-angle=gl-egl`), a diferencia de lo anotado en sep 2026 para otras
  páginas del panel.

### Decisiones que surgieron al implementar

- **Las perillas se simulan en el servidor.** El navegador del cliente no
  recibe la configuración ni las reglas (llevan horas, citas de la
  conversación y el rango interno); cada perilla es un POST que recalcula desde
  la versión enviada. Por eso cada versión guarda su configuración (0043).
- **Aceptar sin cambios no crea versión.** Si el cliente no movió nada y la
  fecha de inicio sigue vigente, se acepta la versión enviada tal cual; si
  movió perillas o la fecha ya pasó, se congela una versión nueva marcada como
  del cliente, con las fechas recalculadas desde hoy.
- **Una subida de precio no es verde.** En "qué cambió", el precio va como
  cambio neutro: verde y rojo se leen como agregado y quitado.
- **Invitación al portal automática** al convertir, si hay correo: sale por
  Resend como cualquier invitación del portal.
- **Rutas reservadas:** `propuesta` entra en `RESERVED_ROOT_SEGMENTS` (compite
  con el espacio de los PIN de presentación en la raíz).

## Pendiente

- Primera corrida de la IA contra la API real (unos centavos por llamada).
- Revisión de las cláusulas por un abogado.
- Versión en inglés de la propuesta y de las cláusulas.
- USD: el anticipo en línea solo existe en pesos (Wompi no cobra en dólares).
