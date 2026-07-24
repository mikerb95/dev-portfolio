# Plan — Portal de Clientes

> Creado: 2026-07-15. **Implementado: Fases 0–7 completas (2026-07-24).**
> Continuación viva en [`plan-portal-tiempo-real.md`](./plan-portal-tiempo-real.md)
> (capa de actualización en vivo + feed de actividad).
> Portal autenticado donde cada cliente ve el estado de sus proyectos, sus finanzas/facturas,
> se comunica contigo y recibe notificaciones. Nivel: lo que un cliente corporativo espera
> del panel de un producto contratado.

---

## 1. Decisiones de diseño (cerradas)

| Tema | Decisión |
|---|---|
| Ubicación | `/portal` dentro del mismo proyecto Astro (codebymike.tech). Migrable a subdominio después. |
| Autenticación | Email + contraseña, con invitación previa (no hay registro abierto). Passkey opcional en fase posterior. |
| Multi-usuario | **Multi-usuario con roles desde el MVP**: una empresa cliente puede tener N usuarios (`owner`, `member`, `billing`). |
| Módulos MVP | Estado del proyecto, Finanzas y facturas, Comunicación/mensajes, Documentos y entregables. |
| Notificaciones | Email transaccional (**Resend**) + centro in-app (campana con no-leídas). |
| Storage adjuntos | **Vercel Blob** (blobs privados + URLs firmadas de corta vida). |
| Pagos | Reutilizar el módulo `payments` existente (Wompi + mock, máquina de estados ya probada). |
| Propósito | Producción real **y** vitrina: tenant demo read-only con datos seed, enlazado desde `/tools`. |

## 2. Principios

1. **Aislamiento de tenant primero.** Toda query del portal filtra por `clientId` derivado de la sesión — nunca de un parámetro de URL. Un helper único (`requirePortalSession()`) resuelve sesión → usuario → cliente → rol, y es la única puerta de entrada.
2. **Sesiones del portal separadas del admin.** Cookie distinta (`portal_session`), tabla distinta. Un cliente jamás toca `auth-astro`/admin, y una sesión admin no da acceso al portal (ni viceversa).
3. **Reutilizar, no duplicar.** `payments`, `monitors`, `finances`, `projects`, `notify.ts`, `ratelimit.ts` y el micro-SIEM ya existen: el portal es una capa de presentación + permisos encima.
4. **Todo evento sensible al micro-SIEM** (`securityEvents`): logins, fallos, invitaciones, cambios de contraseña, descargas de documentos, pagos.
5. **El demo es el mismo código.** El tenant demo no es una maqueta: es un cliente real en DB con flag `isDemo`, escrituras bloqueadas a nivel de helper.

## 3. Modelo de datos (nuevas tablas Drizzle)

```
client_users          — usuarios del portal (N por cliente)
  id, clientId → clients.id, email UNIQUE, name, passwordHash (scrypt),
  role: 'owner' | 'member' | 'billing', status: 'invited' | 'active' | 'disabled',
  lastLoginAt, createdAt

client_invitations    — invitaciones con token de un solo uso
  id, clientId, email, role, tokenHash, invitedBy (admin | client_user id),
  expiresAt (72h), acceptedAt, createdAt

portal_sessions       — sesiones opacas del portal (revocables)
  id (token hash), clientUserId, ip, userAgent, createdAt, expiresAt, revokedAt

invoices              — factura formal (finances queda como libro contable interno)
  id, clientId, projectId?, number ('INV-2026-001' correlativo), status:
  'draft' | 'sent' | 'paid' | 'overdue' | 'void', currency, subtotalCents,
  taxCents, totalCents, issuedAt, dueAt, paidAt, paymentId → payments.id?,
  notes, pdfBlobUrl?, createdAt

invoice_items         — líneas de factura
  id, invoiceId, description, quantity, unitCents, totalCents

portal_threads        — hilos de conversación por cliente (opcionalmente por proyecto)
  id, clientId, projectId?, subject, status: 'open' | 'closed',
  lastMessageAt, createdAt

portal_messages       — mensajes de un hilo
  id, threadId, authorType: 'admin' | 'client', authorUserId?, body (markdown
  limitado), createdAt  — lecturas por usuario en portal_message_reads

portal_documents      — documentos y entregables
  id, clientId, projectId?, title, category: 'contrato' | 'entregable' |
  'factura' | 'acta' | 'otro', blobKey, mimeType, sizeBytes, version,
  uploadedBy: 'admin' | 'client', visibleToClient (bool), createdAt

portal_notifications  — centro de notificaciones in-app
  id, clientUserId, type: 'invoice' | 'message' | 'milestone' | 'incident' |
  'document' | 'system', title, body, href, readAt, emailedAt, createdAt

project_milestones    — hitos visibles del proyecto (timeline del dashboard)
  id, projectId, title, description, status: 'pendiente' | 'en_curso' |
  'completado', dueAt, completedAt, visibleToClient (bool), sortOrder

portal_audit_log      — auditoría de acciones del cliente
  id, clientUserId, action, entity, entityId, ip, createdAt
```

