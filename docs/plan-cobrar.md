# Plan — Cobros de campo por WhatsApp (`/cobrar`)

> Creado: 2026-07-15. Estado: **planificado, sin iniciar**.
> Flujo mobile-first para cobrar trabajos externos (soporte, hardware, tecnología) desde el
> celular: configuras monto + teléfono, previsualizas y editas el mensaje, lo envías por
> WhatsApp (sin API de WhatsApp) y el cliente paga en la pasarela existente (Wompi).
> El cliente consulta su histórico de pagos en `/mis-pagos`.

---

## 1. Decisiones de diseño (cerradas)

| Tema | Decisión |
|---|---|
| Ruta de cobro | `/cobrar` en la raíz (corta para teclear en móvil), protegida por la **misma sesión admin** (se agrega al matcher del middleware). |
| Envío del mensaje | **Sin API de WhatsApp**: botón que abre `https://wa.me/<tel>?text=<mensaje>` desde tu propio celular. Fallback: copiar link/mensaje al portapapeles. |
| Pasarela | Se **reutiliza** el módulo `payments` completo (idempotencia, firma de integridad Wompi, webhooks, máquina de estados). Cero cambios al flujo de webhooks. |
| Link de pago | Página pública `/c/[code]` con código corto no adivinable; muestra monto + concepto y lleva directo al checkout de Wompi. |
| Ciclo de vida | Vencimiento por defecto **72h** (configurable al crear: 24h / 72h / 7d / sin vencimiento) + **anulación manual** desde `/cobrar` (transición `voided` que la máquina de estados ya soporta). |
| Histórico del cliente | `/mis-pagos`: **link firmado por teléfono** (HMAC, incluido en cada mensaje de WhatsApp) muestra historial completo; la consulta manual solo por número muestra datos **enmascarados** y con rate limit fuerte. |
| CRM | **Vínculo automático suave**: si el teléfono coincide con `clients.phone` se vincula el cobro y se muestra el nombre en la confirmación; si no existe, el cobro queda suelto (no se crea cliente). |
| Moneda | COP, mismos límites del checkout actual ($1.000 – $5.000.000). |

## 2. Principios

1. **Reutilizar, no duplicar.** Un cobro **es** una fila de `payments` con campos extra
   (`payerPhone`, `source`, `expiresAt`, `clientId`, `shortCode`). No hay tabla `cobros`
   paralela ni segunda máquina de estados.
2. **El monto se firma en el servidor, siempre.** `/c/[code]` genera los parámetros de Wompi
   (incluida `signature:integrity`) en el servidor al momento del clic. El cliente jamás ve
   ni manipula el monto en la URL del mensaje.
3. **El teléfono no es autenticación.** Solo el token HMAC del link firmado da acceso al
   historial completo. El número por sí solo da una vista enmascarada.
4. **Mobile-first de verdad.** `/cobrar` se diseña para pulgar y una mano: inputs grandes,
   presets de monto, teclado numérico (`inputmode`), dos pantallas máximo.
5. **Todo al micro-SIEM y a ntfy.** Creación, anulación, apertura del link, pago aprobado y
   consultas de historial generan eventos (`securityEvents`) y las relevantes, push.

## 3. Flujo completo

```
TÚ (celular, sesión admin)
  /cobrar
    Pantalla 1: monto (presets + input) · teléfono WhatsApp (+57 por defecto)
                · concepto (opcional) · vencimiento (72h por defecto)
                → si el teléfono coincide con un cliente del CRM, muestra su nombre
    [Confirmar]
    Pantalla 2: previsualización del mensaje (textarea editable)
                → link /c/AB3K9F + link /mis-pagos?t=<hmac> incluidos
    [Enviar por WhatsApp]  → abre wa.me/57XXXXXXXXXX?text=...
    [Copiar mensaje]       → fallback portapapeles

CLIENTE (su celular)
  Recibe WhatsApp → abre /c/AB3K9F
    → página con monto, concepto, "CodeByMike" y botón [Pagar]
    → clic: servidor firma y redirige a checkout.wompi.co
    → paga → webhook Wompi (flujo existente, sin cambios) → approved
    → /pay/gracias (redirect-url existente)
  Después: /mis-pagos?t=<hmac> → historial completo de su teléfono
```

## 4. Modelo de datos (migración Drizzle)

Cambios a `payments` (todo nullable — los pagos de `/pay` y del portal no se tocan):

```
payerPhone   text     — E.164 normalizado ('+573104641228')
source       text     — enum 'pay' | 'cobro' | 'portal', default 'pay'
shortCode    text     — UNIQUE, 6 chars A-Z2-9 sin ambiguos (p. ej. 'AB3K9F'); solo cobros
expiresAt    integer  — timestamp; null = sin vencimiento
clientId     integer  — → clients.id, SET NULL; vínculo suave con el CRM
```

