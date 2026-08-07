# Plan de Implantación — Portfolio CodeByMike (codebymike.tech)

> **Producto**: puesta en operación controlada del sistema Portfolio +
> Panel de control + Portal de clientes + Módulo LAB.
> **Versión del plan**: 1.0 — 6 de agosto de 2026.
> **Responsable**: Mike (@mikerb95).
> **Estado**: aprobado para ejecución por fases.

Implantar no es improvisar: cada paso de este documento tiene dueño, evidencia
verificable y una salida de emergencia. Ningún cambio llega a producción sin
las tres cosas.

---

## 1. Definición del sistema y del ambiente

### 1.1 Sistema a implantar

| Elemento | Descripción |
|---|---|
| Nombre | Portfolio CodeByMike |
| Dominio productivo | `codebymike.tech` |
| Tipo | Aplicación web SSR multi-módulo (público + privado + portal de clientes) |
| Stack | Astro 7 (SSR) · Turso/libSQL · Drizzle ORM · Auth.js (GitHub OAuth) · Tailwind 4 |
| Hosting | Vercel (proyecto `dev-portfolio` bajo la org `codebymike`) |
| Runtime | Node ≥ 22.12 (Fluid Compute) |
| Integraciones | Wompi (pagos), ntfy (alertas push), Resend (correo), cron-job.org (crons externos), Vercel Blob |

Módulos que entran en operación:

1. **Sitio público** — portafolio, `/notes`, `/tools`, `/status`, `/security`, `/docs`, `/paginas-web`, versión en inglés bajo `/en`.
2. **Panel de control admin** (`/admin`) — proyectos, costos y P&L, bóveda de secretos cifrada, monitores, cobros.
3. **Portal de clientes** (`/portal`) — acceso email+contraseña, facturas, actividad en tiempo real.
4. **Demo pública** (`/demo`) — panel de solo lectura contra base de datos separada.
5. **Módulo LAB** (`/admin/lab`) — CI/CD, calidad, chaos, SLO, seguridad, pagos.
6. **Micro-SIEM** — clasificador de amenazas, rate limit durable, blocklist, `security_events`.

### 1.2 Ambientes

| Ambiente | Propósito | Infraestructura | Datos |
|---|---|---|---|
| **Local / dev** | Desarrollo diario | `astro dev` + Docker Compose con dos `sqld` (principal y demo) | Semilla sintética (`npm run db:seed`) |
| **Preview** | Validación por PR | Deploy automático de Vercel por rama | Base Turso de preview, sin datos reales |
| **Producción** | Operación real | Vercel `dev-portfolio` + Turso principal + Turso demo | Datos reales, cifrados en la bóveda |

Reglas de ambiente:

- Docker es **infraestructura de desarrollo y pruebas**, nunca el runtime de producción.
- `.devcontainer/` fija Node 22.12 y el Chromium de Playwright (elimina el
  Node 20 suelto del PATH como fuente de fallos).
- Variables de entorno: se leen siempre con `serverEnv()` (`src/lib/env.ts`),
  que cubre `import.meta.env` y `process.env`.
- Antes de escribir con `vercel env`, verificar `cat .vercel/project.json`: el
  nombre del directorio local coincide por accidente con otro proyecto.

### 1.3 Prerrequisitos técnicos (checklist de habilitación)

- [ ] Node ≥ 22.12 disponible en el runner y en el equipo.
- [ ] Base Turso principal y base Turso demo creadas y accesibles.
- [ ] Migraciones Drizzle aplicadas (`npx drizzle-kit migrate`).
- [ ] Variables de entorno cargadas en Vercel (ver §8.1).
- [ ] Dominio `codebymike.tech` apuntando al proyecto `dev-portfolio`, TLS y HSTS activos.
- [ ] Crons dados de alta en cron-job.org con `CRON_SECRET`.
- [ ] Canal ntfy suscrito en el móvil del responsable.
- [ ] `npm test`, `npx astro check` y `npm run build` en verde.

---

