# Plan: Panel de Briefings de clase mundial

> Objetivo: llevar `/admin/briefings` de un CRUD básico a un sistema de intake → negociación → aprobación → proyecto, comparable con lo que ofrecen Zoho CRM / Zoho Projects / Zoho Forms, pero hecho a medida para un freelance (Mike) y apoyado en la infraestructura que el portfolio ya tiene.

---

## 1. Estado actual (auditoría — julio 2026)

**Lo que existe:**

| Pieza | Archivo | Estado |
|---|---|---|
| Tabla `briefings` | `src/db/schema.ts:135` | 4 estados (`borrador/en_revision/aprobado/rechazado`), campos de texto plano, presupuestos, horas, deadline |
| Lista | `src/pages/admin/briefings.astro` | Tabla simple + modal de creación; sin filtros, sin búsqueda, sin orden por columnas |
| Detalle | `src/pages/admin/briefings/[id].astro` | Vista de solo lectura + modal de edición + delete |
| API | `src/pages/api/admin/briefings/*` | GET list, POST, GET/PUT/DELETE por id; sin validación fuerte |

**Brechas frente a una plataforma tipo Zoho:**

1. **No hay intake del cliente**: el briefing lo escribe Mike a mano; en Zoho Forms el cliente llena un formulario y crea el registro solo.
2. **No hay pipeline visual**: solo un badge de estado; Zoho CRM tiene kanban por etapa con drag & drop y valores agregados por columna.
3. **No hay flujo de aprobación con el cliente**: no hay link compartible, ni aceptación/firma, ni registro de quién aprobó y cuándo.
4. **No hay versionado**: editar sobreescribe; en negociación se pierde el rastro de qué cambió (alcance, presupuesto).
5. **Requerimientos/entregables son textarea plano**: no son ítems chequeables ni convertibles a tareas.
6. **No hay adjuntos** (brand assets, referencias, contratos).
7. **No hay actividad/timeline** por briefing (la tabla `interactions` existe pero no se vincula a briefings).
8. **No hay conversión**: aprobar un briefing no genera proyecto, ni finanzas, ni seguimiento.
9. **No hay recordatorios** (deadlines vencen en silencio; ntfy ya está configurado y no se usa aquí).
10. **No hay analítica**: tasa de conversión, valor del pipeline, tiempo medio de cierre.
11. **No hay plantillas**: cada briefing arranca de cero (Zoho tiene templates por tipo de proyecto).
12. **Seguridad/robustez**: API sin validación de tipos (zod), delete sin soft-delete.

**Activos existentes para reutilizar (no reinventar):**

- Patrón `shareToken` de `presentations` → base para el link público del briefing.
- Tabla `interactions` → timeline de actividad (ya tiene `clientId`/`projectId`; falta `briefingId`).
- ntfy.sh ya operativo → recordatorios y alertas ("cliente aprobó el briefing").
- Tablas `finances` y `projects` → destino de la conversión al aprobar.
- `/status` y OG images → patrón para página pública con branding.

---

## 2. Diseño objetivo

### 2.1 Ciclo de vida (pipeline)

Ampliar el enum de estados a un pipeline real de negociación:

```
recibido → borrador → enviado → en_revision → negociacion → aprobado → convertido
                                          ↘ rechazado / expirado
```

- `recibido`: creado por el cliente vía formulario público de intake.
- `enviado`: Mike compartió la propuesta con el cliente (link con token).
- `negociacion`: hubo contraoferta/comentarios; se generan versiones.
- `convertido`: se creó el proyecto; el briefing queda inmutable (archivo histórico).

### 2.2 Modelo de datos (nuevas tablas / columnas)

```ts
// briefings — columnas nuevas
shareToken: text('share_token').unique()        // link público
sharedAt, approvedAt, approvedByName, approvedByEmail, clientSignature (text)
priority: enum ['baja','media','alta']
source: enum ['manual','intake','referido']
currency: text default 'USD'                    // ya facturas en COP/USD
validUntil: timestamp                            // expiración de la propuesta
templateId: fk → briefing_templates
deletedAt: timestamp                             // soft delete

// briefing_items — reemplaza los textarea de requirements/deliverables
id, briefingId (fk cascade), kind: enum ['requerimiento','entregable','exclusion'],
content, done (bool), sortOrder, createdAt

// briefing_versions — snapshot en cada cambio material
id, briefingId, version (int), snapshot (JSON del briefing+items),
changeNote, createdAt

// briefing_comments — hilo Mike ↔ cliente sobre el link compartido
id, briefingId, authorType: enum ['owner','client'], authorName,
body, createdAt

// briefing_attachments
id, briefingId, fileName, url (Vercel Blob), size, mimeType, uploadedBy, createdAt

// briefing_templates
id, name, description, defaultItems (JSON), defaultObjective/scope, createdAt

// interactions — columna nueva
briefingId: fk → briefings (set null)
```

### 2.3 Vistas del panel

**A. Lista → doble vista Tabla/Kanban** (`/admin/briefings`)
- Toggle tabla ↔ kanban por estado, con drag & drop para cambiar etapa (PATCH status).
- Cabecera con métricas: nº activos, valor del pipeline (suma estimados de no cerrados), valor aprobado del mes, tasa de conversión.
- Filtros: estado, cliente, prioridad, rango de fechas; búsqueda por título; orden por columna.
- Indicadores de deadline: chip ámbar <7 días, rojo vencido.