Cambios a tablas existentes:
- `clients`: + `isDemo` (bool), + `portalEnabled` (bool), + `logoUrl?`, + `billingInfo?` (NIT/dirección para facturas).
- `payments`: + `invoiceId?` (nullable, para vincular checkout → factura).
- La tabla `messages` actual (formulario de contacto público) **no se toca**; los hilos del portal son tablas nuevas.

## 4. Autenticación y seguridad

- **Password hashing**: `crypto.scrypt` de Node (sin dependencia nueva), parámetros N=2^15, sal por usuario. Formato `scrypt$N$salt$hash` para poder migrar parámetros.
- **Flujo de alta**: tú creas el cliente y lo invitas desde `/admin/clients` → email Resend con token (72h) → el invitado define nombre + contraseña → sesión iniciada. Un `owner` puede a su vez invitar a más usuarios de su empresa.
- **Sesiones**: token opaco de 256 bits, solo el hash en DB, cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, vida 30 días con renovación deslizante. Pantalla "Sesiones activas" con revocación (mismo patrón que tu `adminSessions`).
- **Recuperación de contraseña**: token de un solo uso por email, 30 min, invalida sesiones existentes.
- **Rate limiting** (reutilizar `rateLimitBuckets`): login 5/15min por email+IP, reset 3/h, mensajes 20/h.
- **Bloqueo progresivo**: 10 fallos seguidos → cuenta bloqueada 15 min + notificación al owner y a ti (ntfy).
- **Middleware**: `/portal/*` exige sesión válida (excepto `/portal/login`, `/portal/invite/[token]`, `/portal/reset`). Headers `X-Robots-Tag: noindex`, y `/portal` fuera del sitemap.
- **Permisos por rol**:
  - `owner`: todo + gestionar usuarios de su empresa.
  - `member`: proyectos, mensajes, documentos; ve facturas pero no paga.
  - `billing`: facturas y pagos; sin mensajes ni documentos técnicos.
- **SIEM**: eventos `portal.login.ok/fail`, `portal.invite.sent/accepted`, `portal.password.reset`, `portal.doc.download`, `portal.payment.initiated` hacia `securityEvents`.

## 5. Módulos y pantallas

### `/portal` — Dashboard (Estado del proyecto)
- Saludo con nombre + empresa, selector de proyecto si tiene varios.
- Por proyecto: estado, timeline de hitos (`project_milestones`), % de avance calculado, próximo hito con fecha.
- **Salud en vivo** reutilizando `monitors`: uptime 30d, latencia, incidentes recientes de *sus* monitores (nuevo campo `monitors.projectId` o mapping) — esto es lo que un cliente robusto casi nunca recibe y más impresiona.
- Tarjetas resumen: facturas pendientes (monto), mensajes sin leer, últimos documentos.

### `/portal/facturas` — Finanzas
- Lista de facturas con estado, vencimiento y total; detalle con líneas e impuestos.
- **Pagar en línea**: botón que crea el checkout Wompi vía tu `payments.ts` con `invoiceId` vinculado; el webhook aprobado marca `invoices.status = 'paid'` y dispara notificación + email de recibo.
- Descarga PDF de factura (generación server-side, guardada en Blob).
- Historial de pagos y saldo total del año. `overdue` automático vía cron diario existente.

### `/portal/mensajes` — Comunicación
- Hilos por proyecto: lista con badge de no leídos, vista de conversación, respuesta con markdown limitado (negrita, listas, enlaces, código).
- Adjuntos → `portal_documents` (aparecen también en Documentos).
- Del lado admin: bandeja en `/admin/portal/mensajes` + push ntfy cuando el cliente escribe. Cliente recibe email Resend cuando tú respondes (con throttle: máx 1 email por hilo por hora).