## 2. Alcance

### 2.1 Dentro del alcance

| # | Ítem | Criterio de terminado |
|---|---|---|
| A-01 | Despliegue del sitio público en `codebymike.tech` | Home, `/notes`, `/tools`, `/status`, `/docs` responden 200 y con caché `s-maxage=300` |
| A-02 | Panel admin operativo con GitHub OAuth + allowlist | Login exitoso solo con logins de `ALLOWED_GITHUB_LOGINS`; el resto recibe 404 |
| A-03 | Bóveda de secretos cifrada (AES-256-GCM) | Ningún secreto aparece en listados ni en el HTML SSR; solo por endpoint de revelado |
| A-04 | Portal de clientes en producción | Cliente entra, ve solo sus proyectos y facturas; `tests/portal-isolation.test.ts` en verde |
| A-05 | Demo pública read-only | `/demo` sirve desde `TURSO_DEMO_URL`; métodos distintos de GET/HEAD bloqueados |
| A-06 | Cobros de campo (`/cobrar`, `/c/[code]`, `/mis-pagos`) | Link firmado funcional, pagos idempotentes vía `createPaymentIdempotent` |
| A-07 | Observabilidad: 8 monitores + `/status` | Checks cada ~5 min desde cron externo; incidentes visibles y notificados por ntfy |
| A-08 | Micro-SIEM en modo enforce | Eventos registrados en `security_events`; rate limit y blocklist activos y fail-open |
| A-09 | Pipeline CI/CD con rollback automático | `ci.yml` corre tests + build; fallo en producción dispara rollback |
| A-10 | Internacionalización ES/EN | Rutas de `TRANSLATED_ROUTES` responden bajo `/en`; rutas privadas dan 404 con cualquier prefijo |
| A-11 | Documentación de sustentación (`/docs`) | Requisitos, casos de uso, V&V, diagramas y kanban renderizados desde `src/data/` |
| A-12 | Manuales y capacitación | Manual técnico, de instalación, de usuario y plan de capacitación entregados |

### 2.2 Fuera del alcance

- Aplicación móvil nativa.
- Pasarelas de pago adicionales a Wompi.
- Contenerización de la app para producción (perdería edge, previews por PR y rollback automático).
- Servicios de terceros de monitoreo/APM de pago: la observabilidad es desarrollo propio.
- Migraciones destructivas de esquema (solo migraciones aditivas).
- Multi-tenancy con administradores múltiples.

### 2.3 Supuestos y restricciones

- El responsable único dispara deploys y commits; ninguna automatización lo hace por él.
- Presupuesto de servicios externos ≈ 0: planes gratuitos de Vercel, Turso, ntfy y cron-job.org.
- Ventana de mantenimiento preferente: días hábiles, 20:00–23:00 (COT), tráfico mínimo.
- El objetivo de disponibilidad es 99.5 % mensual (error budget ≈ 3 h 39 min/mes).

---

## 3. Objetivos

### 3.1 Objetivo general

Poner en operación productiva el sistema Portfolio CodeByMike con control de
cambios, evidencias verificables y responsabilidades asignadas, garantizando la
continuidad del servicio y la confidencialidad de los datos de clientes.

### 3.2 Objetivos específicos

| ID | Objetivo | Indicador | Meta |
|---|---|---|---|
| OE-01 | Desplegar sin interrupción perceptible | Downtime durante la ventana de corte | < 5 min |
| OE-02 | Sostener la disponibilidad comprometida | Uptime medido por los monitores propios | ≥ 99.5 % mensual |
| OE-03 | Garantizar aislamiento de datos entre clientes | Fugas detectadas en `portal-isolation` | 0 |
| OE-04 | Mantener la calidad del código en el corte | Tests Vitest + e2e en verde antes de promover | 100 % |
| OE-05 | Detectar incidentes antes que el usuario | Tiempo de detección (MTTD) vía monitores/ntfy | < 10 min |
| OE-06 | Recuperar ante un despliegue fallido | Tiempo de rollback | < 10 min |
| OE-07 | Dejar el sistema operable por terceros | Manuales entregados y sesión de capacitación | 4 documentos + 1 sesión |
| OE-08 | Dejar trazabilidad de seguridad | Eventos sensibles registrados en el micro-SIEM | 100 % de los eventos definidos |

