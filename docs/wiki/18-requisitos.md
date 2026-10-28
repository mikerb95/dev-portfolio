# 18 · Requisitos (índice completo)

> **Foto del 28 oct 2026.** La fuente de verdad es
> [`src/data/documentacion.ts`](../../src/data/documentacion.ts), que también
> alimenta `/docs/requerimientos-funcionales` y `/docs/requerimientos-no-funcionales`.
> Allí cada requisito trae además `descripcion`, `verificacion` (cómo se
> comprueba), `notas` y `relacionados`. Si esta tabla y el archivo discrepan,
> manda el archivo.
>
> Totales en la foto: **175 implementados, 3 parciales, 4 planeados** (182 en total).

**Cómo leer los IDs.** Los RF se numeran por módulo: `RF-0xx` sitio público,
`RF-1xx` autenticación, `RF-2xx` CRM y comercial, `RF-3xx` finanzas, `RF-4xx`
observabilidad, `RF-5xx` LAB, `RF-6xx` seguridad, `RF-7xx` sistema y
documentación, `RF-8xx` portal de clientes. Los RNF van numerados en orden de
alta (`RNF-01`…`RNF-34`) y agrupados por característica ISO 25010.

**Regla al añadir un feature** (CLAUDE.md §"Al añadir una feature grande"): el
requisito entra en `documentacion.ts` como `planeado` y se promueve a
`implementado` al entregarlo, con `origen` y `verificacion`. Un feature que no
está ahí, para efectos de la sustentación, no existe.

