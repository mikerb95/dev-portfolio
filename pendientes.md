# Pendientes — Panel de Control CodeByMike

> Estado (jul 2026): el **código de las 7 fases está completo** y la **configuración de entorno
> ya quedó hecha** (ver historial abajo). La base Turso está migrada; ya tiene proyectos con
> portadas y tasas FX cargadas.

---

## ✅ Configuración completada (jul 2 2026)

1. **`ENCRYPTION_KEY`** — en `.env` local y en Vercel (Production + Preview), mismo valor (64 hex).
   ⚠️ No cambiarla una vez haya datos cifrados. Confirmado activo en prod (el endpoint cron
   responde 200, lo que prueba que las env vars ya cargan en las funciones).
2. **OAuth GitHub** — `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` en `.env` local y Vercel Production.
   - [ ] (Opcional) limpiar `DEV_USER`/`DEV_PASSWORD` de `.env` y Vercel: sobran desde que se
     cambió al provider de GitHub.
3. **Tasas de cambio** — cargadas en `app_settings`: `fx_COP_per_USD=3401.62`,
   `fx_EUR_per_USD=0.8783` (jul 2 2026). Actualizables desde `/admin/settings`.
4. **`CRON_SECRET`** — generado, en `.env` local y Vercel Production. Verificado en prod
   (200 con Bearer correcto, 401 sin header).

## ✅ Monitores (jul 2 2026) — funcionando en producción

- 8 monitores dados de alta en `monitors`: los 7 proyectos (por `preview_url`) + codebymike.tech.
- Motor verificado end-to-end contra prod: `GET https://codebymike.tech/api/cron/uptime-check`
  con Bearer → 8/8 `up`, latencias y SSL registrados en `monitor_checks`.
- **Job de cron-job.org creado** ("Cron Job Monitor CodeByMike", cada 5 min).
  - [ ] Confirmar en el EDIT del job que el header `Authorization: Bearer <CRON_SECRET>` quedó
    guardado (si falta, el HISTORY mostrará 401 en rojo).

## ✅ Notificaciones push (jul 2 2026)

- Canal **ntfy.sh** (gratis, sin features pagas). Topic secreto `NTFY_TOPIC` en `.env` local y
  Vercel Production. El cron dispara push en cada transición (caída / recuperación / SSL).
- **Bug corregido**: el header `Title` de ntfy llevaba emoji → `fetch` lanzaba TypeError y
  `sendPush` lo tragaba en silencio (ninguna alerta llegaba nunca). Fix en `src/lib/notify.ts`
  (`headerSafe()`): quita emoji del header y codifica UTF-8→latin1 para conservar acentos.
- Verificado end-to-end en local (monitor de prueba → push entregado con título correcto).
- [ ] **Acción tuya**: instalar la app **ntfy** en el celular y suscribirte al topic
  `NTFY_TOPIC` (valor en `.env`). Sin suscribirte, las alertas se envían pero no las ves.
- ⚠️ En prod las alertas empiezan a llegar tras el **próximo deploy** (que carga `NTFY_TOPIC`
  y el fix de `notify.ts`). El push de este repo ya dispara ese deploy.
- (Opcional) Email vía Resend: falta `RESEND_API_KEY` + `ALERT_EMAIL_TO` + verificar dominio.

## ⚠️ Pendiente real (menor)

- [ ] Verificar en prod que la bóveda cifra/revela credenciales en `/admin/projects/[id]` y que
  los costos en COP suman al P&L en `/admin/costs` (probar creando un servicio con secreto).

---

## Qué se construyó (contexto para retomar)

Evolución del CRM a **panel de control completo**, mobile-first, sobre lo existente
(Astro 6 SSR + Turso/Drizzle + Auth.js GitHub + Tailwind 4):

- **Costos & P&L** — `/admin/costs`: costo por servicio (multi-moneda → USD base), ciclo,
  renovaciones con alerta, responsable de pago; margen por proyecto/cliente en dashboard y detalle.
  Libs: `src/lib/money.ts`, `src/lib/pnl.ts`, `src/lib/services.ts`.
