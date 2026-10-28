# 19 · Historia e iteraciones

Fuente: [`src/data/iteraciones-portfolio.ts`](../../src/data/iteraciones-portfolio.ts)
(publicado como kanban en `/docs/kanban`). Cada iteración trae además su
resumen, sus historias y el rango de commits en GitHub. El repo empezó el
**26 abr 2026**; a la fecha de esta foto lleva 3.303 commits (el entorno de
trabajo commitea cada edición, así que la historia es muy granular).

## Iteraciones (54)

| # | Fecha | Iteración |
|---|---|---|
| 1 | 26 abr | **Fundación**: Astro, auth y CRM base |
| 2 | 20 may | **CRM y auth**: backups, GitHub OAuth, rediseño del CRM |
| 3 | 8-30 jun | **Observabilidad**: monitoreo, cifrado de variables, dominios, presentaciones |
| 4 | 1-5 jul | **Vitrina y SEO**: `/status`, EKG, capa técnica de SEO |
| 5 | 6-9 jul | **Seguridad**: micro-SIEM, rate limiting durable, blocklist |
| 6 | 9-11 jul | **Panel de ingeniería** con métricas verificables |
| 7 | 11 jul | **Lab de fingerprinting** ("sala de espejos") |
| 8 | 11-12 jul | **Login passwordless** (WebAuthn/FIDO2) |
| 9 | 13-14 jul | **Documentación pública**: `/docs` fuera de `/admin`, trazabilidad |
| 10 | 15 jul | **Lab de experimentos** CI/CD y **demo** read-only del admin |
| 11 | 15 jul | **Portal de clientes**: facturación, cobros por WhatsApp, mensajería |
| 12 | 15 jul | **Gestión del portal** y arnés E2E |
| 13 | 15-16 jul | **E2E en CI** y unificación de variables de entorno |
| 14 | 16 jul | **SAST** (CodeQL, npm audit) y **a11y** (axe) |
| 15 | 16-17 jul | **Demo del portal** con sembrado automático |
| 16 | 16-17 jul | **Mutation testing** (Stryker) y contratos de API |
| 17 | 17 jul | **Analizador público de sitios** |
| 18 | 17 jul | **"Ver como cliente"** y facturas en PDF |
| 19 | 18 jul | **Platzi Conf** y presentaciones públicas |
| 20 | 18 jul | Pulido visual y parser único de tech stack |
| 21 | 18-19 jul | **Descarga de CV** con huella y auditoría |
| 22 | 19 jul | Rutas de aprendizaje y **bloqueo escalado de IPs** |
| 23 | 19-20 jul | Fondo ambiental y footer |
| 24 | 21-22 jul | **Guía de testing** y V&V |
| 25 | 23 jul | **DAST** con OWASP ZAP |
| 26 | 24 jul | **Pipeline en vivo** y landing `/paginas-web` |
| 27 | 24 jul | Accesibilidad del portal, Lenis y GSAP |
| 28 | 25-27 jul | **Motor BPMN propio** y documento de arquitectura (DEA) |
| 29 | 25-29 jul | **Inglés** bajo `/en` sin abrir bypasses |
| 30 | 28-29 jul | Coste de las consultas de `/status`, demo encendida |
| 31 | 29-30 jul | **Portal en tiempo real** (digest, campana, feed) |
| 32 | 29-30 jul | Cierre del plan bilingüe |
| 33 | 30 jul | **UML con motor propio** (despliegue, comunicación, actividades, componentes) y **Docker** |
| 34 | 6 ago | **Presentaciones** con PIN y público en sincronía (Upstash) |
| 35 | 8 ago | **Tracker de aprendizaje** |
| 36 | 8 ago | **Capacitación en IA** como línea de negocio |
| 37 | 10-12 ago | Coste acotado, **degradación elegante**, respaldo verificable |
| 38 | 15-16 ago | **Runbook de Turso** |
| 39 | 18-21 ago | Reportes de pruebas publicados |
| 40 | 23-24 ago | **Diagrama de red** por zonas de confianza |
| 41 | 25-26 ago | Calculadora de **etapa productiva SENA** |
| 42 | 1 sep | **Cuentas de cobro** |
| 43 | 1 sep | **Automatizaciones** y bitácora de crons |
| 44 | 1 sep | Mando de `/final.html` desde el celular |
| 45 | 1-2 sep | Lienzo tocable, espejo y cronómetro de la sustentación |
| 46 | 12-15 sep | **Simulador de costos** de infraestructura |
| 47 | 18 sep | **Load testing** con k6 de punta a punta |
| 48 | 7 y 22 sep | **Cómputo por proyecto** y cuota compartida |
| 49 | 22-28 sep | **Motion propio** en la portada y las páginas de ingeniería |
| 50 | 1 oct | Halloween en la portada |
| 51 | 6 oct | **Plano** |
| 52 | 6 oct | **Dashboard con caja del asistente** |
| 53 | 6 oct | **Cotiza** |
| 54 | 6 oct | **Escrituras del asistente** con aprobación |