Índices: `payments_phone_idx` sobre `payerPhone` (consulta de `/mis-pagos`),
UNIQUE implícito en `shortCode`.

No hay tablas nuevas. `paymentEvents` registra igual que hoy.

## 5. Nuevos módulos y endpoints

### `src/lib/phone.ts`
- `normalizePhone(raw, defaultCountry='57')` → E.164 o `null` (quita espacios/guiones,
  antepone +57 a números de 10 dígitos que empiezan por 3, valida longitud).
- `formatPhone(e164)` → presentación (`+57 310 464 1228`).
- Tests unitarios (formatos colombianos típicos: `3104641228`, `310 464 1228`, `+57310…`).

### `src/lib/cobros.ts`
- `newShortCode()` — 6 chars del alfabeto sin ambiguos, con reintento ante colisión UNIQUE.
- `historyToken(phone)` / `verifyHistoryToken(phone, token)` — HMAC-SHA256 con secreto
  `COBRO_HISTORY_SECRET` (nueva env var), truncado a 16 bytes hex, comparación timing-safe.
- `buildWhatsAppMessage({name?, amountCents, concept, payUrl, historyUrl, expiresAt})` —
  plantilla por defecto del mensaje (editable en la pantalla 2).
- `isExpired(payment)` — `expiresAt != null && expiresAt < now && !isTerminal(status)`.

### Endpoints admin (sesión admin obligatoria + rate limit)
- `POST /api/admin/cobros` — valida monto/teléfono/concepto, normaliza el teléfono, busca
  cliente CRM por `payerPhone`, llama `createPaymentIdempotent` (provider según env, como
  hoy) con `source='cobro'`, genera `shortCode` y `expiresAt`. Devuelve
  `{reference, shortCode, payUrl, historyUrl, mensaje, clientName?}`.
- `GET /api/admin/cobros` — lista cobros (`source='cobro'`) con estado, para la vista de
  pendientes de `/cobrar`.
- `POST /api/admin/cobros/[reference]/void` — anula: `applyGatewayEvent` con evento interno
  `{provider, type: 'admin.void', status: 'voided'}` → queda en `paymentEvents` como
  auditoría. Solo si el estado actual lo permite (la máquina ya lo garantiza).
- `GET /api/admin/cobros/lookup-client?phone=` — para mostrar el nombre del cliente CRM en
  vivo en la pantalla 1 (debounced).

### Endpoints públicos
- `GET /c/[code]` — página Astro SSR: busca por `shortCode`. Estados: activo (muestra monto
  + botón Pagar), vencido, anulado, ya pagado (con fecha). `noindex`, `Cache-Control:
  no-store`, rate limit por IP.
- `POST /api/c/[code]/checkout` — genera los parámetros firmados de Wompi para ESE pago (o
  el flujo mock si no hay llaves) y devuelve la URL de redirección. Rechaza si vencido,
  anulado o terminal. **No** crea pago nuevo: reutiliza la fila existente.
- `GET /mis-pagos` — página pública: con `?t=` válido para un teléfono → historial completo
  (fecha, concepto, monto, estado). Sin token → formulario de número que llama a…
- `POST /api/mis-pagos/lookup` — vista enmascarada: fecha, estado y monto parcial
  (`$ ***.500`), máximo últimos 5. Rate limit agresivo (5/h por IP) + evento SIEM
  `mispagos.lookup` con IP.

## 6. Pantallas

### `/cobrar` (protegida, mobile-first)
- **Pantalla 1 (formulario):** presets de monto ($20k/$50k/$100k + input `inputmode="numeric"`
  con formato de miles en vivo), input teléfono `inputmode="tel"` con prefijo +57 visual,
  concepto (una línea, opcional), selector de vencimiento. Si el teléfono matchea CRM:
  chip con el nombre del cliente. Botón grande **Confirmar**.
- **Pantalla 2 (previsualización):** textarea con el mensaje generado (editable), resumen
  del cobro (monto grande, teléfono, vencimiento), botones **Enviar por WhatsApp** (abre
  `wa.me`) y **Copiar mensaje**. Nota: el cobro ya quedó creado al confirmar; editar el
  texto no cambia monto ni link.
- **Sección "Pendientes":** debajo del formulario, lista de cobros no terminales con
  monto, teléfono/cliente, tiempo restante y acciones **Reenviar** (reabre `wa.me` con el
  mensaje regenerado) y **Anular**.
- Es una sola página Astro con las dos "pantallas" como pasos en cliente (sin recarga),
  siguiendo el patrón de script vanilla de `/pay`.