**B. Detalle** (`/admin/briefings/[id]`) — reorganizar en pestañas o secciones:
- **Resumen**: cards actuales + prioridad + validez + margen estimado (acordado vs horas×tarifa).
- **Ítems**: checklist de requerimientos/entregables/exclusiones, reordenables.
- **Actividad**: timeline (interactions con `briefingId`) + eventos automáticos (creado, enviado, visto, comentado, aprobado).
- **Versiones**: lista de snapshots con diff simple (qué campos cambiaron); botón "restaurar".
- **Comentarios**: hilo con el cliente.
- **Adjuntos**: subida a Vercel Blob (ya hay `upload.ts` como referencia).
- Acciones: Compartir (genera/rota token), Marcar enviado, **Convertir a proyecto**, Duplicar, Archivar.

**C. Página pública** (`/briefing/[token]`) — el diferenciador tipo "portal de cliente" de Zoho:
- Propuesta legible con branding del portfolio (reutilizar estética de `/status` y slides).
- Muestra: objetivo, alcance, ítems, presupuesto, validez, condiciones.
- El cliente puede: **comentar**, **solicitar cambios**, o **Aprobar** (nombre + email + checkbox de aceptación = firma ligera con timestamp e IP).
- Registro de "visto" (primer GET con token → evento en timeline + ntfy).
- Expira según `validUntil`.

**D. Intake público** (`/brief` o `/tools/brief`):
- Formulario guiado multi-paso (tipo de proyecto → objetivos → presupuesto orientativo → contacto).
- Crea briefing en estado `recibido` + cliente si no existe (match por email) + notificación ntfy.
- Protección: rate limit + honeypot (mismo patrón que el form de contacto si existe).

### 2.4 Automatizaciones (lo que Zoho llama "workflows")

| Trigger | Acción |
|---|---|
| Cliente envía intake | ntfy "📥 Nuevo briefing de X" + interaction automática |
| Cliente abre el link | evento "visto" + ntfy (una vez por día máx.) |
| Cliente aprueba | status→aprobado, ntfy, snapshot de versión final |
| Cliente comenta | ntfy + status→negociacion si estaba enviado |
| Deadline/validez a 3 días | ntfy recordatorio (cron job Vercel diario, reutilizar patrón de monitors) |
| Convertir a proyecto | crea `projects` (título, cliente), ítems entregables → tareas/interactions pendientes, `finances` ingreso proyectado por agreedBudget, briefing→convertido e inmutable |

### 2.5 Analítica (`/admin/briefings` cabecera + sección en `/admin/index`)

- Funnel: recibidos → enviados → aprobados → convertidos (últimos 90 días).
- Tasa de conversión y tiempo medio recibido→aprobado.
- Valor de pipeline por estado; comparación estimado vs acordado (cuánto se negocia a la baja).

---

## 3. Fases de implementación

### Fase 1 — Fundamentos (esfuerzo: ~1 sesión)
1. Migración Drizzle: columnas nuevas en `briefings` + `briefing_items` + `briefingId` en `interactions` (⚠️ recordar gotcha de migraciones del proyecto).
2. Validación zod en las APIs + soft delete.
3. Detalle: checklist de ítems (CRUD inline) migrando los textarea; script one-off que convierta texto existente en ítems (split por líneas).
4. Timeline en el detalle usando `interactions`.

### Fase 2 — Pipeline y UX del panel (~1 sesión)
5. Nuevos estados + vista kanban con drag & drop (vanilla JS, sin librerías pesadas — consistente con el resto del admin).
6. Filtros, búsqueda y métricas de cabecera.
7. Prioridad, validez, indicadores de deadline.
8. Plantillas + botón Duplicar.

### Fase 3 — Portal del cliente (~1–2 sesiones) ← mayor diferenciador
9. `shareToken` + página pública `/briefing/[token]` con branding.
10. Aprobación con firma ligera + comentarios del cliente.
11. Eventos (visto/comentado/aprobado) → timeline + ntfy.
12. Versionado: snapshot automático al editar campos materiales tras `enviado`.

### Fase 4 — Intake y conversión (~1 sesión)
13. Formulario público de intake multi-paso con anti-spam.
14. Acción "Convertir a proyecto" (proyecto + finanzas + pendientes).
15. Adjuntos vía Vercel Blob.

### Fase 5 — Automatización y analítica (~1 sesión)
16. Cron diario de recordatorios (deadlines y propuestas por expirar).
17. Funnel y métricas en admin.
18. OG image para el link compartido (reutilizar pipeline de OG existente).

### Orden recomendado de valor
Fase 1 → 3 → 2 → 4 → 5. El portal del cliente (F3) es lo que más se nota de cara afuera y lo que ninguna tabla CRUD te da; el kanban (F2) es cosmético hasta que hay volumen.

---

## 4. Decisiones y descartes deliberados

- **Sin e-signature legal (DocuSign/Zoho Sign)**: la aceptación con nombre+email+timestamp+IP es suficiente para freelance; integrar firma certificada es sobre-ingeniería aquí.
- **Sin editor WYSIWYG**: textareas con soporte de saltos de línea bastan; opcionalmente markdown render en la página pública.
- **Sin multiusuario/roles**: el admin es de una sola persona; el "rol cliente" existe solo vía token.
- **Sin email transaccional por ahora**: ntfy cubre las alertas a Mike; el cliente recibe el link por el canal que ya se use (WhatsApp/email manual). Se puede añadir Resend en una fase 6 si hace falta.
