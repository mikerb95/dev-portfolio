# CodeByMike — Portafolio + Panel de Control

Portafolio público y **panel de control privado** construido con Astro 6 (SSR),
Turso/libSQL + Drizzle, Auth.js (GitHub OAuth) y Tailwind 4. Desplegado en Vercel.

El panel (`/admin`) es una fuente centralizada de información privada:
clientes, proyectos, **costos de infraestructura con P&L**, **bóveda de
credenciales cifrada**, **seguimiento (llamadas/reuniones/notas con
recordatorios)**, briefings, finanzas, certificaciones y backups.

## Características del panel

- **Portafolio**: elige qué repos de GitHub se muestran (`/admin/repos`), con stack auto-importado.
- **Costos & P&L** (`/admin/costs`): costo por servicio (multi-moneda → USD base), ciclo de cobro, renovaciones con alertas, responsable de pago, y margen por proyecto/cliente.
- **Bóveda de credenciales**: API keys/tokens/contraseñas por servicio, cifradas con AES-256-GCM, reveladas solo bajo demanda.
- **Seguimiento** (`/admin/seguimiento`): bitácora de interacciones + tablero de pendientes (vencidos/próximos).
- **Ajustes** (`/admin/settings`): tasas de cambio, estado de seguridad.
- **Mobile-first**: drawer responsive, tablas que se vuelven tarjetas en móvil.

## Seguridad

- Acceso restringido por **GitHub OAuth + allowlist** (`ALLOWED_GITHUB_LOGINS`), validada en el callback de login y en el middleware (defensa en profundidad).
- Secretos cifrados con **AES-256-GCM** (`ENCRYPTION_KEY`); nunca se exponen en listados ni en el HTML SSR, solo vía endpoints de revelado.
- Cabeceras de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `noindex`) en todas las rutas `/admin`.

## Licencia

**Software propietario — Todos los derechos reservados.**
© 2026 Mike (@mikerb95) — codebymike.tech

Este repositorio es público **solo** con fines de portafolio y demostración.
No se concede ningún permiso de uso, copia, modificación, distribución ni
reutilización del código. Ver [`LICENSE`](./LICENSE) para los términos completos.