Todas las fechas son de 2026.

## Después de la iteración 54 (aún sin entrada en el kanban)

- 28 sep - 1 oct: **analista del micro-SIEM** (RF-613), presentado en un meetup
  el 1 oct.
- 1-2 oct: **asesor público** en la burbuja de WhatsApp (RF-212) y **asesor en
  vivo** (RF-213); `/ep` y `/contact` con motion; tarifas fijadas.
- 3 oct: `/architecture` con trazador de peticiones (RF-036).
- 6 oct: **hero con cotizador de IA** (RF-037), **marketing por correo**
  (RF-225), **vigía nocturno** con Managed Agents (RF-510).
- 20 oct: **AEO** (RF-039), página de Facebook con kit de 12 posts, auditoría
  del sitio con 8 hallazgos.
- 21 oct: análisis de rendimiento de la portada (cuello: actualización de capas
  por fotograma; `content-visibility` probado, sin implementar).
- 28 oct: **vigía de la agenda del instructor** de etapa productiva (RF-040).

## Incidentes reales y lo que dejaron

| Fecha | Qué pasó | Qué quedó |
|---|---|---|
| jul 2026 | Cuota de Turso agotada por falta de índices | Índices, lectura por lotes |
| ago 2026 (x2) | Cuota agotada: `/status` agregaba el crudo; luego `/api/now` agregaba 30 días de checks. Base bloqueada a semanas de la sustentación | `monitor_daily`, regla de las 24 h, modo respaldo del portal, instantánea pública, runbook |
| 10 ago - 1 sep | Hueco real de sondeos por el bloqueo | Visible en el historial, no se maquilla |
| 5-7 sep | Cambio de dominio a `.net`; el `.tech` vence y muere; los crons de cron-job.org apuntaban al `.tech` y se cortan | Detector de silencio de crons (RF-408) |
| 10 sep | Mike se autobloquea por un honeypot | `esIpPropia`, allowlist de IPs |
| 18 sep | La demo podía leer la base real en dev por HMR | `AsyncLocalStorage` en `globalThis` + test |
| 18 sep | La fase 5 del LAB (k6) llevaba dos meses "bloqueada" esperando un token que no hacía falta: un preview no puede ser objetivo de carga | k6 contra `sqld` local; artículo `/notes/el-bloqueo-que-no-era-una-credencial` |
| 6 oct | El vigía abre PRs (#4, #5) | Regla: nunca ramas ni PRs, cambios sin commitear |
| 6 oct | Un bug de `waitUntil` en el SIEM | Cerrado |
| (antes) | Un emoji en un header HTTP rompía todas las alertas ntfy | Arreglado en `notify.ts` |

## Hitos académicos (SENA)

- Sustentaciones del proyecto formativo antes y después del 1 sep 2026 (de ahí
  el diseño "funciona con la base caída").
- Etapa productiva en curso (oct 2026): `/ep`, recordatorios y vigía de agenda.
- Entregables: DEA, plan de pruebas, plan de implantación, manuales de usuario,
  instalación y técnico, plan de capacitación, diagramas UML (en `docs/`,
  `manuales_sena/` y la raíz).
