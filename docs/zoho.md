# Zoho — mapa de funciones e integraciones posibles

> Referencia de qué ofrece la suite Zoho (para un freelance/agencia pequeña) y qué de eso tiene
> sentido **construir a medida** dentro de este portfolio vs. **integrar directamente** vía API/webhook.
> Contexto: nace de comparar `/admin/briefings` con Zoho CRM/Forms/Sign (ver [plan-briefings.md](./plan-briefings.md)),
> pero cubre toda la suite por si aplica a otras partes del panel (`/admin/clients`, `/admin/finances`, `/admin/seguimiento`).

---

## 1. Zoho CRM

| Función | Qué hace en Zoho | Ya existe aquí | Construir a medida | Integrar vía API |
|---|---|---|---|---|
| Pipeline de leads/deals | Kanban por etapa, drag & drop, valor agregado por columna | Badge de estado en `briefings`/`clients` | ✅ Kanban en briefings (Fase 2 del plan) | — |
| Scoring de leads | Puntaje automático según actividad/perfil | No | No (poco volumen para justificarlo) | — |
| Workflows/automatizaciones | "Si status=X → enviar email/tarea" | Parcial (ntfy en monitores) | ✅ Workflows específicos (aprobación, deadlines) | Zoho Flow si se quisiera no-code |
| Portal de cliente | El cliente ve/aprueba propuestas, tickets, facturas | No | ✅ Portal de briefings (Fase 3) — extensible a proyectos | — |
| Reportes/dashboards | Funnel, forecast, tasas de conversión | No | ✅ Sección analítica en `/admin/briefings` y `/admin/index` | — |
| Multiusuario/roles | Equipos, permisos por rol | No aplica (una sola persona) | ❌ Descartado | — |

**Veredicto**: no integrar Zoho CRM. El CRM propio (`clients` + `interactions` + `briefings`) ya cubre el caso de una sola persona; replicar sus conceptos (pipeline, portal, workflows) a medida da más control y cero costo de licencia.

---

## 2. Zoho Forms → Intake de briefings

| Función | Zoho | Aquí |
|---|---|---|
| Formulario público multi-paso | Sí, con lógica condicional | Construir: `/brief` público (Fase 4 del plan) |
| Anti-spam (captcha/honeypot) | Captcha integrado | Honeypot + rate limit propio (evitar dependencia de reCAPTCHA/Google) |
| Creación automática de registro CRM | Sí | Insert directo en `briefings` (status `recibido`) + match de `clients` por email |

**Veredicto**: construir a medida. Es un formulario simple y controlar el dato evita depender de un tercero para algo core del negocio.

---

## 3. Zoho Sign / Zoho Contracts → Aprobación de propuestas

| Función | Zoho Sign | Aquí |
|---|---|---|
| Firma electrónica certificada (legal) | Sí, con validez legal, auditoría, certificados | No — fuera de alcance |
| Aceptación ligera (nombre+email+checkbox+timestamp) | — | ✅ Construir en el portal de briefings (Fase 3) |
| Plantillas de contrato con campos | Sí | No por ahora |

**Veredicto**: no integrar Zoho Sign. Para relación freelance-cliente, la aceptación ligera con IP+timestamp es suficiente evidencia; una firma legal certificada es sobre-ingeniería para el volumen actual. Si en el futuro se necesita validez legal fuerte (contratos grandes, corporativo), ahí sí valdría integrar **Zoho Sign API** o **DocuSign** puntualmente para ese documento, sin migrar todo el flujo.

---

## 4. Zoho Books / Zoho Invoice → Finanzas y facturación

| Función | Zoho | Aquí |
|---|---:|---|
| Facturación (invoices, PDF, envío) | Sí | No existe — **candidato a construir** |
| Cuentas por cobrar / recordatorios de pago | Sí | Parcial (`payments`/`paymentEvents` en schema, sin UI de recordatorio) |
| Multi-moneda | Sí | Ya existe (`src/lib/money.ts`, COP/USD/EUR) |
| P&L / costos | Sí (reportes) | ✅ Ya construido (`/admin/costs`, `src/lib/pnl.ts`) |
| Conciliación bancaria | Sí (integra bancos) | Fuera de alcance — volumen no lo justifica |