### `/portal/documentos` — Documentos y entregables
- Grid/lista filtrable por proyecto y categoría; versionado simple (subir nueva versión conserva historial).
- Descarga vía endpoint que valida sesión + tenant y redirige a URL firmada de Blob (5 min).
- Subida por el cliente permitida (máx 25 MB, whitelist de MIME) — para contratos firmados, insumos, etc.
- Del lado admin: gestor en `/admin/portal/documentos` con toggle `visibleToClient`.

### `/portal/notificaciones` + campana global
- Campana en el header del portal con contador; panel de recientes; página con historial completo.
- Preferencias por usuario: qué tipos llegan por email (facturas siempre, resto opt-out).
- Emisor central `notifyClient(userIds, type, payload)`: escribe in-app + encola email Resend con plantilla de marca. Plantillas: invitación, reset, factura emitida, pago recibido, mensaje nuevo, hito completado, incidente resuelto.

### `/portal/cuenta` — Configuración
- Perfil, cambio de contraseña, sesiones activas con revocación.
- (Solo `owner`) Usuarios de la empresa: invitar, cambiar rol, desactivar.
- Datos de facturación de la empresa.

### Lado admin (extensiones a `/admin`)
- `/admin/clients`: habilitar portal, invitar usuarios, "ver como cliente" (impersonación read-only con banner, auditada).
- `/admin/portal/facturas`: CRUD de facturas + emitir (genera PDF + email).
- Hitos editables desde la ficha de proyecto existente.

## 6. Tenant demo (vitrina)

- Cliente seed "Acme Estudio Legal" con `isDemo = true`: 2 proyectos, hitos, 6 facturas (una pagada vía mock), hilos con conversación realista, documentos dummy, monitores con historial.
- Acceso desde `/tools` → botón "Probar portal demo" → sesión demo automática sin credenciales (endpoint que crea sesión efímera de 30 min sobre el usuario demo).
- Guard central: si `isDemo`, todos los POST/PUT/DELETE devuelven 403 amable ("Modo demo: solo lectura") excepto el pago mock, que sí se permite para lucir el flujo completo.
- Cron nocturno re-seedea el tenant demo a su estado canónico.

## 7. Fases de implementación

### Fase 0 — Fundaciones (esquema + auth) ✅
> `src/lib/portal/{session,login,passwords,invitations}.ts`, tablas `client_users`/`client_invitations`/`portal_sessions`/`portal_audit_log`, gate en `src/middleware.ts:270`, allowlist en `src/lib/portal/paths.ts`. Rate limit por IP vía `isAuthPath()` + bloqueo por cuenta en `login.ts`. Tests: `tests/portal-{passwords,paths,isolation}.test.ts`.
1. Migraciones Drizzle: `client_users`, `client_invitations`, `portal_sessions`, `portal_audit_log` + campos nuevos en `clients`.
2. `src/lib/portal/auth.ts`: hash scrypt, crear/validar/revocar sesión, `requirePortalSession()` con rol.
3. Middleware para `/portal/*` + noindex.
4. Resend: cuenta, dominio verificado (SPF/DKIM), `src/lib/email.ts` + plantilla base de marca.
5. Flujo completo: invitación desde admin → email → aceptar → login → logout → reset.
6. Rate limits + eventos SIEM de auth. Tests de unidad del módulo auth (aislamiento tenant, expiración, roles).

### Fase 1 — Dashboard de estado ✅
> `src/pages/portal/index.astro`, `src/lib/portal/projects.ts` (hitos, `computeProgress`, `projectHealth` sobre los monitores reales), `project_milestones` + `monitors.projectId`, editor en `/admin/portal/hitos`.
1. Migración `project_milestones` (+ `monitors.projectId`).
2. Layout del portal (header con campana, nav, selector de proyecto) reutilizando tu sistema de estilos.
3. Página `/portal` con timeline, salud de monitores y tarjetas resumen.
4. Editor de hitos en admin.

### Fase 2 — Finanzas y facturas ✅
> `/portal/facturas`, `src/lib/portal/{invoices,invoice-pdf,settlement}.ts`, `/api/portal/facturas/[id]/{pagar,pdf}`, cron `/api/cron/invoices-overdue`. Tests: `tests/portal-invoices.test.ts`.
1. Migraciones `invoices`, `invoice_items` (+ `payments.invoiceId`).
2. Admin: CRUD + emisión (correlativo, PDF a Blob, email).
3. Portal: lista, detalle, descarga PDF.
4. Checkout Wompi vinculado a factura; webhook → `paid` + recibo. Cron `overdue`.
5. Tests: estados de factura, webhook fuera de orden no rompe el vínculo.

