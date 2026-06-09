# Pendientes — Panel de Control CodeByMike

> Estado al cierre de sesión (jun 2026): el **código de las 7 fases está completo, compila y
> renderiza sin errores**. Lo que queda es **configuración de entorno** (secretos) que solo Mike
> puede poner. La base de datos Turso está migrada y **vacía** (cero data dummy).

---

## ⚠️ Configuración pendiente (esto es lo que falta)

### 1. `ENCRYPTION_KEY` — necesaria para la bóveda de credenciales y las env vars
Llave de 32 bytes (64 hex) para cifrar/descifrar con AES‑256‑GCM. Sin ella, guardar/revelar
credenciales devuelve *"Falta configurar ENCRYPTION_KEY…"*. Hoy **no está** en `.env` y **no hay
datos cifrados** (0 filas), así que generar una ahora es seguro.

- [ ] Generar:
  ```sh
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Pegar el **mismo valor** en `.env` (local) y en Vercel (Environment Variables).
- ⚠️ Local y prod comparten la **misma base Turso** → la llave debe ser idéntica en ambos.
  Una vez que se cifren datos con ella, **no cambiarla** (volvería ilegible lo cifrado).

### 2. `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` — login OAuth en local
`auth.config.ts` los usa pero no están en `.env`. En producción probablemente ya están en Vercel
(el sitio desplegado ya usa login de GitHub).

- [ ] Crear/copiar una OAuth App en github.com/settings/developers y poner ambos en `.env`.
- [ ] Confirmar que existen también en Vercel.
- [ ] (Opcional) limpiar `DEV_USER`/`DEV_PASSWORD` del `.env`: sobran desde que se cambió al provider de GitHub.

### 3. Tasas de cambio (opcional, no bloquea)
- [ ] En `/admin/settings`, cargar `COP/USD` (y las que uses) para que los costos en otras monedas
  se conviertan a USD. Sin esto, esos costos muestran "sin tasa" y no suman al total.

### 4. Deploy
- [ ] Push a `main` → Vercel despliega. Verificar `/admin`, `/admin/costs`, `/admin/seguimiento`,
  `/admin/settings` en producción con tu login.

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