---

## 4. Entregables

### 4.1 Producto

| ID | Entregable | Formato | Verificación |
|---|---|---|---|
| E-01 | Aplicación desplegada en producción | URL `codebymike.tech` | Smoke test §7.3 |
| E-02 | Base de datos migrada | Migraciones `drizzle/00XX_*.sql` aplicadas | `drizzle-kit migrate` sin pendientes |
| E-03 | Variables de entorno productivas | Vercel env (Production) | `vercel env ls` y arranque sin warnings |
| E-04 | Crons externos activos | cron-job.org | Ejecución exitosa con `Bearer CRON_SECRET` |
| E-05 | Monitores configurados | `/admin/monitors` | 8 monitores con checks recientes |
| E-06 | Demo pública sembrada | `/demo` | `npm run seed:demo` ejecutado, datos sintéticos |

### 4.2 Documentación

| ID | Entregable | Ubicación |
|---|---|---|
| E-07 | Manual técnico | `docs/manuales-sena/manual-tecnico.md` |
| E-08 | Manual de instalación | `docs/manuales-sena/manual-de-instalacion.md` |
| E-09 | Manual de usuario | `docs/manuales-sena/manual-de-usuario.md` |
| E-10 | Plan de capacitación | `docs/manuales-sena/plan-de-capacitacion.md` |
| E-11 | Este plan de implantación | `docs/manuales-sena/plan_de_implementacion.md` |
| E-12 | Requisitos funcionales y no funcionales vigentes | `src/data/documentacion.ts` → `/docs` |
| E-13 | Diagramas (BPMN, despliegue, componentes, actividades, comunicación, secuencia, clases, objetos) | `src/data/*.ts` → `/docs` |
| E-14 | Plan de pruebas y matriz V&V | `src/data/testing.ts`, `src/data/vyv.ts` |

### 4.3 Evidencias de la implantación

| ID | Evidencia | Cómo se captura |
|---|---|---|
| E-15 | Reporte de pruebas previo al corte | Salida de `npm test` y `npm run test:e2e` |
| E-16 | Reporte de cobertura | `npm run test:coverage` |
| E-17 | Corrida de CI/CD del despliegue | Run de GitHub Actions (`ci.yml`) |
| E-18 | Checklist de smoke test firmado | §7.3 de este documento, diligenciado |
| E-19 | Acta de aprobación / entrega | §10 |
| E-20 | Registro de incidentes de la ventana | `monitor_incidents` + `security_events` |

---

## 5. Cronograma

Duración total: **4 semanas** (semana del 10 de agosto al 6 de septiembre de 2026).
Los hitos (◆) son puntos de decisión: no se avanza sin cerrarlos.