### `/c/[code]` (pública)
- Monto en grande, concepto, "Cobro de CodeByMike — codebymike.tech", botón **Pagar**
  (mismo estilo del checkout actual). Estados vencido/anulado/pagado con mensaje claro y
  contacto de WhatsApp para pedir un link nuevo.

### `/mis-pagos` (pública)
- Con token: lista completa de pagos de ese teléfono (los `source='cobro'`), totales.
- Sin token: input de número → vista enmascarada + aviso de que el link completo llega
  con cada cobro por WhatsApp.

## 7. Middleware y seguridad

- Agregar `/cobrar` y `/api/admin/cobros*` al matcher de rutas protegidas por sesión admin
  en `src/middleware.ts` (misma protección que `/admin/**`).
- `COBRO_HISTORY_SECRET` nueva env var (Vercel + `.env`); si falta, `/mis-pagos` con token
  responde 503 en vez de degradar a lookup abierto.
- Rate limits (reutilizando `enforceLimit`): creación de cobros 20/h, `/c/[code]` 30/min/IP,
  checkout 10/min/IP, lookup enmascarado 5/h/IP.
- Eventos SIEM: `cobro.created`, `cobro.voided`, `cobro.link_opened`, `cobro.paid`
  (desde el webhook cuando `source='cobro'`), `mispagos.lookup`, `mispagos.token_invalid`.
- Push ntfy cuando un cobro pasa a `approved`: "💰 Cobro pagado — $150.000 de +57310… (Juan)".
- `/c/[code]` y `/mis-pagos` con `noindex` y sin datos en la URL más allá del código/token.

## 8. Fases de implementación

| Fase | Contenido | Entregable verificable |
|---|---|---|
| 0 | Migración Drizzle (`payerPhone`, `source`, `shortCode`, `expiresAt`, `clientId` + índices) · `lib/phone.ts` + tests · `lib/cobros.ts` + tests (HMAC, shortCode, expiry, plantilla) | `npm test` verde con los nuevos unit tests |
| 1 | Endpoints admin (crear/listar/anular/lookup-client) · matcher del middleware · evento interno `admin.void` | Crear y anular un cobro vía curl con cookie admin |
| 2 | Página `/cobrar` (2 pasos + pendientes) | Flujo completo desde el celular hasta abrir WhatsApp |
| 3 | `/c/[code]` + `POST /api/c/[code]/checkout` (estados vencido/anulado/pagado) | Pago mock end-to-end: cobrar → link → pagar → `approved` |
| 4 | `/mis-pagos` (token + lookup enmascarado) | Historial visible con token; enmascarado sin él |
| 5 | Hardening: rate limits, eventos SIEM, push ntfy en `approved`, `noindex`, OG básica de `/c/[code]` sin monto | Eventos visibles en `/admin/security`; push recibido |
| 6 | Docs: actualizar `seo.MD`/roadmap si aplica, entrada en `/notes` opcional como caso de estudio | — |

Estimación: Fases 0–3 son el MVP usable en campo; 4–5 cierran el círculo del cliente.

## 9. Casos borde contemplados

- **Cliente paga justo cuando vence:** el checkout de Wompi se generó antes del vencimiento;
  el webhook `approved` se aplica igual (la máquina lo permite y el dinero ya entró). El
  vencimiento solo bloquea generar **nuevos** checkouts.
- **Doble clic en Confirmar:** clave de idempotencia por intento (patrón de `/pay`) → un
  solo cobro.
- **Reenviar mensaje:** regenera el texto con el mismo `shortCode`; nunca crea otro pago.
- **Anular un cobro `approved`:** permitido por la máquina (`approved → voided` = refund
  manual); la UI pide confirmación explícita y aclara que el reembolso es por fuera.
- **Teléfono de otro país:** `normalizePhone` acepta E.164 completo con `+`; solo asume
  +57 para números locales de 10 dígitos.
- **WhatsApp cachea la preview del link:** la OG de `/c/[code]` es genérica (sin monto ni
  estado), así nunca muestra información vieja o sensible.

## 10. Sugerencias (fuera del MVP, anotadas)

1. **Recordatorio de cobros por vencer:** el cron de monitoreo existente podría notificarte
   por ntfy los cobros que vencen en <12h para reenviarlos.
2. **Recibo compartible:** al quedar `approved`, `/c/[code]` muestra un recibo con fecha y
   referencia que el cliente puede screenshotear — reduce "¿me confirmas que llegó?".
3. **Integración con `invoices`:** cuando el portal de clientes esté vivo, un cobro de campo
   podría generar factura formal opcional para clientes CRM.
4. **PWA/atajo:** `/cobrar` como icono en la pantalla de inicio del celular (el manifest ya
   existe; bastaría un shortcut).