**Veredicto**: construir solo lo puntual que falte (generar PDF de factura simple a partir de `finances`/`payments`, recordatorio de cobro vencido vía ntfy). No integrar Zoho Books completo: ya existe una base de P&L propia y duplicar el sistema financiero en dos lugares genera desincronización.

**Integración real que sí vale la pena**: pasarela de pago (Stripe/Wompi/PayPal) para que el cliente pague el `agreedBudget` del briefing directamente desde el portal — eso sí es valor nuevo, no una re-implementación de algo que Zoho hace mejor.

---

## 5. Zoho Projects → Gestión de proyecto

| Función | Zoho | Aquí |
|---|---|---|
| Tareas con dependencias/Gantt | Sí | No — la tabla `interactions` (type `task`) cubre pendientes simples, sin dependencias |
| Time tracking | Sí | No |
| Milestones | Sí | Existe concepto similar en `educationMilestones` pero para educación, no proyectos de cliente |

**Veredicto**: no construir un Gantt propio (alto esfuerzo, bajo retorno para 1 persona). Si se necesita, más valor tiene extender `interactions` con `dependsOnId` opcional que montar un módulo de proyecto completo.

---

## 6. Zoho Analytics / Zoho Flow → Automatización transversal

| Función | Zoho | Aquí |
|---|---|---|
| Automatizaciones no-code entre apps | Zoho Flow conecta CRM↔Forms↔Books↔Slack | Cron jobs Vercel propios (ya usados en `monitors`) + ntfy |
| BI/dashboards cruzados | Zoho Analytics | Secciones de analítica puntuales por módulo (funnel de briefings, P&L) |

**Veredicto**: no integrar. El patrón cron+ntfy que ya funciona en `/admin/monitors` es el motor de automatización de este proyecto; replicarlo (no Zoho Flow) para: recordatorios de deadline, alertas de "briefing visto/aprobado", cobros vencidos.

---

## 7. Integraciones externas que sí conviene evaluar (no son de Zoho)

Estas no reemplazan nada existente, añaden capacidad real:

| Integración | Para qué | Prioridad |
|---|---|---|
| **Resend** (o similar) | Email transaccional real (hoy solo hay ntfy push a Mike; el cliente no recibe nada por email) | Media — solo si se necesita notificar al cliente sin depender de WhatsApp manual |
| **Stripe / Wompi** | Cobro directo del `agreedBudget` desde el portal de cliente | Media-alta, tras Fase 3 |
| **Vercel Blob** | Adjuntos en briefings (ya previsto en el plan, Fase 4) | Ya decidido |
| **WhatsApp Business API** | Notificar al cliente automáticamente (hoy es manual) | Baja — el canal manual ya funciona bien para el volumen actual |

---

## 8. Resumen — qué NO vamos a integrar y por qué

- **Zoho CRM/Projects/Books/Analytics/Flow completos**: cada uno es una suite para equipos; para una sola persona duplican datos que ya viven en Turso y añaden costo de licencia + otra fuente de verdad.
- **Zoho Sign**: la aceptación ligera cubre el caso de uso real; firma legal certificada solo si un cliente corporativo grande lo exige puntualmente.
- **Zoho Forms**: un formulario propio de una página es más simple que integrar un producto externo para algo que se resuelve con una migración y una ruta API.

La estrategia general: **tomar el concepto de Zoho (pipeline, portal, checklist, workflow) y construirlo a medida sobre lo que ya existe** (Turso/Drizzle, ntfy, Vercel cron), en vez de sumar productos SaaS de terceros que exigirían sincronizar datos entre dos sistemas.