- **Bóveda cifrada** — credenciales por servicio en `project_services.secrets` (AES‑256‑GCM,
  `src/lib/crypto.ts`); revelado bajo demanda (`/api/admin/services/[id]/secrets.ts`). Nunca en listados/SSR.
- **Seguimiento/CRM** — `/admin/seguimiento`: bitácora + tablero de pendientes (vencidos/próximos).
  Tabla `interactions`, `src/lib/interactions.ts`, componente `InteractionTimeline.astro`.
- **Shell mobile-first** — `AdminLayout.astro` con drawer CSS-only; `Sidebar.astro` reagrupado;
  tablas → tarjetas en móvil (`FinanceTable`, `CostTable`).
- **Seguridad** — allowlist `ALLOWED_GITHUB_LOGINS` revalidada en `src/middleware.ts` + headers.
- **Datos** — schema en `src/db/schema.ts`; migración `drizzle/0001_huge_the_captain.sql` (ya aplicada).
- **Armonización** — `repos.astro` (restyle + metadata), `finances.astro`, `projects/index.astro`,
  color maps de `projects/[id].astro`; locale unificado a `es-CO`.

Verificación hecha: `npm run build` OK · tablas/columnas nuevas confirmadas en Turso ·
9 páginas admin renderizan 200 (probado con bypass temporal, ya revertido) · sin errores en runtime.

---

## Cómo retomar (entorno)

- **Node**: el shell default trae v20 y rompe Astro. Anteponer el binario de nvm:
  ```sh
  export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"
  ```
- Build / dev: `npm run build` · `npm run dev` (localhost:4321).
- Migraciones: cargar credenciales antes de drizzle-kit:
  ```sh
  export $(grep -E '^TURSO_' .env | xargs) && npx drizzle-kit generate   # y luego migrate
  ```

## Mejora futura (opcional, no urgente)

- [ ] `src/pages/admin/projects/[id].astro` (922 líneas): quedan grises `zinc-*` internos sin migrar
  a la paleta `ink-*` (son visualmente cercanos). Se migraron los badges de estado y los tabs.

---

## 📋 Panel de Briefings — plan en curso (jul 6 2026)

Plan completo con comparación vs. Zoho en `docs/plan-briefings.md`. Orden de valor: **Fase 1 → 3 → 2 → 4 → 5**.

### ✅ Fase 1 — Fundamentos (completada jul 6 2026)

- `briefing_items` (checklist requerimiento/entregable/exclusión), `deletedAt` en `briefings`
  (soft delete), `briefingId` en `interactions` (timeline). Migraciones `drizzle/0008`, `0009`.
- Columnas viejas `requirements`/`deliverables` (texto plano) eliminadas — no había datos que migrar.
- APIs actualizadas (`src/pages/api/admin/briefings/**`): soft delete, validación manual (sin zod,
  el proyecto no lo usa en ningún lado más), nuevos endpoints `[id]/items` y `[id]/items/[itemId]`.
- UI: checklist con tachado en `[id].astro` + sección de Actividad (timeline de `interactions`).
- Verificado: `npm run build` OK + capa de datos probada directo contra Turso (insert, cascada,
  soft-delete). **No verificado en navegador** — el login admin usa GitHub OAuth y no hay forma
  de automatizarlo sin credenciales; falta que Mike lo pruebe manualmente en `/admin/briefings`.

### ⏭️ Próxima sesión — Fase 3: Portal del cliente (mayor diferenciador)

1. `shareToken` en `briefings` (mismo patrón que `presentations.shareToken`) + `sharedAt`,
   `approvedAt`, `approvedByName`, `approvedByEmail`, `validUntil`.
2. Página pública `/briefing/[token]` (branding tipo `/status`/slides): objetivo, alcance, ítems,
   presupuesto, condiciones.
