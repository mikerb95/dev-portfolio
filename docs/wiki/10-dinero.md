# 10 · Dinero: pagos, cobros y cotización

Todo lo que toca dinero comparte **una sola pasarela** y **una sola máquina de
estados**. Regla del repo: una operación de pago nueva reutiliza
`createPaymentIdempotent` / `applyGatewayEvent`; nunca una máquina paralela.

## Pasarela de pagos (Wompi)

Archivos: [`src/lib/payments.ts`](../../src/lib/payments.ts),
[`src/lib/payments-state.ts`](../../src/lib/payments-state.ts).

**Máquina de estados** (módulo puro, isomorfo, también corre en el navegador):

```
created ──► pending ──► approved ──► voided
   │           │
   ├───────────┼──► declined   (terminal)
   ├───────────┼──► error      (terminal)
   └───────────┴──► voided     (terminal)
```

- `canTransition(from, to)`: sin retrocesos (RNF-07). La única salida de un
  terminal es `approved → voided` (anulación).
- **Idempotencia** (RNF-06): `payments.idempotencyKey` UNIQUE.
  `createPaymentIdempotent` devuelve el pago existente ante un doble clic o una
  carrera. Probado con libSQL en archivo temporal (`tests/payments.test.ts`).
- **Webhook** `/api/payments/webhook`: verifica la firma del evento
  (`WOMPI_EVENTS_SECRET`) y aplica `applyGatewayEvent`, que tolera duplicados y
  eventos fuera de orden (`payment_events`).
- **Checkout**: firma de integridad (`WOMPI_INTEGRITY_SECRET`) calculada en el
  servidor. **El monto nunca viaja desde el navegador.**
- **Modo mock** (`/api/payments/mock/pay`): para el LAB, la demo del portal y
  e2e. Autorizado por sesión admin, demo del portal o `PAYMENTS_MOCK_ENABLED`.
- Checkout público en `/pay` (RF-509) y resultado en `/pay/gracias`.