| Fase | Actividad | Días | Semana | Salida |
|---|---|---|---|---|
| **F0 — Preparación** | Auditoría de prerrequisitos §1.3 | 1 | S1 | Checklist completo |
| | Congelación de alcance y creación de rama de release | 1 | S1 | Rama `release/implantacion` |
| | Backup completo de la base productiva | 0.5 | S1 | Dump verificado y restaurable |
| | ◆ **Hito 1: ambiente listo** | — | S1 | Aprobación de continuidad |
| **F1 — Verificación** | Suite Vitest + e2e Playwright completa | 1 | S1 | E-15 |
| | Cobertura, mutation testing y contratos | 1 | S2 | E-16 |
| | SAST (npm audit + CodeQL), DAST y accesibilidad (axe) | 1 | S2 | Hallazgos triados |
| | Corrección de hallazgos bloqueantes | 2 | S2 | Cero hallazgos críticos |
| | ◆ **Hito 2: calidad aprobada** | — | S2 | Autorización de migración |
| **F2 — Datos** | Generación y revisión del SQL de migración | 0.5 | S3 | SQL revisado a mano |
| | Ensayo de migración sobre copia | 0.5 | S3 | Migración reversible confirmada |
| | Aplicación de migraciones en producción | 0.5 | S3 | E-02 |
| | Siembra de la base demo | 0.5 | S3 | E-06 |
| **F3 — Despliegue** | Carga de variables de entorno en Vercel | 0.5 | S3 | E-03 |
| | Deploy a preview y validación funcional | 1 | S3 | Preview aprobada |
| | Promoción a producción (ventana 20:00–23:00) | 0.5 | S3 | E-01 |
| | Alta de crons y monitores | 0.5 | S3 | E-04, E-05 |
| | Smoke test y verificación de seguridad | 0.5 | S3 | E-18 |
| | ◆ **Hito 3: sistema en producción** | — | S3 | Inicio de estabilización |
| **F4 — Estabilización** | Monitoreo intensivo (hypercare) | 5 | S4 | E-20 |
| | Ajustes finos y corrección de defectos menores | 2 | S4 | Backlog en cero |
| **F5 — Transferencia** | Entrega de manuales | 1 | S4 | E-07 a E-10 |
| | Sesión de capacitación | 0.5 | S4 | Asistencia registrada |
| | Presentación y aprobación formal | 0.5 | S4 | E-19 |
| | ◆ **Hito 4: implantación aceptada** | — | S4 | Cierre |

### 5.1 Ruta crítica

`Prerrequisitos → Suite de pruebas en verde → Migración de datos → Deploy a producción → Smoke test → Aceptación`

Un retraso en cualquiera de estos nodos desplaza la fecha de cierre día por día.
Las actividades de documentación (F5) son las únicas que pueden solaparse con F4.

---

## 6. Riesgos

Escala: probabilidad (P) e impacto (I) de 1 (bajo) a 5 (alto). Exposición = P × I.

| ID | Riesgo | P | I | Exp | Mitigación | Plan de contingencia | Dueño |
|---|---|---|---|---|---|---|---|
| R-01 | Migración Drizzle genera `INSERT...SELECT` con columnas nuevas sobre la tabla vieja | 3 | 5 | 15 | Revisar a mano todo SQL generado; ensayar sobre copia | Restaurar backup y aplicar migración corregida por pasos | Dev |
| R-02 | Fuga de datos entre clientes en el portal | 2 | 5 | 10 | `clientId` siempre desde `requirePortalSession()`, nunca del request; test de aislamiento en CI | Deshabilitar `/portal` vía flag, notificar clientes afectados, auditar `security_events` | Seguridad |
| R-03 | Node 20 en el PATH rompe build o dev | 3 | 3 | 9 | `.devcontainer` con Node 22.12; `engines` en `package.json` | `source ~/.nvm/nvm.sh && nvm use 22` y reintentar | Dev |
| R-04 | Variables de entorno escritas en el proyecto Vercel equivocado (`portfolio` vs `dev-portfolio`) | 3 | 4 | 12 | Verificar `.vercel/project.json` antes de cada `vercel env` | Borrar las vars del proyecto errado y recargar en el correcto | DevOps |
| R-05 | Despliegue fallido en producción | 2 | 5 | 10 | Preview obligatoria + CI en verde antes de promover | Rollback §9 (< 10 min) | DevOps |
| R-06 | Caída de Turso o de Vercel (proveedor) | 2 | 5 | 10 | Monitores propios + alertas ntfy; caché `stale-while-revalidate` en páginas públicas | Página de estado, comunicación a clientes, esperar restablecimiento | DevOps |
| R-07 | Secreto expuesto en logs, HTML o repositorio | 2 | 5 | 10 | AES-256-GCM en la bóveda; revelado solo por endpoint bajo sesión admin; CSP enforce | Rotar el secreto, invalidar sesiones, registrar evento en el SIEM | Seguridad |
| R-08 | El micro-SIEM o el rate limiter tumba tráfico legítimo | 2 | 4 | 8 | Diseño fail-open en todo lo de seguridad/observabilidad | Desactivar la regla ofensora, revisar clasificador | Seguridad |
| R-09 | Cobro duplicado o inconsistente | 2 | 5 | 10 | Idempotencia obligatoria (`createPaymentIdempotent`, `applyGatewayEvent`) | Anular el pago duplicado, registrar evento, conciliar con Wompi | Dev |
| R-10 | Crons externos no se disparan (cron-job.org) | 3 | 3 | 9 | Monitor sobre la última ejecución; alerta si no hay checks en 30 min | Disparo manual autenticado y alta nueva del cron | DevOps |
| R-11 | Ruta privada nueva sin gate de admin | 2 | 5 | 10 | Toda ruta privada entra al matcher `isAdmin` del middleware, sin gates paralelos | Retirar la ruta, auditar accesos en `security_events` | Seguridad |
| R-12 | Ruta `/en/...` sin normalizar evade los guardas | 2 | 5 | 10 | `delocalizePath` una sola vez al inicio del middleware; test de rutas privadas bajo prefijo | Bloquear el prefijo, parchear middleware, redeploy | Dev |
| R-13 | Demo pública expone datos reales | 2 | 5 | 10 | Base Turso separada + `AsyncLocalStorage`; veto por patrón en `src/lib/demo.ts` | Apagar `/demo`, rotar el pase HMAC | Seguridad |
| R-14 | Indisponibilidad del responsable único (bus factor 1) | 3 | 4 | 12 | Manuales completos + capacitación + runbook de rollback | Escalamiento al instructor/segundo autorizado con manual técnico | Líder |
| R-15 | Alcance creciente durante la implantación | 3 | 3 | 9 | Congelación de alcance en F0; cambios al backlog post-implantación | Aplazar a la siguiente iteración documentada | Líder |