### Fase 3 — Mensajes ✅
> `/portal/mensajes`, `src/lib/portal/threads.ts`, bandeja admin en `/admin/portal/mensajes`.
1. Migraciones `portal_threads`, `portal_messages`, `portal_message_reads`.
2. UI portal (hilos, conversación, markdown sanitizado) + bandeja admin.
3. Notificaciones cruzadas: ntfy hacia ti, email/in-app hacia el cliente (con throttle).

### Fase 4 — Documentos ✅
> `/portal/documentos`, `src/lib/portal/documents.ts`, descarga con URL firmada y validación de tenant.
1. Vercel Blob (privado) + migración `portal_documents`.
2. Endpoint de descarga firmada con validación tenant; subida con límites y whitelist MIME.
3. UI portal + gestor admin con `visibleToClient` y versionado.

### Fase 5 — Notificaciones y cuenta ✅
> `src/lib/portal/notifications.ts`, campana en `PortalLayout.astro`, `/portal/notificaciones`, `/portal/cuenta` + `/api/portal/cuenta/{perfil,password,sesiones,equipo,preferencias}`.
1. Migración `portal_notifications` + emisor `notifyClient()` cableado a los módulos anteriores.
2. Campana + página de historial + preferencias de email.
3. `/portal/cuenta`: perfil, contraseña, sesiones, gestión de usuarios (owner).

### Fase 6 — Tenant demo y vitrina ✅
> `src/lib/portal/demo.ts`, `scripts/seed-demo.mjs`, `/api/portal/demo`, cron `/api/cron/portal-demo-reseed`, tarjeta en `/tools`. Tests: `tests/portal-demo.test.ts`.
1. Script seed del demo + guard read-only + sesión demo efímera + cron de re-seed.
2. Tarjeta en `/tools` y mención en README/roadmap.

### Fase 7 — Hardening y pulido ✅
> `e2e/portal.spec.ts`, `tests/portal-isolation.test.ts` (recurso ajeno → vacío/404), impersonación auditada y read-only (`/api/admin/clients/[id]/impersonate` + corte en `middleware.ts:295` y en `/api/payments/mock/pay`).
1. e2e (Playwright) del camino crítico: invitación → login → ver factura → pagar (mock) → recibir notificación.
2. Auditoría de aislamiento: test que intenta acceder a recursos de otro tenant con sesión válida (debe dar 404, no 403, para no filtrar existencia).
3. A11y (foco, contraste, navegación teclado), OG/meta del login, revisión de rate limits con datos reales.
4. Impersonación "ver como cliente" auditada. Monitor de uptime del propio portal en `/status`.

**Orden de valor:** cada fase es desplegable por sí sola. Con Fases 0–2 ya puedes dar acceso a un cliente real (estado + facturas + pago). Estimación gruesa: F0 y F2 son las más pesadas; F1/F3/F4/F5 medianas; F6/F7 ligeras.

## 8. Ideas para después (backlog)

- **Passkeys para clientes** (reutilizando tu infra WebAuthn) como segundo factor o passwordless.
- **Aprobación de entregables**: el cliente marca "aprobado/con observaciones" sobre un documento → queda en el audit log (valor contractual).
- **Changelog por proyecto**: feed de deploys/cambios visible al cliente (conectado a tus `ciRuns`).
- **Reportes mensuales automáticos**: email con uptime, avance de hitos y estado financiero (cron mensual).
- **SLA por proyecto**: objetivo de uptime pactado y su cumplimiento, sobre tus SLOs del LAB.
- **Onboarding checklist** para clientes nuevos (pasos: firmar contrato, pagar anticipo, entregar accesos).
- **Branding por tenant**: logo del cliente en el header del portal y en los PDFs de factura.
- **i18n ES/EN** del portal.
- Migración a subdominio `clientes.codebymike.tech` cuando haya volumen.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fuga entre tenants (el riesgo nº1) | Helper único de sesión, queries siempre por `clientId` de sesión, test e2e de aislamiento, 404 en recursos ajenos. |
| Entregabilidad de email (magic de todo el flujo de invitación) | SPF/DKIM/DMARC verificados en Resend antes de la Fase 0.5; email de prueba a Gmail/Outlook. |
| PDFs de factura en serverless | Generar con librería ligera (p. ej. `pdf-lib`) y cachear en Blob; nunca generar on-the-fly en cada descarga. |
| Demo vandalizable | Guard read-only central + re-seed nocturno + rate limit en sesión demo. |
| Scope creep del MVP | Los 4 módulos elegidos y nada más; el resto vive en §8. |