Para regenerar esta tabla, ver el script descrito en
[16 · Desarrollo y operación](16-desarrollo-y-operacion.md#regenerar-el-índice-de-requisitos).

## Requisitos funcionales (RF)

### Sitio público

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-001 | Listado de proyectos | implementado | alta | src/pages/index.astro, src/components/home/ProyectosIndice.astro |
| RF-002 | Detalle de proyecto | implementado | alta | src/pages/projects/[slug].astro |
| RF-003 | Formulario de contacto | implementado | alta | src/pages/api/contact.ts |
| RF-004 | Página de estado del sistema | implementado | alta | src/pages/status, src/pages/api/status |
| RF-005 | Vitrina de herramientas y notas | implementado | media | src/pages/tools, src/pages/notes |
| RF-006 | Certificaciones y evolución académica | implementado | media | src/pages/certifications, EvolutionTimeline.astro |
| RF-007 | SEO técnico | implementado | media | src/pages/rss.xml, scripts/indexnow |
| RF-008 | Demo read-only del panel admin | implementado | baja | src/pages/demo.astro, src/lib/demo.ts, AsyncLocalStorage en src/db/index.ts |
| RF-009 | Descarga de CV con verificación de dispositivo | implementado | media | src/pages/api/cv, cv_downloads |
| RF-010 | Rutas de aprendizaje con progreso persistente | implementado | baja | src/lib/education-paths.ts, education_lab_progress |
| RF-011 | Landing comercial de diseño web | implementado | media | src/pages/paginas-web.astro |
| RF-012 | Agenda directa de reunión | implementado | baja | src/pages/contact.astro |
| RF-013 | Versión en inglés del sitio público | implementado | media | src/i18n/ (config, routing, format, localize, bilingual, es, en), src/pages/en/, src/content/notes/{es,en}/, src/lib/notes.ts, src/middleware.ts |
| RF-014 | Sugerencia de idioma no intrusiva | implementado | baja | src/components/LanguageSuggestModal.astro |
| RF-015 | Landing comercial de capacitación en IA | implementado | media | src/pages/capacitacion-ia.astro, training_programs (isPublic), src/lib/capacitacion/repo.ts |
| RF-016 | Banco público de recursos de capacitación | implementado | media | src/pages/capacitacion/, src/lib/capacitacion/{repo,markdown,tipos}.ts, training_resources |
| RF-017 | Acceso por código de grupo al material restringido | implementado | media | src/lib/capacitacion/{access,pase}.ts, src/pages/api/capacitacion/acceso.ts, training_access_codes, TRAINING_ACCESS_SECRET |
| RF-018 | Evaluación pre/post de una capacitación | planeado | media | docs/plan-capacitacion.md (Fase 2) |
| RF-019 | Catálogo público de automatizaciones | implementado | media | src/pages/automatizaciones.astro, src/data/automatizaciones.ts, cron_runs |
| RF-020 | Analizador público de sitios (/lab/site-check) | implementado | media | src/lib/diagnostics.ts (la batería, sin dependencias externas: fetch + node:tls + node:dns), src/pages/api/lab/site-check.ts (endpoint público), src/pages/lab/s |
| RF-021 | Laboratorio de fingerprinting con salas efímeras | implementado | media | src/lib/fingerprint.ts (salas y registro), src/pages/api/lab/fp/, src/pages/lab/fingerprint/ y su cascarón en src/pages/en/, tablas fp_rooms y fp_devices |
| RF-022 | Portada interactiva con motion propio | implementado | media | src/pages/index.astro, src/components/home/ (ProyectosIndice, ProcesoPipeline, ExpertiseVivo, LabHuella), src/lib/motion/ (camara, isolineas, portadas, portadas |
| RF-023 | /engineering con motion: la página se mide delante del visitante | implementado | media | src/pages/engineering.astro, src/components/engineering/InstrumentoVisita.astro, src/lib/motion/ (medicion, instrumento, engineering, landing, efectos), src/com |
| RF-024 | /security con motion: la defensa se ve ocurrir | implementado | media | src/pages/security.astro, src/components/security/ (FiltroCapas, HallazgosCommits, ControlesVivos), src/lib/motion/ (filtro, filtro-lienzo, security, landing, e |
| RF-025 | /tools con motion: las herramientas trabajan delante del visitante | implementado | media | src/pages/tools.astro, src/components/tools/ (CircuitoOperacion, EscenaCaso), src/lib/motion/ (circuito, circuito-vivo, tools-escenas, tools-datos, landing), sr |
| RF-026 | /lab con motion: cada experimento se ve ocurrir | implementado | media | src/pages/lab/index.astro, src/components/lab/ (BancoEnsayo, PistaPipeline, CicloHallazgos, EscaleraCarga), src/lib/motion/ (ensayo, ensayo-vivo, pista, lab-dat |
| RF-027 | /notes con motion: las decisiones se ven tomar | implementado | media | src/pages/notes/index.astro, src/pages/notes/[slug].astro, src/components/notes/ (FichaDecision, BitacoraNotas, DecisionCorta), src/lib/notes-meta.ts, src/lib/n |
| RF-028 | /log con motion: las horas de trabajo se ven sumar | implementado | media | src/pages/log.astro, src/components/log/ (RelojSesiones, BitacoraCommits), src/lib/actividad.ts (reglas compartidas con el endpoint), src/lib/motion/ (reloj, re |
| RF-029 | /automatizaciones con motion: el silencio se ve | implementado | media | src/pages/automatizaciones.astro, src/components/automatizaciones/ (Partitura, DisparadoresCI, EscenaAutomatismo), src/lib/motion/ (partitura, partitura-viva, d |
| RF-030 | /lab/fingerprint con motion: la huella se ve leer y reconocer | implementado | media | src/pages/lab/fingerprint/index.astro, src/pages/lab/fingerprint/[room]/board.astro, src/components/HuellaVisor.astro (marco compartido con la portada), src/com |
| RF-031 | Fantasmas de Halloween en la portada | implementado | baja | src/components/Fantasmas.astro, src/lib/temporada.ts, src/layouts/BaseLayout.astro (solo en la portada, en los dos idiomas) |
| RF-032 | /ep con motion: la etapa productiva como una cinta de 180 días | implementado | media | src/pages/ep.astro, src/components/ep/ (CintaEtapa, BandejaInstructor, CarpetaCierre), src/lib/motion/ (cinta-ep, ep, ep-datos) |
| RF-033 | /contact con motion sobre el diseño existente | implementado | baja | src/pages/contact.astro (solo atributos data-*), src/lib/motion/contacto.ts |
| RF-034 | Changelog público (/changelog) | implementado | baja | src/lib/changelog.ts (puro), src/lib/changelog-github.ts, src/pages/changelog.astro, src/pages/en/changelog.astro, src/components/changelog/Fila.astro |
| RF-035 | /architecture renovada: el índice narrativo del sitio | implementado | baja | src/pages/architecture.astro, src/pages/en/architecture.astro, bloque architecture de src/i18n/es.ts y en.ts |
| RF-036 | /architecture con motion: trazador de peticiones | implementado | baja | src/components/architecture/TrazadorPeticiones.astro, src/lib/motion/trazado.ts (guion, solo servidor), src/lib/motion/trazado-html.ts (marcado compartido), src |
| RF-037 | Hero que vende, con cotizador de IA | implementado | alta | src/pages/index.astro (hero y script del cotizador), src/styles/portada.css, src/lib/asesor/prompt.ts (página "inicio"), src/lib/asesor/traspaso.ts (puro, isomo |
| RF-038 | Titular rotativo por servicios | implementado | alta | src/pages/index.astro (marcado y script del hero), src/lib/hero-servicios.ts (cuadros con cifras del tarifario, puro), src/lib/motion/rotacion.ts (reloj con pau |
| RF-039 | Visibilidad en asistentes de IA (AEO) | implementado | media | src/lib/aeo/ (agentes.ts lista única de agentes y asistentes, robots.ts, llms.ts, jsonld.ts, conteo.ts, resumen.ts), src/pages/robots.txt.ts, src/pages/llms.txt |
| RF-040 | Vigía de la agenda del instructor de etapa productiva | implementado | alta | src/lib/ep-agenda.ts (puro: lectura de Bookings, citas libres, cadencia, comparación entre consultas, resumen semanal), src/lib/ep-agenda-db.ts, src/pages/api/c |

### Autenticación y sesiones

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-101 | Login con GitHub OAuth | implementado | alta | auth.config.ts, src/lib/auth.ts |
| RF-102 | Protección de rutas /admin | implementado | alta | src/middleware.ts, src/lib/security/paths.ts (withoutTrailingSlash) |
| RF-103 | Gestión de dispositivos/sesiones | implementado | media | src/pages/admin/sessions.astro, admin_sessions, src/lib/device-sessions.ts (recordSession), src/middleware.ts |
| RF-104 | Cierre de sesión | implementado | media | src/pages/api/auth |

### CRM (proyectos, clientes, seguimiento)

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-201 | Gestión de proyectos | implementado | alta | src/pages/admin/projects, projects |
| RF-202 | Gestión de clientes | implementado | alta | src/pages/admin/clients.astro, clients |
| RF-203 | Bandeja de mensajes | implementado | alta | src/pages/admin/messages.astro, messages |
| RF-204 | Seguimiento comercial (interacciones) | implementado | alta | src/pages/admin/seguimiento.astro, interactions |
| RF-205 | Briefings de cliente | implementado | media | src/pages/admin/briefings, briefings, briefing_items |
| RF-206 | Contactos por proyecto | implementado | baja | project_contacts |
| RF-207 | Decisiones de arquitectura (ADRs) | implementado | media | project_adrs |
| RF-208 | Presentaciones proyectadas con público en sincronía | implementado | media | src/lib/present/*, src/pages/admin/presentaciones, src/pages/present/[sessionId], src/pages/remote/[sessionId], src/pages/[pin], decks/deck_slides |
| RF-209 | Gestión del módulo de capacitación | implementado | media | src/pages/admin/capacitacion/, src/pages/api/admin/capacitacion/, training_programs, training_resources, training_access_codes |
| RF-210 | Asistente del panel | implementado | media | docs/plan-asistente.md |
| RF-211 | Cotizador para toda la oferta | implementado | media | docs/plan-asistente.md (Capacidad 1) |
| RF-212 | Asesor público con IA en la burbuja de WhatsApp | implementado | media | src/components/WhatsappFab.astro, src/lib/asesor/ (conocimiento, herramientas, bucle, prompt, costo, presupuesto, motor), src/pages/api/asesor.ts, isAsesorPath  |
| RF-213 | Asesor en vivo: Mike entra a la conversación | implementado | media | src/lib/asesor/vivo.ts (puro) y vivo-db.ts, src/pages/api/asesor.ts, src/pages/api/asesor/conversacion.ts, src/pages/admin/asesor/ y src/pages/api/admin/asesor/ |
| RF-214 | Plano: constructor de propuestas a la medida | implementado | alta | src/pages/admin/plano/, src/components/plano/constructor.ts, src/lib/plano/ (propuesta, incertidumbre, encaje, diff, pdf, db), src/data/plano.ts, src/data/claus |
| RF-215 | Reglas de pago por monto, cuotas con recargo y fechas hábiles | implementado | alta | src/lib/plano/pagos.ts, src/lib/plano/fechas.ts, src/data/plano.ts, src/pages/admin/plano/ajustes.astro, app_settings (plano_reglas) |
| RF-216 | Del chat al plano y el cliente difícil (IA) | implementado | media | src/lib/plano/ia/ (motor, chat, revision), src/pages/api/admin/plano/[id]/ia.ts |
| RF-217 | Propuesta viva para el cliente | implementado | alta | src/pages/propuesta/[token].astro, src/components/plano/vista-render.ts, src/lib/plano/publico.ts, src/lib/plano/aceptacion.ts, src/pages/api/propuesta/[token]/ |
| RF-218 | De sí a proyecto y calibración de la tabla | implementado | media | src/lib/plano/conversion.ts, src/lib/plano/aprende.ts, src/pages/api/payments/webhook.ts, src/pages/api/admin/plano/[id]/horas.ts, propuesta_horas |
| RF-219 | Dashboard con caja para preguntar y buscar | implementado | media | src/components/admin/AsistenteCaja.astro, asistente-cliente.ts y buscador-cliente.ts |
| RF-220 | Acceso a Cotiza con PIN aislado | implementado | alta | docs/plan-cotiza.md (Fase 0, 6 oct 2026): src/lib/cotiza/acceso.ts (alcance, cookie, frenos), src/lib/cotiza/pin-db.ts (hash en app_settings, contadores en rate |
| RF-221 | Motor de alcance, cupos y adicionales | implementado | alta | docs/plan-cotiza.md |
| RF-222 | Bitácora del encargo | implementado | media | docs/plan-cotiza.md (Fase 2, 6 oct 2026): src/lib/cotiza/{encargo,db}.ts, /api/admin/cotiza/encargos, /admin/cotiza y /admin/cotiza/<id> |
| RF-223 | IA de alcance para consultoría | implementado | media | docs/plan-cotiza.md (Fase 3, 6 oct 2026): src/lib/cotiza/ia.ts (prompts, esquemas, validación) y /api/admin/cotiza/encargos/<id>/ia, sobre pedirJson de src/lib/ |
| RF-224 | Enlace del cliente con aprobación de adicionales | implementado | media | docs/plan-cotiza.md (Fase 4, 6 oct 2026): src/lib/cotiza/enlace.ts, /acuerdo/<token>, /api/acuerdo/<token>, acción enlace en /api/admin/cotiza/encargos/<id> |
| RF-225 | Correos promocionales con consentimiento | implementado | media | src/lib/marketing (reglas.ts, contenido.ts, tokens.ts, envio.ts, db.ts), src/pages/admin/marketing, src/pages/novedades, src/pages/api/marketing, src/pages/api/ |

### Finanzas

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-301 | Registro de ingresos | implementado | alta | src/pages/admin/finances.astro, finances |
| RF-302 | Costos y P&L por proyecto | implementado | alta | src/pages/admin/costs.astro, project_services, src/lib/pnl.ts |
| RF-303 | Bóveda cifrada de credenciales | implementado | alta | src/lib/crypto.ts, project_services.secrets |
| RF-304 | Variables de entorno por proyecto | implementado | media | project_env_vars |
| RF-305 | Alertas de vencimiento de dominios | implementado | media | src/pages/admin/domains.astro, src/lib/domains.ts |
| RF-306 | Cobros de campo por WhatsApp | implementado | alta | src/pages/cobrar.astro, src/pages/c/[code].astro, src/lib/cobros*.ts |
| RF-307 | Histórico de pagos del cliente | implementado | media | src/pages/mis-pagos.astro, src/lib/mis-pagos.ts |
| RF-308 | Emisión de cuentas de cobro | implementado | alta | src/pages/admin/cuentas-cobro/, src/pages/api/admin/cuentas-cobro/, src/lib/cuentas-cobro.ts, src/lib/cuentas-cobro-db.ts, src/lib/cuenta-cobro-pdf.ts, migració |
| RF-311 | Alta de deudor sin salir del flujo de creación | implementado | media | src/pages/admin/cuentas-cobro/index.astro, /api/admin/clients |
| RF-309 | Cálculo parametrizable de retenciones | implementado | alta | src/lib/cuentas-cobro.ts (computeRetentions, parseCuentaCobroConfig), /admin/settings, app_settings |
| RF-310 | Semáforo del tope de responsabilidad de IVA | implementado | media | src/lib/cuentas-cobro.ts (topeIva), src/lib/cuentas-cobro-db.ts (topeIvaDelAnio), /admin/cuentas-cobro |
| RF-312 | Simulador de costos de la infraestructura básica | implementado | media | src/lib/infra-stack.ts (catálogo de planes y cálculo, módulo puro e isomorfo), src/pages/admin/infra.astro |
| RF-313 | Resumen mensual de costos: infraestructura, suscripciones y vida | implementado | media | src/lib/resumen-mensual.ts (cálculo, módulo puro), src/lib/vida.ts (catálogo y validación), living_costs y living_expenses (migración 0034), categoría subscript |
| RF-314 | Medidor de cómputo para proyectos de cliente | implementado | media | instrumentacion/medidor.ts, instrumentacion/medidor.mjs y medidor.cjs (versiones JavaScript generadas por scripts/build-medidor.mjs), src/pages/api/computo/inge |
| RF-315 | Cuota gratis de Vercel compartida y avisos antes del tope | implementado | media | src/lib/computo/cuota.ts (módulo puro), src/lib/computo/avisos.ts, src/lib/computo/store.ts (consumoDelMes), src/pages/api/cron/computo-rollup.ts, src/pages/api |
| RF-316 | Cotizador de hosting fijo para clientes nuevos | implementado | media | src/lib/computo/cotizador.ts (módulo puro e isomorfo), src/pages/admin/computo.astro |

### Portal de clientes

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-801 | Acceso autenticado del cliente | implementado | alta | src/lib/portal/*, portal_sessions, src/pages/portal |
| RF-802 | Aislamiento entre clientes (multi-tenant) | implementado | alta | src/lib/portal/projects.ts, requirePortalSession() |
| RF-803 | Facturas y descarga en PDF | implementado | alta | src/pages/portal/facturas, src/pages/api/portal/facturas |
| RF-804 | Mensajería con el cliente | implementado | media | src/pages/portal/mensajes, src/pages/admin/portal, src/pages/api/portal/mensajes (avisos vía sendPush y sendEmail de src/lib/notify.ts) |
| RF-805 | Documentos y avance del proyecto | implementado | media | src/pages/portal/documentos, src/pages/portal/index.astro |
| RF-806 | Impersonación de soporte read-only | implementado | media | src/middleware.ts, src/pages/admin/portal |
| RF-807 | Actualización en vivo del portal | implementado | media | src/lib/portal/live.ts · src/pages/api/portal/live.ts · script de PortalLayout.astro |
| RF-808 | Feed de actividad del proyecto | implementado | media | src/lib/portal/activity.ts · src/components/portal/ActivityFeed.astro · src/pages/portal/actividad.astro · src/pages/admin/portal/actividad.astro |
| RF-810 | Portal de demostración | implementado | baja | src/pages/api/portal/demo.ts, src/pages/api/cron/portal-demo-reseed.ts |
| RF-811 | Entrada única para clientes y administrador | implementado | media | src/pages/login.astro, src/components/portal/LoginForm.astro (compartido con /portal/login), src/components/Navbar.astro |
| RF-809 | Vigilancia del propio portal | implementado | media | src/lib/portal/health.ts, src/pages/api/portal/health.ts, scripts/register-portal-monitor.mjs |

### Observabilidad

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-401 | Monitoreo de disponibilidad | implementado | alta | monitors, src/pages/api/cron |
| RF-402 | Historial de incidentes | implementado | alta | monitor_incidents |
| RF-403 | SLO / error budget | implementado | media | src/pages/admin/lab/slo.astro, src/lib/slo.ts |
| RF-404 | Notificaciones push | implementado | media | src/lib/notify.ts |
| RF-405 | Web Vitals (RUM) | implementado | baja | web_vitals, src/lib/vitals.ts |
| RF-406 | Certificados TLS | implementado | baja | monitors.sslExpiresAt |
| RF-407 | Bitácora de ejecuciones de crons | implementado | media | src/lib/cron-runs.ts (conRegistro, registrarCronRun), cron_runs, src/pages/api/cron/* |
| RF-408 | Aviso cuando una tarea programada deja de correr | implementado | alta | src/lib/cron-silencio.ts (módulo puro: tolerancia, deduplicación de avisos y throttling), src/lib/cron-runs.ts (ultimasCorridas, silenciosPorAvisar), enganchado |
| RF-409 | Resumen semanal de operación con IA | implementado | media | src/lib/resumen-semanal.ts (puro), src/lib/resumen-semanal-db.ts, src/lib/resumen-semanal-ia.ts, src/lib/resumen-semanal-servicio.ts, src/pages/api/cron/resumen |

### LAB (SENA)

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-501 | Pipeline CI/CD con rollback | implementado | alta | ci_runs, src/pages/admin/lab/pipeline.astro |
| RF-502 | Pasarela de pagos con idempotencia | implementado | alta | payments, payment_events, src/lib/payments.ts |
| RF-503 | Chaos engineering | implementado | media | chaos_flags, src/lib/chaos.ts |
| RF-504 | Historial de experimentos | implementado | baja | lab_experiments |
| RF-505 | Pruebas de carga y estrés (k6) | implementado | media | lab/k6/carga.js (ítem 5 del checklist), lab/k6/estres.js (ítem 6), lab/k6/lib/perfil.js, src/pages/api/lab/proceso.ts, src/lib/lab/load-test.ts (parser puro), l |
| RF-506 | SAST y accesibilidad automatizadas | implementado | media | security_findings, src/lib/lab/findings.ts, .github/workflows/security.yml y a11y.yml |
| RF-507 | Mutation testing y pruebas de contrato | implementado | baja | stryker.config.json, src/lib/lab/mutation.ts, src/lib/contracts.ts |
| RF-508 | DAST con OWASP ZAP | implementado | media | .github/workflows/dast.yml, parseZapReport en src/lib/lab/findings.ts |
| RF-509 | Checkout público orientado al cliente | implementado | media | src/pages/pay.astro, src/pages/pay/gracias.astro, src/lib/pay-form.ts, src/lib/pay-result.ts, src/pages/api/payments/resultado.ts, payments.payer_name y payer_m |
| RF-510 | Vigía nocturno del repositorio con Claude Managed Agents | implementado | media | agents/vigia/ (agente, entorno, memoria y deployment versionados con ant apply |

### Seguridad (micro-SIEM)

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-601 | Sensor de requests hostiles | implementado | alta | src/lib/security/sensor.ts, classify.ts |
| RF-602 | Blocklist de IPs | implementado | alta | blocked_ips, src/lib/security/blocklist.ts |
| RF-603 | Rate limiting durable | implementado | alta | rate_limit_buckets, src/lib/security/ratelimit-durable.ts |
| RF-604 | Agregación y rollups | implementado | media | security_rollups |
| RF-605 | Detección de anomalías | implementado | media | security_anomalies, src/lib/security/anomaly.ts |
| RF-606 | Panel de seguridad consolidado | implementado | media | src/pages/admin/security.astro, src/pages/api/admin/security.ts |
| RF-607 | Bloqueo escalado con enforcement inline de honeypots | implementado | alta | src/lib/security/blocklist.ts (blockIpEscalated), src/middleware.ts |
| RF-608 | Bloqueo masivo con protección del operador | implementado | alta | src/lib/security/autoblock.ts (selectBulkBlockIps, blockAllAttackerIps), src/pages/api/admin/security.ts |
| RF-609 | Sensor portable para proyectos vigilados | planeado | media | docs/plan-siem-multiproyecto.md (Fase 2) |
| RF-610 | Ingesta de eventos de seguridad de terceros | planeado | media | docs/plan-siem-multiproyecto.md (Fases 3 y 4) |
| RF-611 | Blocklist compartida entre proyectos vigilados | planeado | media | docs/plan-siem-multiproyecto.md (secciones 6 y 7, Fase 7) |
| RF-612 | Rastro de auditoría del panel, separado de las amenazas | implementado | alta | src/lib/security/audit.ts (AUDIT_CATEGORIES), src/lib/security/events.ts (recordAdminEvent), src/pages/admin/security.astro, src/pages/security.astro, src/lib/p |
| RF-613 | Analista de IA del micro-SIEM con aprobación humana | implementado | media | src/lib/analista/ (bucle.ts: bucle propio con pausa ante bloquear_origen |

### Sistema

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RF-701 | Backups automáticos | implementado | alta | src/lib/backup.ts, src/pages/api/cron/backup.ts (automático), src/pages/api/admin/backup.ts y src/pages/admin/backup.astro (manual y listado) |
| RF-702 | Ajustes de la aplicación | implementado | baja | app_settings, src/pages/admin/settings.astro |
| RF-703 | Documentación de ingeniería | implementado | media | src/pages/docs, src/data/documentacion.ts, testing.ts, vyv.ts, iteraciones-portfolio.ts |
| RF-705 | Estado del pipeline en vivo | implementado | baja | src/pages/docs/pipeline-en-vivo.astro, src/lib/lab/pipeline-live.ts, src/pages/api/lab/pipeline-live.ts |
| RF-706 | Diagramas BPMN de los procesos de negocio | implementado | media | src/pages/docs/diagrama-bpmn.astro, src/pages/docs/bpmn-imprimible.astro, src/data/bpmn.ts, src/lib/bpmn-layout.ts, src/components/Bpmn{Diagram,Shape}.astro, sc |
| RF-707 | Diagramas UML de despliegue, comunicación y actividades | implementado | media | src/pages/docs/diagrama-{despliegue,comunicacion,actividades,componentes}.astro, src/data/{despliegue,comunicacion,actividades,componentes}.ts, src/lib/uml-{dep |
| RF-708 | Tracker de especialización técnica | implementado | baja | src/pages/admin/aprendizaje.astro, src/lib/skills.ts, src/data/track-dotnet.ts, skill_tracks/skill_sessions/skill_milestones, src/pages/api/admin/skills/* |
| RF-704 | Historial de descargas del CV | implementado | baja | src/pages/admin/lab/cv-downloads.astro, cv_downloads |
| RF-709 | Informe de ejecución de pruebas | implementado | media | scripts/report-tests.mjs, src/data/ejecucion-pruebas.{json,ts}, src/pages/docs/ejecucion-pruebas.astro |
| RF-710 | Referencia de reportes de pruebas | implementado | baja | src/data/reportes-pruebas.ts, src/pages/docs/reportes-pruebas.astro |
| RF-711 | Diagrama de red por zonas de confianza | implementado | media | src/pages/docs/diagrama-red.astro, src/data/red.ts, src/lib/red-layout.ts, src/components/uml/NetworkDiagram.astro |
| RF-712 | Control remoto de la sustentación desde el celular | implementado | media | src/pages/sustentacion/control.astro, src/lib/sustentacion/mando.ts, src/lib/sustentacion/control.ts, src/lib/sustentacion/obedecer.ts, src/pages/api/sustentaci |
| RF-713 | Escenario proyectado de la sustentación | implementado | media | src/pages/sustentacion.astro, src/lib/sustentacion/escena.ts, src/data/sustentacion-escena.ts, src/data/sustentacion-datos.json, src/pages/admin/sustentacion.as |
| RF-714 | Mando del mazo proyectado desde el celular | implementado | media | src/pages/presentacion.astro, src/pages/remote/index.astro, src/pages/api/presentacion.ts, src/lib/presentacion/mapa.ts, src/lib/presentacion/estado.ts |
| RF-715 | Desplazamiento del iframe de un beat desde el mando | implementado | baja | src/lib/presentacion/desplazamiento.ts, src/pages/api/presentacion.ts, src/pages/presentacion.astro, src/pages/remote/index.astro |
| RF-716 | Planteamiento, justificación y objetivos del proyecto | implementado | media | src/data/planteamiento.ts, src/pages/docs/planteamiento.astro, docs/planteamiento-del-problema.md |
| RF-717 | Conducción de la presentación con lienzo tocable (/present-admin) | parcial | alta | src/pages/present-admin.astro, src/pages/presentacion.astro (el seguidor, que aplica espejo y puntero), src/lib/presentacion/lienzo.ts, src/lib/presentacion/esp |
| RF-719 | Panel retráctil del ponente en /present-admin | implementado | media | src/lib/presentacion/panel.ts (modos, índice del mazo, ritmo, salud del enlace y atajos), src/pages/present-admin.astro (la vista y el cableado), src/lib/presen |
| RF-720 | Salida automática a la página de cierre al terminar el mazo | implementado | baja | src/lib/presentacion/cierre.ts (las reglas), src/pages/present-admin.astro (el temporizador y el aviso), src/lib/presentacion/panel.ts (el estado cerrando de la |
| RF-718 | Página de cierre para compartir tras la sustentación | parcial | baja | src/pages/presentacion-end.astro, src/pages/en/presentacion-end.astro, src/i18n/es.ts, src/i18n/en.ts (presentacionEnd), src/i18n/routing.ts (TRANSLATED_ROUTES) |

## Requisitos no funcionales (RNF)

### Seguridad

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RNF-01 | Cifrado de secretos en reposo | implementado | alta | src/lib/crypto.ts |
| RNF-02 | Autorización por allowlist | implementado | alta | src/lib/auth.ts (ALLOWED_GITHUB_IDS, ALLOWED_GITHUB_LOGINS), auth.config.ts |
| RNF-03 | Fail-open en enforcement de seguridad | implementado | alta | src/middleware.ts |
| RNF-04 | Sin bloqueos eternos | implementado | media | blocked_ips.expiresAt, chaos_flags.expiresAt |
| RNF-05 | Minimización de PII en la vitrina pública | implementado | media | security_events.ipHash |
| RNF-20 | Los guardas de ruta son ciegos al idioma | implementado | alta | src/i18n/routing.ts (delocalizePath, isLocalizedPrivateRequest), src/middleware.ts |
| RNF-31 | Las llaves de seguridad no se pueden repetir ni plantar | implementado | alta | src/lib/webauthn.ts (storeChallenge, consumeChallenge, notifyPasskeyChange), webauthn_challenges, src/lib/auth.ts (isRecentAuth), auth.config.ts (authTime), src |
| RNF-32 | Lo privado cuenta, pero no se publica | implementado | alta | src/pages/api/github/activity.ts (esPublico) |
| RNF-33 | Lo que sale de la base no puede convertirse en código | implementado | media | src/lib/json-script.ts (jsonEnScript, en 25 páginas y layouts), src/lib/safe-url.ts (urlSegura), src/pages/api/lab/ingest.ts, src/middleware.ts (Cache-Control p |
| RNF-34 | El servidor no sondea su propia red interna (SSRF) | implementado | alta | src/lib/ssrf-guard.ts (assertPublicHost) |

### Confiabilidad y disponibilidad

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RNF-06 | Idempotencia de pagos | implementado | alta | payments.idempotencyKey |
| RNF-07 | Máquina de estados sin retrocesos | implementado | alta | src/lib/payments.ts |
| RNF-08 | Rollback automático de deploy | implementado | alta | ci_runs.healthOk |
| RNF-09 | Objetivo de disponibilidad (SLO) | implementado | media | src/lib/slo.ts |
| RNF-10 | Rate limiting resistente a redeploys | implementado | media | rate_limit_buckets |
| RNF-26 | Las páginas públicas sobreviven a una base caída | implementado | alta | src/lib/safe-query.ts, usado en src/pages/index.astro, status.astro, security.astro, certifications.astro y engineering.astro |
| RNF-27 | Datos reales desde fuentes alternas con la base caída | implementado | alta | src/lib/fallback/ (rastreador.ts, instantanea.ts, sondeo-vivo.ts), src/data/instantanea.json, src/data/respaldo-monitores.ts, scripts/capturar-instantanea.mjs |
| RNF-28 | Los crons declarados son verificables sin desplegar | implementado | alta | vercel.json (crons), src/lib/cron-auth.ts, tests/crons.test.ts |
| RNF-29 | Las fechas se anclan a la zona de Colombia, y las dos clases se tratan distinto | implementado | alta | src/lib/fecha-co.ts, src/lib/cuentas-cobro.ts, src/lib/portal/format.ts, src/pages/api/admin/portal/hitos.ts, src/pages/api/admin/portal/facturas.ts |

### Eficiencia de desempeño

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RNF-11 | Latencia del sensor de seguridad | implementado | alta | src/lib/security/sensor.ts |
| RNF-12 | Core Web Vitals dentro de "good" | parcial | media | web_vitals |
| RNF-13 | Cache de lecturas frecuentes | implementado | media | src/lib/security/blocklist.ts |

### Mantenibilidad

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RNF-14 | Datos de documentación como código | implementado | media | src/data/documentacion.ts |
| RNF-15 | Registro de decisiones de arquitectura | implementado | media | project_adrs |
| RNF-22 | Entorno de desarrollo reproducible en contenedor | implementado | media | .devcontainer/ (Dockerfile, compose.yaml, devcontainer.json), compose.yaml |
| RNF-23 | Pruebas de integración contra libSQL real | implementado | media | compose.yaml, playwright.config.ts (E2E_DB_MODE), scripts/wait-libsql.mjs, scripts/seed-e2e.mjs |
| RNF-24 | Separación de niveles de autoridad verificable | implementado | media | src/data/gobernanza.ts, src/lib/gobernanza-estilos.ts, src/pages/docs/roles.astro, src/pages/docs/raci.astro |
| RNF-16 | Retención y purga de datos operativos | implementado | baja | monitor_checks, security_events |
| RNF-25 | Coste de lectura acotado en las páginas públicas | implementado | alta | monitor_daily, src/lib/monitor-rollup.ts, src/pages/api/cron/monitor-rollup.ts, src/pages/status.astro, src/lib/db-target.ts, lab/k6/lib/perfil.js |

### Usabilidad y accesibilidad

| ID | Requisito | Estado | Prioridad | Dónde vive |
|---|---|---|---|---|
| RNF-17 | Panel operable desde móvil | implementado | media | src/layouts/AdminLayout.astro |
| RNF-18 | Auditoría de accesibilidad automatizada | implementado | media | scripts/a11y-scan.mjs, .github/workflows/a11y.yml |
| RNF-19 | Navegación por teclado y anuncios en el portal | implementado | media | src/layouts/PortalLayout.astro |
| RNF-30 | Cambio de dominio sin enlaces rotos | implementado | alta | src/lib/canonical-host.ts (lista única de hosts), src/middleware.ts (destinoCanonico, antes de los guardas) para lo SSR, integrations/canonical-redirect.mjs par |
| RNF-21 | Paridad de traducciones verificable | implementado | media | src/i18n/en.ts (satisfies typeof es), src/i18n/routing.ts (TRANSLATED_ROUTES, translatedAlternates) |

## Actores

- **Visitante público**: Cualquier persona que navega el sitio público sin autenticarse: recluta, cliente potencial, buscador.
- **Administrador (Mike)**: Único usuario con acceso al panel /admin, autenticado con GitHub OAuth vía allowlist.
- **Cliente**: Persona de negocio de un proyecto gestionado. Entra al portal con cuenta propia (facturas, documentos, mensajes, avance) y además recibe links de cobro y presentaciones compartidas sin necesidad de sesión.
- **Cron externo (cron-job.org / Vercel Cron)**: Disparador automático periódico que golpea endpoints de sondeo, backup y rollups.
- **Pasarela de pagos (Wompi)**: Sistema externo que envía webhooks de eventos de pago.
- **Buscador (Google/Bing)**: Rastreador que consume sitemap, RSS y recibe notificaciones IndexNow.

## Casos de uso

- **CU-01** Explorar proyectos públicos
- **CU-02** Enviar mensaje de contacto
- **CU-03** Consultar estado del sistema
- **CU-04** Iniciar sesión como administrador
- **CU-05** Gestionar sesiones de dispositivo
- **CU-06** Registrar y dar seguimiento a un proyecto
- **CU-07** Elaborar un briefing de cliente
- **CU-08** Registrar costos y calcular P&L
- **CU-09** Recibir alerta de monitor caído
- **CU-10** Evaluar SLO de un servicio
- **CU-11** Ejecutar backup manual
- **CU-12** Procesar un pago con idempotencia
- **CU-13** Inyectar un fallo de chaos engineering
- **CU-14** Bloquear una IP maliciosa
- **CU-15** Aplicar rate limiting durable
- **CU-16** Proyectar una presentación con el público en sincronía
- **CU-17** Indexar contenido nuevo en buscadores
- **CU-19** Consultar el sitio en inglés
- **CU-18** Consultar documentación del proyecto
- **CU-20** Comprobar que lo automático siguió corriendo