Artículo de laboratorio: los cuatro ataques del Payments Lab, ver
[05](05-panel-admin.md#lab).

## Cobros de campo (`/cobrar`)

Plan: [`docs/plan-cobrar.md`](../plan-cobrar.md). Artículo:
`/notes/cobrar-un-trabajo-de-campo-sin-api-de-whatsapp`.

1. Mike, desde el celular y con sesión admin, abre `/cobrar`: monto, teléfono,
   vista previa del mensaje.
2. Se abre `wa.me` desde su propio teléfono (**sin API de WhatsApp**).
3. El cliente paga en el link corto público `/c/<code>`.
4. Un cobro **es** una fila de `payments` con campos extra; no hay tabla ni
   máquina paralela.
5. El monto se firma en el servidor; nunca va en la URL del mensaje.
6. Histórico en `/mis-pagos`: con el link HMAC (`COBRO_HISTORY_SECRET`) se ve
   todo; consultando por teléfono, solo una vista enmascarada con rate limit
   fuerte. El teléfono no es autenticación.
7. Aviso push al pagarse (`cobros-notify.ts`). Anulación desde el panel.

## Cuentas de cobro (`/admin/cuentas-cobro`)

Plan: [`docs/plan-cuentas-de-cobro.md`](../plan-cuentas-de-cobro.md). Documento
de cobro de **persona natural no responsable de IVA** en Colombia:

- Retenciones parametrizables (bases y tarifas en `app_settings`, editables en
  `/admin/settings`; RF-309).
- Semáforo del tope de responsabilidad de IVA del año (RF-310).
- Alta de deudor sin salir del flujo (RF-311).
- PDF con `pdf-lib`. Fechas con `formatFechaCorta` en zona Colombia (RNF-29).
- El asistente del panel puede dejar una en **borrador** con aprobación.

## Plano: propuestas a la medida (`/admin/plano`)

Plan: [`docs/plan-plano.md`](../plan-plano.md). Artículo:
`/notes/cotizar-con-un-rango-que-se-cierra`. RF-214 a RF-218.

- Precio como **rango que se cierra** con cada respuesta (cono de
  incertidumbre, `plano/incertidumbre.ts`).
- Tres versiones: Esencial, Recomendada, Completa.
- Plan de pagos por monto, cuotas con recargo o pago único, con **días hábiles
  y festivos de Colombia** (`plano/fechas.ts`, `festivos-co.ts`).
- Cláusulas de biblioteca (`src/data/clausulas.ts`) en versión formal y "en
  cristiano". Mapa de contacto.
- "Encaje con tu vida" (`plano/encaje.ts`): qué significa la propuesta para
  Mike (carga, gasto mensual), no para el cliente.
- IA: "del chat al plano" (lee la conversación y propone componentes) y "el
  cliente difícil" (critica la propuesta). **La IA nunca pone precios ni
  redacta cláusulas.**
- Enlace privado `/propuesta/<token>`: el cliente mueve las perillas
  habilitadas, ve qué cambió entre versiones, acepta con constancia (huella
  SHA-256) y paga el anticipo.
- **Versiones congeladas**: cada versión enviada guarda el resultado completo,
  no la fórmula. Cambiar el tarifario no reescribe una propuesta aceptada.
- **De sí a proyecto** (`plano/conversion.ts`): al aprobarse el anticipo, se
  crean cliente, proyecto, hitos y cuentas de cobro en borrador.
- **Aprende** (`plano/aprende.ts`): compara horas estimadas y reales
  (`propuesta_horas`) y sugiere calibrar la tabla.

## Cotiza: consultoría (`/cotiza`)

Plan: [`docs/plan-cotiza.md`](../plan-cotiza.md). Artículo:
`/notes/el-precio-pactado-no-se-toca`. RF-220 a RF-224.

Para los encargos de **consultoría en logística, comercio exterior, compras y
operaciones** (8 años de experiencia de Mike antes del software). Reglas que la
herramienta hace cumplir:

1. Se cotizan **entregables contables**, no "ayuda".
2. Lo incluido son **cupos** que se descuentan.
3. Lo que no está escrito no está pactado (resumen tras cada reunión, 1 día
   hábil para corregir).
4. **El precio base nunca se toca**: lo nuevo entra como **adicional** con su
   precio y aprobación escrita previa.
5. Fuera de horario cuesta más, pactado desde el inicio.

Piezas: motor puro (`cotiza/motor.ts`, reglas en `src/data/cotiza.ts`),
bitácora del encargo (reuniones, rondas, solicitudes), IA de alcance
(`cotiza/ia.ts`), enlace del cliente `/acuerdo/<token>` para aceptar y aprobar
adicionales, **dictado por voz** en los campos (el micrófono solo se permite en
estas páginas), acceso por **PIN** (ver [07](07-autenticacion-y-accesos.md#cotiza-por-pin)).

## Tarifario y cotizadores

[`src/data/tarifario.ts`](../../src/data/tarifario.ts) es la **única** fuente de
precios. Lo leen `/paginas-web`, el titular rotativo de la portada, el asesor
público, el cotizador del asistente
(`lib/asistente/calculo-cotizacion.ts`) y Plano. Detalle de precios en
[01](01-vision-y-contexto.md#modelo-de-negocio-lo-que-vende-el-sitio).

La **guardia de cifras** (`lib/asistente/guardia.ts`) revisa todo texto de una
IA: solo puede citar cantidades de dinero que devolvió una herramienta.

## Costos, P&L y finanzas personales

- `project_services`: servicios por proyecto con costo multi-moneda (base USD,
  `lib/money.ts`), ciclo de cobro, renovación, responsable y **secretos
  cifrados**.
- `lib/pnl.ts`: rentabilidad por proyecto = ingresos cobrados - costos.
- `finances`: ingresos.
- `living_costs`, `living_expenses`: costos de vida (`/admin/vida`).
- `lib/resumen-mensual.ts`: lo que sale del bolsillo cada mes.
- `lib/infra-stack.ts`: simulador de la infraestructura propia (Vercel, Turso,
  Claude). Artículo: `/notes/unos-proveedores-te-cobran-otros-te-cortan`.

## Cómputo de clientes (`/admin/computo`)

Plan: [`docs/plan-computo-clientes.md`](../plan-computo-clientes.md). RF-314 a
RF-316.

- **Medidor** portable (`instrumentacion/medidor.ts`, con versiones `.mjs` y
  `.cjs` generadas por `npm run medidor:build`) que se instala en los sitios de
  clientes (Toledo, DobleYo, Gorillaz) y envía lotes firmados a
  `/api/computo/ingest`.
- La cuenta de Vercel es **Hobby** y la cuota gratis se **comparte** entre todos
  los proyectos: el panel la vigila y avisa antes del tope (cron
  `computo-rollup`).
- Cotizador de hosting fijo para clientes nuevos (`computo/cotizador.ts`).
- Decisión (22 sep 2026): no volver a facturar cómputo "pass-through" salvo que
  la cuenta pase a Pro.

## Marketing por correo

Plan: [`docs/plan-marketing.md`](../plan-marketing.md). RF-225. Lista solo con
gente que pidió entrar (doble opt-in, Ley 1581), envío solo en el horario que
permite la Ley 2300, cupo diario, idempotencia por lote, baja con token. La
lista está vacía a propósito; no se importan clientes.