3. Aprobación con firma ligera (nombre + email + checkbox + timestamp + IP) y comentarios del
   cliente (`briefing_comments`).
4. Eventos automáticos → timeline (`interactions.briefingId`) + push ntfy ("visto", "comentó",
   "aprobó").
5. Versionado (`briefing_versions`): snapshot al editar campos materiales tras estado `enviado`.

### Después: Fase 2 (kanban+filtros+prioridad), Fase 4 (intake público + convertir a proyecto),
Fase 5 (recordatorios cron + funnel de conversión). Detalle de cada una en `docs/plan-briefings.md`.

---

## 🎞️ Presentaciones: quitar Microsoft, usar el reproductor nativo (elegido jul 6 2026)

**Contexto:** el tab "Presentación" de `src/pages/admin/projects/[id].astro` (líneas ~640-678)
previsualiza el `.pptx` embebiendo el visor de Office Online
(`https://view.officeapps.live.com/op/embed.aspx?...`). Esto (a) depende de Microsoft y
(b) lo rompe la CSP nueva del middleware (`default-src 'self'` sin `frame-src` bloquea el iframe;
el spinner "Cargando presentación…" se queda girando para siempre).

**Decisión:** reemplazarlo por el **reproductor de slides nativo que ya existe** (imágenes en
Vercel Blob). Ese sistema ya está construido y la tabla `presentations` ya tiene `projectId`:
- `presentations` / `presentation_slides` (schema.ts:184-200) — ya enlazan por proyecto.
- `src/pages/admin/slides/[id]/present.astro` — modo proyector (renderiza `<img>` por slide). Ya existe.
- `src/pages/admin/slides/[id]/control.astro` — control remoto con thumbnails. Ya existe.
- `src/pages/api/slides/create.ts` — crea presentación para un `projectId`. Ya existe.
- `src/pages/api/slides/[id]/upload.ts` — sube slides como PNG a Vercel Blob. Ya existe.
- `src/pages/api/slides/[id]/state.ts` — sync del slide actual. Ya existe.

**Trabajo a hacer** (solo cablear el tab; el back ya está):
1. En `projects/[id].astro`, lado servidor: reemplazar la lógica `hasPptx`/`pptxPublicPath`
   (busca `public/docs/{slug}.pptx`) por una consulta a `presentations` where `projectId = project.id`
   + sus `presentation_slides`.
2. Tab "Presentación":
   - Si el proyecto **tiene** presentación: grilla de miniaturas (imágenes) + botones a
     "Modo proyector" (`/admin/slides/{id}/present`) y "Control remoto" (`/admin/slides/{id}/control`),
     + control para subir más slides (POST `/api/slides/{id}/upload`).
   - Si **no** tiene: botón "Crear presentación" → POST `/api/slides/create` con `projectId` + título.
3. **Borrar el `<iframe>` de Office Online** por completo → elimina Microsoft y arregla el break de CSP.

**No hay que tocar la CSP:** ya permite las imágenes de Blob (`img-src 'self' data: https:`).

**Nota de flujo:** el deck deja de ser un `.pptx`; se exporta cada slide como PNG
(PowerPoint/Keynote/Google Slides → "Exportar como imágenes") y se sube desde el tab.
Las presentaciones viejas en `.pptx` (`public/docs/*.pptx`) no migran solas: hay que recrearlas.
Decisión abierta: ¿mantener el botón de descarga del `.pptx` si el archivo aún existe? (a definir).

**Relacionado (misma sesión, revisión de seguridad OWASP):** la CSP se agregó en `src/middleware.ts`
y su string está **duplicado** en la rama admin y la pública (candidato a extraer a una constante).
Aparte, el `<link>` a Google Fonts en `AdminLayout.astro` también lo bloquea la CSP pero es
cosmético (las fuentes se self-hostean vía `@fontsource` en `global.css`); se puede quitar el
`<link>` externo. Ambos son menores, no urgentes.
