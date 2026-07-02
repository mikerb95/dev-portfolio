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
