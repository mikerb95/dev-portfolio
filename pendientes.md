# Pendientes — CodeByMike

> Estado al **24 jul 2026**. Este archivo es el inventario vivo de lo que falta:
> acciones manuales (variables de entorno, altas en servicios externos,
> verificaciones en producción) y trabajo de código todavía sin hacer. Lo ya
> resuelto se resume al final, sin detalle, para no confundir historia con
> pendientes.
>
> Los planes de cada módulo viven en `docs/plan-*.md` y se actualizan al
> implementar. El roadmap general está en `docs/plan-roadmap-2026-07.md`.

---

## 1. Variables de entorno faltantes en producción

Estado real de `dev-portfolio` (proyecto de Vercel que sirve `codebymike.tech`)
consultado el 24 jul 2026. **Todo lo que falta degrada en silencio** — ese es el
diseño, pero conviene saber qué está apagado:

| Variable | Qué pasa sin ella | Prioridad |
|---|---|---|
| `TURSO_DEMO_URL` + `TURSO_DEMO_AUTH_TOKEN` | **La demo pública no existe**: `/demo` responde 404 y el panel se comporta como si nunca se hubiera construido. Es el feature más visible del portafolio para alguien sin cuenta. | **Alta** |
| `SECURITY_IP_SALT` | Los eventos del micro-SIEM guardan el hash de la IP sin salt: sigue sin haber IPs en claro, pero el hash es reversible por diccionario (hay ~4.300 millones de IPv4). | Media |
| `RESEND_API_KEY` + `ALERT_EMAIL_TO` | Las alertas solo salen por ntfy, sin canal de email de respaldo. | Baja |
| `PSI_API_KEY` | El analizador de sitios (`/lab/site-check`) pierde los datos de PageSpeed Insights. | Baja |

Ya están puestas y verificadas: `ENCRYPTION_KEY`, `CRON_SECRET`, `NTFY_TOPIC`,
`LAB_INGEST_TOKEN`, `COBRO_HISTORY_SECRET`, las tres de Wompi, las de GitHub
OAuth y las de Turso.

- [ ] Limpieza opcional: `DEV_USER` y `DEV_PASSWORD` siguen en Vercel (Preview y
      Production) desde antes de que el login pasara a GitHub OAuth. Ya no las
      lee nadie.

## 2. Acciones manuales fuera del repo

- [ ] **`VERCEL_TOKEN` en GitHub Secrets.** Es el único bloqueo real que queda en
      el LAB: sin él, el rollback automático solo avisa en vez de revertir, y la
      Fase 5 (load testing con k6) no tiene un target de preview estable contra
      el que correr.
- [ ] **Cron `security-rollup` en cron-job.org** con `Authorization: Bearer
      CRON_SECRET`. Sin él, los agregados de seguridad no se calculan y la
      detección de anomalías se queda sin baseline.
- [ ] **3 reglas custom del WAF** en el dashboard de Vercel (detalle en
      `docs/plan-security-observability.md`, Fase 6).
- [ ] **Altas en Google Search Console y Bing Webmaster Tools.** La capa técnica
      de SEO (JSON-LD, sitemap, RSS, IndexNow, manifest) está completa desde jul
      2026; falta el alta manual que ningún código puede hacer.
- [ ] **App de ntfy en el celular** suscrita al topic. Las alertas se envían
      igual; sin suscripción no se ven.
- [ ] Confirmar en el EDIT del job de uptime en cron-job.org que el header
      `Authorization` quedó guardado (si falta, el HISTORY muestra 401 en rojo).

## 3. Verificaciones pendientes en producción

- [ ] Bóveda de credenciales: crear un servicio con secreto en
      `/admin/projects/[id]` y confirmar que cifra y revela correctamente.
- [ ] P&L: comprobar que un costo en COP suma bien al total en `/admin/costs`.
- [ ] Cobros de campo: hacer un cobro real de punta a punta (`/cobrar` → mensaje
      de WhatsApp → `/c/[code]` → pago → `/mis-pagos`).

## 4. Trabajo de código pendiente

### Portal de clientes en tiempo real — plan cerrado, sin empezar

