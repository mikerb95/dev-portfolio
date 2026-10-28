# 13 · Base de datos

- **Motor**: Turso (libSQL, compatible con SQLite) con **Drizzle ORM**.
- **Esquema único**: [`src/db/schema.ts`](../../src/db/schema.ts). Es la fuente
  de verdad; las migraciones se generan desde ahí.
- **Dos bases** con el mismo esquema: principal (`TURSO_DATABASE_URL`) y demo
  (`TURSO_DEMO_URL`). Las migraciones se aplican a **ambas**.
- **Local**: `compose.yaml` levanta dos `sqld` (puertos 8080 y 8081); e2e usa
  archivos libSQL desechables en `.e2e/`, y el dev puede usar `.dev-db/`.

## Tablas por dominio (90)

| Dominio | Tablas |
|---|---|
| **CRM y negocio** | `clients`, `projects`, `messages` (formulario de contacto), `finances` (ingresos), `interactions` (seguimiento), `briefings`, `briefing_items`, `project_contacts`, `project_adrs`, `project_env_vars`, `project_services` (costos + secretos cifrados) |
| **Perfil y aprendizaje** | `education_milestones`, `education_lab_progress`, `skill_tracks`, `skill_sessions`, `skill_milestones` |
| **Observabilidad** | `monitors`, `monitor_checks` (crudo), `monitor_daily` (rollup), `monitor_incidents`, `web_vitals`, `cron_runs`, `aeo_diario` |
| **LAB** | `ci_runs`, `security_findings`, `chaos_flags`, `lab_experiments`, `load_test_runs`, `fp_rooms`, `fp_devices`, `cv_downloads` |
| **Pagos** | `payments` (también los cobros de campo), `payment_events` |
| **Auth admin** | `admin_sessions`, `webauthn_credentials`, `webauthn_challenges` |
| **Micro-SIEM** | `security_events` (amenazas **y** auditoría), `security_rollups`, `blocked_ips`, `rate_limit_buckets`, `security_anomalies` |
| **Portal** | `client_users`, `client_invitations`, `portal_sessions`, `portal_audit_log`, `project_milestones`, `invoices`, `invoice_items`, `portal_threads`, `portal_messages`, `portal_message_reads`, `portal_documents`, `portal_notifications`, `portal_notification_prefs`, `portal_activity` |
| **Presentaciones** | `decks`, `deck_slides`, `presentation_feedback`; heredadas sin código: `presentations`, `presentation_slides` |
| **Capacitación** | `training_programs`, `training_resources`, `training_access_codes` |
| **SENA** | `sena_ep_recordatorios`, `ep_agenda_episodios` |
| **Cómputo** | `compute_usage_hourly`, `compute_batches`, `compute_rates`, `compute_terms`, `compute_periods` |
| **Finanzas personales** | `living_costs`, `living_expenses` |
| **IA** | `analista_ejecuciones`, `asesor_conversaciones`, `asesor_mensajes`, `asistente_conversaciones`, `vigia_corridas` |
| **Plano** | `propuestas`, `propuesta_versiones`, `propuesta_horas` |
| **Cotiza** | `cotiza_encargos`, `cotiza_solicitudes`, `cotiza_reuniones`, `cotiza_rondas`, `cotiza_adicionales` |
| **Marketing** | `marketing_suscriptores`, `marketing_campanas`, `marketing_envios` |
| **Sistema** | `app_settings` (clave/valor: ajustes, cachés tipo "foto" con TTL, contadores de gasto de IA, resumen semanal, reglas de Plano, PIN de Cotiza) |

Las cuentas de cobro (`/admin/cuentas-cobro`) **no tienen tabla propia**: son
filas de `invoices` con `docType = 'cuenta_cobro'` (más `invoice_items`), con
los datos del emisor y los parámetros tributarios en `app_settings`
(`lib/cuentas-cobro-db.ts`).

## Migraciones

```bash
export $(grep -E '^TURSO_' .env | xargs)
npx drizzle-kit generate   # genera drizzle/00XX_*.sql desde src/db/schema.ts
npx drizzle-kit migrate    # aplica contra Turso
```

- **Solo aditivas.** Nunca eliminar una columna o tabla sin pedirlo
  explícitamente (por eso siguen `presentations` y `presentation_slides`).
- **Revisar el SQL generado**: al combinar "añadir columnas + cambiar nullable",
  drizzle-kit puede generar un `INSERT...SELECT` que referencia columnas nuevas
  en la tabla vieja.
- Los archivos de `drizzle/` **nunca se editan a mano**.
- Aplicar también a la base demo (y re-sembrarla si hace falta:
  `npm run seed:demo`).
- Si Turso está bloqueado por cuota, `drizzle-kit migrate` puede **fallar en
  silencio**: verificar después.
- Última migración en la foto: `0050_breezy_iron_man.sql` (51 archivos).

## Coste de lectura

**Turso factura filas escaneadas, no consultas.** Un `count(*)` que devuelve una
fila puede haber escaneado 86.000. La cuota es mensual y **por organización**
(crear otra base no desbloquea nada). Se agotó tres veces (jul y ago 2026) y
bloqueó la base entera a semanas de la sustentación.

Reglas:

1. Ninguna ruta pública agrega `monitor_checks`, `security_events` ni
   `web_vitals` en ventanas de más de 24 h. Para eso están los rollups
   (`monitor_daily`, `security_rollups`). Si un agregado nuevo necesita ventana
   larga, primero se le hace su rollup (RNF-25).
2. Mirar la **ventana temporal** de una query antes que su plan de ejecución.
3. `s-maxage` no acota el consumo: la CDN revalida por región (~1.440 veces al
   día con 60 s).
4. Todo `setInterval` de sondeo escucha `visibilitychange`.
5. Si no hay rollup posible, guardar el resultado como "foto" JSON en
   `app_settings` con TTL (patrón `lib/security/vitrina.ts`): una lectura por
   clave primaria; si recalcular falla, se sirve la foto vieja.
6. Índices en lo que se consulta por fecha (la primera vez faltaban).

Runbook: [`docs/runbook-cuota-turso.md`](../runbook-cuota-turso.md).

## Patrones de acceso

- `db` se importa de `src/db/index.ts`; el contexto (real/demo/respaldo) lo pone
  el middleware.
- Módulos que tocan la base tienen sufijo `-db`, `-store` o viven en `db.ts`
  dentro de su carpeta; la lógica pura va aparte.
- Concurrencia y UNIQUE: `lib/db-unique.ts` detecta violaciones; los tests usan
  libSQL en **archivo temporal**, nunca `:memory:` (las transacciones abren otra
  conexión que no vería las tablas).
- `safe-query.ts` para consultas de páginas públicas que no deben tumbarlas.
- Contra Turso por HTTP cada `execute` va en su propia sesión: un `pragma`
  suelto se pierde (bug real de `seed-demo.mjs`, resuelto con
  `executeMultiple`).

## Backups

Diario a Vercel Blob (JSON de las tablas de negocio) y manual desde
`/admin/backup`. Restaurar: `scripts/restore-backup.mjs`.