**Umbral de acción**: cualquier riesgo con exposición ≥ 10 se revisa en cada
hito y debe tener su mitigación verificada antes de avanzar.

---

## 7. Equipo, RACI y procedimiento

### 7.1 Equipo y roles

| Rol | Persona | Responsabilidad |
|---|---|---|
| **Líder de implantación** | Mike (@mikerb95) | Decisiones de corte, aprobación de hitos, comunicación |
| **Desarrollo** | Mike | Código, migraciones, corrección de defectos |
| **DevOps / Despliegue** | Mike | Vercel, variables de entorno, crons, rollback |
| **QA** | Mike | Suite Vitest/Playwright, smoke test, evidencias |
| **Seguridad** | Mike | Micro-SIEM, bóveda, revisión de hallazgos SAST/DAST |
| **Instructor / Evaluador** | SENA | Aprobación formal del entregable |
| **Cliente piloto** | Cliente del portal | Validación funcional del portal y aceptación de uso |

> El equipo es unipersonal en ejecución: por eso R-14 (bus factor) tiene
> mitigación explícita en manuales y runbook, no en redundancia de personas.
> Los roles se mantienen separados porque separan **decisiones**, no personas.

### 7.2 Matriz RACI

**R** = responsable de ejecutar · **A** = quien aprueba · **C** = consultado · **I** = informado

| Actividad | Líder | Dev | DevOps | QA | Seguridad | Instructor | Cliente |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Definir alcance y objetivos | A | C | C | C | C | C | I |
| Auditar prerrequisitos del ambiente | A | R | R | C | C | — | — |
| Backup de la base productiva | A | C | R | I | C | — | — |
| Ejecutar suite de pruebas y cobertura | I | C | — | R/A | C | — | — |
| Triaje de hallazgos SAST/DAST/a11y | A | R | — | C | R | I | — |
| Generar y revisar SQL de migración | A | R | C | C | — | — | — |
| Aplicar migración en producción | A | R | C | I | I | — | — |
| Cargar variables de entorno | A | C | R | — | C | — | — |
| Deploy a preview | I | R | R | C | — | — | — |
| Promoción a producción | A | C | R | C | C | I | I |
| Alta de crons y monitores | I | C | R | C | C | — | — |
| Smoke test post-despliegue | A | C | C | R | C | — | I |
| Decidir y ejecutar rollback | A | C | R | C | C | I | I |
| Monitoreo en hypercare | A | C | R | C | R | — | I |
| Atención de incidentes | A | R | R | C | C | I | I |
| Redacción de manuales | A | R | C | C | C | I | I |
| Sesión de capacitación | R/A | C | — | — | — | I | R |
| Presentación y aprobación final | R | C | C | C | C | A | C |