Es el gap más grande. El portal está completo y auditado (Fases 0–7), pero
**nada se actualiza solo**: un cliente con el portal abierto no ve la respuesta a
su mensaje ni que su monitor se cayó hasta que recarga a mano. El dato *es* de
tiempo real; la interfaz no.

Diseño ya decidido en `docs/plan-portal-tiempo-real.md`: polling de un digest
barato cada 20 s (no SSE ni WebSockets — Turso no tiene pub/sub, así que el
servidor tendría que sondear igual y encima pagaría la conexión abierta), con
pausa cuando la pestaña no está visible, backoff ante error y fail-open
silencioso.

Dos puntos de higiene del mismo plan:
- [ ] El portal no tiene monitor propio en `/status` — es el único subsistema del
      stack que no se vigila a sí mismo.
- [x] Artículo en `/notes`: **"Dos logins en el mismo sitio, y ninguno conoce al
      otro"** (24 jul), sobre por qué el portal no reutiliza la auth del admin.
      Junto con "El clientId nunca viene de la URL" cubre las dos decisiones de
      diseño del portal que valía la pena contar.

### LAB — Fase 5: load testing con k6

Última fase del laboratorio. Bloqueada por `VERCEL_TOKEN` (ver arriba). Detalle
en `docs/plan-lab-fases-pendientes.md`.

### Panel de briefings — Fases 2 a 5

La Fase 1 (checklist de ítems, soft delete, timeline de actividad) se entregó el
6 jul. Faltan, en el orden de valor acordado en `docs/plan-briefings.md`:

- **Fase 3** — link público `/briefing/[token]` con aprobación firmada
  (nombre + email + timestamp), comentarios del cliente y versionado.
- **Fase 2** — kanban, filtros y prioridad en el panel.
- **Fase 4** — intake público y conversión de briefing a proyecto.
- **Fase 5** — recordatorios por cron y funnel de conversión.

> Nota: parte de lo que la Fase 3 imaginaba como "portal del cliente" ya existe
> de otra forma —`/portal`, con cuentas reales— así que conviene releer el plan
> antes de implementarlo y decidir qué se comparte con el portal y qué sigue
> siendo un link público sin sesión.

### Etapas del roadmap sin empezar

De `docs/plan-roadmap-2026-07.md`, quedan las etapas 9 a 11:
`/changelog` público generado desde los commits, `/architecture` renovada como
tour guiado del sistema, y el briefing semanal con IA.

### Mejora menor arrastrada

- [ ] `src/pages/admin/projects/[id].astro`: quedan grises `zinc-*` internos sin
      migrar a la paleta `ink-*` (visualmente cercanos; los badges de estado y
      los tabs ya se migraron).

---

## 5. Cómo retomar (entorno)

- **Node ≥22.12.** El shell por defecto puede traer v20, que rompe Astro:
  ```sh
  source ~/.nvm/nvm.sh && nvm use 22
  ```
- Build / dev: `npm run build` · `npm run dev` (localhost:4321).
- Migraciones (solo aditivas):
  ```sh
  export $(grep -E '^TURSO_' .env | xargs) && npx drizzle-kit generate   # y luego migrate
  ```
- Antes de depurar algo raro en dev (sobre todo el aislamiento de la demo),
  revisar `ps aux` por sesiones de agente concurrentes sobre este mismo checkout
  y reiniciar `astro dev` desde cero: el HMR no es fiable para verificar
  aislamiento.

## 6. Lo ya resuelto (resumen, sin detalle)

Panel de control completo (costos y P&L multi-moneda, bóveda AES-256-GCM,
seguimiento comercial, backups) · monitoreo propio con 8 monitores y alertas
push · micro-SIEM completo (clasificador, rate limit durable, blocklist con
escalado, anomalías por z-score, vitrina pública) · LAB Fases 0–4, 6 y 7
(CI/CD con rollback, pagos idempotentes, chaos, SLOs, SAST, DAST, a11y,
mutation testing y contratos) · demo read-only del panel · portal de clientes
Fases 0–7 · cobros de campo por WhatsApp · suite e2e con Playwright en CI ·
documentación pública en `/docs` (requisitos, UML, kanban, testing, V&V,
pipeline en vivo) · landing comercial `/paginas-web`.

El historial narrado de cada iteración vive en
`src/data/iteraciones-portfolio.ts` y se ve en `/docs/kanban`.