Regla no negociable del proyecto: **el líder es el único que dispara deploys y
commits**. Ninguna automatización ni tercero promueve a producción.

### 7.3 Procedimiento de corte (día del despliegue)

| # | Paso | Responsable | Evidencia |
|---|---|---|---|
| 1 | Anunciar inicio de ventana (20:00) | Líder | Mensaje a cliente piloto |
| 2 | Backup verificado de la base productiva | DevOps | Dump con restauración probada |
| 3 | `npm test` + `npm run test:e2e` + `npx astro check` en verde | QA | E-15 |
| 4 | `npm run build` sin errores | Dev | Log de build |
| 5 | Aplicar migraciones aditivas | Dev | E-02 |
| 6 | Deploy a preview y validación funcional | DevOps | URL de preview aprobada |
| 7 | Promover a producción | Líder | Deployment ID |
| 8 | **Smoke test** (§ abajo) | QA | E-18 |
| 9 | Verificar crons y monitores activos | DevOps | Checks recientes en `/admin/monitors` |
| 10 | Cerrar ventana o ejecutar rollback | Líder | Decisión registrada |

**Smoke test mínimo (todos deben pasar; uno solo que falle activa el rollback):**

- [ ] Home pública responde 200 con headers CSP/HSTS.
- [ ] `/status` muestra datos de monitores frescos (< 10 min).
- [ ] `/docs` renderiza requisitos y diagramas.
- [ ] `/en` y una ruta traducida responden 200; una ruta privada bajo `/en` responde 404.
- [ ] Login admin con GitHub OAuth exitoso; un login fuera de la allowlist recibe 404.
- [ ] Bóveda: listado sin secretos en el HTML; revelado funciona bajo sesión.
- [ ] Portal: un cliente entra y ve **solo** sus datos.
- [ ] `/demo` responde en GET y rechaza POST.
- [ ] Un cobro de prueba genera link firmado y registra pago idempotente.
- [ ] Un evento de seguridad de prueba aparece en `security_events`.
- [ ] Alerta ntfy recibida en el móvil.

---

## 8. Soporte y operación

### 8.1 Configuración operativa

Variables críticas en Vercel (Production) — sin ellas el módulo correspondiente
queda inoperante o en no-op silencioso:

| Variable | Módulo | Efecto si falta |
|---|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Núcleo | El sitio no arranca |
| `TURSO_DEMO_URL` / token demo | Demo | `/demo` sin datos |
| `AUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `ALLOWED_GITHUB_LOGINS` | Admin | Sin acceso al panel |
| `ENCRYPTION_KEY` | Bóveda | Secretos no descifrables |
| `CRON_SECRET` | Crons | Checks y rollups no corren |
| `COBRO_HISTORY_SECRET` | `/mis-pagos` | Histórico firmado inaccesible |
| `NTFY_TOPIC` | Alertas | No-op silencioso, sin notificaciones |
| `RESEND_API_KEY` | Correo | No-op silencioso |
| Credenciales Wompi | Pagos | Checkout inoperante |

### 8.2 Niveles y tiempos de atención

| Severidad | Definición | Detección | Respuesta | Resolución objetivo |
|---|---|---|---|---|
| **S1 — Crítica** | Sitio caído, fuga de datos, cobro duplicado | Monitor + ntfy | 15 min | 2 h o rollback |
| **S2 — Alta** | Módulo inoperante (portal, admin, cobros) | Monitor / reporte | 1 h | 8 h |
| **S3 — Media** | Función degradada con workaround | Reporte | 1 día hábil | 3 días hábiles |
| **S4 — Baja** | Cosmético, mejora | Backlog | 3 días hábiles | Próxima iteración |

Horario de soporte: días hábiles 08:00–20:00 (COT). Las S1 se atienden fuera de
horario porque los monitores alertan por push a cualquier hora.

### 8.3 Operación continua

- **Monitoreo**: 8 monitores propios, checks cada ~5 min desde cron externo,
  alimentando `/status` y `/admin/monitors`. Incidentes abiertos y cerrados
  automáticamente en `monitor_incidents`.
- **Alertas**: ntfy push al móvil del responsable. Sin dependencias de pago.
- **Seguridad**: micro-SIEM registrando login, fallos de auth, invitaciones,
  pagos, anulaciones y consultas de histórico en `security_events`
  (fire-and-forget, nunca bloquea el response).
- **SLO**: 99.5 % mensual, error budget ≈ 3 h 39 min, visible en `/admin/lab/slo`.
- **Respaldos**: dump de la base productiva antes de cada migración y semanal;
  verificación de restauración una vez al mes.
- **Rotación de secretos**: `ENCRYPTION_KEY` y `CRON_SECRET` se rotan ante
  cualquier sospecha de exposición, con re-cifrado de la bóveda documentado en
  el manual técnico.
- **Escalamiento**: S1 sin resolver en 2 h → decisión de rollback por el líder.

### 8.4 Capacitación

| Audiencia | Contenido | Duración | Material |
|---|---|---|---|
| Administrador (líder) | Panel completo, bóveda, monitores, LAB, rollback | 2 h | Manual técnico + de usuario |
| Cliente del portal | Acceso, facturas, actividad, pagos | 30 min | Manual de usuario |
| Evaluador / instructor | Recorrido por `/docs`, `/demo` y evidencias | 1 h | Este plan + `/docs` |

---

## 9. Plan de rollback

### 9.1 Criterios de activación

Se ejecuta rollback si, dentro de la ventana o en las primeras 24 h:

- Falla cualquier ítem del smoke test (§7.3).
- Se detecta acceso cruzado entre clientes en el portal.
- Aparece un cobro duplicado o un pago en estado inconsistente.
- Un secreto queda expuesto en respuesta HTTP o en logs.
- La tasa de error 5xx supera el 2 % durante 10 minutos consecutivos.
- El sitio queda no disponible por más de 5 minutos.

La decisión la toma el **líder**; la ejecuta **DevOps**. No se debate durante la
ventana: si se cumple un criterio, se revierte y se analiza después.

### 9.2 Procedimiento (objetivo: < 10 minutos)

| # | Paso | Cómo | Tiempo |
|---|---|---|---|
| 1 | Declarar el rollback y anotar la hora | Registro de incidente | 1 min |
| 2 | Revertir el despliegue | Promover el deployment anterior en Vercel (el pipeline `ci.yml` ya contempla rollback automático ante fallo) | 2 min |
| 3 | Verificar que la versión anterior responde | Smoke test reducido: home, `/status`, login admin, portal | 3 min |
| 4 | Evaluar el estado de datos | ¿La migración fue aditiva? → no se toca. ¿Hubo cambio destructivo? → restaurar backup | 3 min |
| 5 | Desactivar módulos afectados si aplica | Flag/chaos flag para apagar el módulo, no la app entera | 1 min |
| 6 | Notificar | ntfy al responsable, correo al cliente piloto si hubo impacto | 1 min |
| 7 | Postmortem | Causa raíz, corrección, test de regresión que lo cubra | ≤ 48 h |

### 9.3 Reversibilidad por componente

| Componente | Estrategia de reversión | Notas |
|---|---|---|
| Código de la aplicación | Promoción del deployment anterior en Vercel | Instantáneo, sin pérdida de datos |
| Esquema de base de datos | **No se revierte**: las migraciones son solo aditivas | Una columna nueva sin usar es inocua; nunca se elimina sin pedirlo explícitamente |
| Datos | Restauración del dump previo a la ventana | Solo si hubo escritura destructiva; implica pérdida de lo escrito desde el backup |
| Variables de entorno | Restaurar el valor anterior en Vercel y redeploy | Documentar valores previos antes de cambiarlos |
| Crons externos | Pausar el job en cron-job.org | Fail-open: pausarlos no rompe el sitio |
| Reglas del micro-SIEM | Desactivar la regla ofensora | Fail-open por diseño |
| Módulo individual (portal, cobros, demo) | Flag de apagado del módulo | Evita revertir todo el despliegue por un módulo |

**Punto clave del diseño**: como las migraciones son solo aditivas y toda la
capa de seguridad y observabilidad es fail-open, el rollback de código casi
siempre basta. La restauración de datos es la excepción, no el camino normal.

---

## 10. Presentación y aprobación

### 10.1 Agenda de la presentación (45 min)

| Bloque | Contenido | Min |
|---|---|---|
| 1 | Contexto, alcance y objetivos del sistema | 5 |
| 2 | Arquitectura y ambientes | 5 |
| 3 | Demostración en vivo: público, admin, portal, `/demo` | 15 |
| 4 | Evidencias de calidad: tests, cobertura, CI/CD, SAST/a11y | 8 |
| 5 | Operación: monitores, SLO, micro-SIEM, alertas | 5 |
| 6 | Riesgos, soporte y rollback | 4 |
| 7 | Preguntas y firma del acta | 3 |

### 10.2 Criterios de aceptación

La implantación se acepta si y solo si:

- [ ] Los 12 ítems del alcance (§2.1) cumplen su criterio de terminado.
- [ ] El smoke test completo (§7.3) pasa en producción.
- [ ] Los objetivos OE-01 a OE-08 alcanzan su meta o tienen desviación justificada y aceptada.
- [ ] Los entregables E-01 a E-20 están disponibles y ubicables.
- [ ] Ningún riesgo con exposición ≥ 10 queda sin mitigación verificada.
- [ ] El rollback fue probado al menos una vez en preview.
- [ ] La capacitación fue impartida y registrada.

### 10.3 Acta de aprobación

| Rol | Nombre | Decisión | Fecha | Firma |
|---|---|---|---|---|
| Líder de implantación | Mike (@mikerb95) | ☐ Aprobado ☐ Aprobado con observaciones ☐ Rechazado | | |
| Instructor / Evaluador | | ☐ Aprobado ☐ Aprobado con observaciones ☐ Rechazado | | |
| Cliente piloto | | ☐ Aceptado ☐ Aceptado con observaciones ☐ Rechazado | | |

**Observaciones:**

---

## 11. Trazabilidad

| Sección de este plan | Fuente de verdad en el repositorio |
|---|---|
| Sistema y ambiente | `CLAUDE.md`, `compose.yaml`, `.devcontainer/` |
| Alcance y requisitos | `src/data/documentacion.ts` → `/docs` |
| Entregables de diagramas | `src/data/bpmn.ts`, `despliegue.ts`, `componentes.ts`, `actividades.ts`, `comunicacion.ts` |
| Pruebas y V&V | `tests/`, `e2e/`, `src/data/testing.ts`, `src/data/vyv.ts` |
| CI/CD y rollback | `.github/workflows/ci.yml`, `/admin/lab/pipeline` |
| Seguridad | `src/lib/security/`, `src/middleware.ts` |
| Operación y SLO | `src/lib/monitors.ts`, `/admin/lab/slo`, `/status` |
| Iteraciones cerradas | `src/data/iteraciones-portfolio.ts` |

Un feature entregado que no aparece en `/docs` es, para efectos de la
sustentación, un feature que no existe. Este plan se actualiza al ejecutarlo:
las fases se marcan ✅ y las decisiones que surjan se documentan aquí mismo.
