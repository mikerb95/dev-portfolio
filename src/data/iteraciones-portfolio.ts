// ─────────────────────────────────────────────────────────────────────────────
// Iteraciones — Portfolio (codebymike.tech / dev-portfolio)
// Tablero XP derivado del historial REAL de GitHub (mikerb95/dev-portfolio).
// Mismo formato que src/data/iteraciones.ts (DobleYo); se inyecta como props
// en <IteracionesBoard> para reutilizar el mismo motor de render sin duplicar
// lógica (ver docs/plan-documentacion.md).
//
// El "par" refleja la programación en pareja humano–IA: Mike (@mikerb95)
// conduce las decisiones de diseño y un agente de IA actúa como navegador.
// ─────────────────────────────────────────────────────────────────────────────

import type { Par, Columna, Iteracion } from './iteraciones'

export const REPO = 'https://github.com/mikerb95/dev-portfolio'

export const PARES: Record<string, Par> = {
  MR: { nombre: 'Mike Restrepo', rol: 'Conductor (humano)', color: '#3a2618' },
  FB: { nombre: 'Claude Fable 5', rol: 'Navegador (IA)', color: '#00838f' },
  OP: { nombre: 'Claude Opus', rol: 'Navegador (IA)', color: '#5319e7' },
  SN: { nombre: 'Claude Sonnet', rol: 'Navegador (IA)', color: '#1f6feb' },
}

export const COLUMNAS: Columna[] = [
  { id: 'cola', nombre: 'Cola (pendiente)', color: '#9aa0a6' },
  { id: 'iteracion', nombre: 'Planeada', color: '#5319e7' },
  { id: 'desarrollo', nombre: 'En desarrollo', color: '#2a6f97' },
  { id: 'aceptacion', nombre: 'En aceptación', color: '#c9893d' },
  { id: 'aceptada', nombre: 'Aceptada', color: '#2e7d5b' },
]

const ok = (texto: string) => ({ texto, estado: 'pass' as const })
const pend = (texto: string) => ({ texto, estado: 'pend' as const })

export const ITERACIONES: Iteracion[] = [
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-fundacion',
    fase: 'Fase 1 · Fundación',
    nombre: 'Bootstrap del portfolio: Astro, auth y CRM base',
    rango: '26 abr 2026',
    ghSince: '2026-04-26',
    ghUntil: '2026-04-27',
    commits: 80,
    resumen:
      'Scaffold inicial en un único sprint intensivo: proyecto Astro con Tailwind, esquema Drizzle/SQLite, autenticación y control de acceso a /admin, y las primeras páginas del CRM (proyectos, clientes, mensajes, finanzas).',
    historias: [
      {
        id: 'PF-F-01', titulo: 'Como visitante, quiero ver el portfolio público con proyectos reales para evaluar el trabajo de Mike',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-04-26', tags: ['astro', 'público', 'fase-1'],
        dod: [
          ok('BaseLayout, Navbar, Footer y la página principal con hero, proyectos y proceso quedan operativos.'),
          ok('ProjectCard consume datos reales de GitHub vía API de repos.'),
          ok('Tailwind CSS v4 configurado con paleta y tipografía del sitio.'),
        ],
      },
      {
        id: 'PF-F-02', titulo: 'Como administrador, quiero autenticarme y que solo yo pueda entrar a /admin',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-04-26', tags: ['auth', 'seguridad', 'fase-1'],
        dod: [
          ok('Middleware de Astro protege todas las rutas /admin y /api/admin.'),
          ok('Auth.js con proveedor GitHub y allowlist de logins permitidos.'),
          ok('Base de datos Drizzle + libSQL con el esquema inicial de clients/projects/messages/finances.'),
        ],
      },
      {
        id: 'PF-F-03', titulo: 'Como administrador, quiero un dashboard con KPIs y gestión de proyectos, clientes y finanzas',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-04-26', tags: ['crm', 'dashboard', 'fase-1'],
        dod: [
          ok('Dashboard admin con KPIs de proyectos, mensajes, clientes y finanzas.'),
          ok('Sidebar de navegación agrupada y FinanceTable/MessagesList funcionales.'),
          ok('Formulario de contacto público con validación y persistencia de mensajes.'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-crm-auth',
    fase: 'Fase 2 · CRM y auth',
    nombre: 'Backups, GitHub OAuth y rediseño del CRM',
    rango: '20 may 2026',
    ghSince: '2026-05-20',
    ghUntil: '2026-05-21',
    commits: 21,
    resumen:
      'Se reemplaza el login por credenciales con GitHub OAuth, se añade respaldo automático a Blob storage vía cron de Vercel, y se rediseñan a fondo dashboard, sidebar, contacto y certificaciones. Primer borrador de requerimientos funcionales y user stories.',
    historias: [
      {
        id: 'PF-CA-01', titulo: 'Como administrador, quiero backups automáticos de la base de datos para no perder información',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-05-20', tags: ['backups', 'cron', 'fase-2'],
        dod: [
          ok('API de backups sube snapshots a Vercel Blob mediante cron programado.'),
          ok('Página /admin/backup lista y permite crear backups manualmente.'),
        ],
      },
      {
        id: 'PF-CA-02', titulo: 'Como administrador, quiero iniciar sesión con GitHub en vez de usuario/contraseña',
        tipo: 'historia', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-05-20', tags: ['auth', 'oauth', 'fase-2'],
        dod: [ok('Proveedor Credentials reemplazado por GitHub Provider en Auth.js.')],
      },
      {
        id: 'PF-CA-03', titulo: 'Como administrador, quiero un dashboard, sidebar y páginas de certificaciones con mejor UX',
        tipo: 'historia', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-05-20', tags: ['ui', 'certificaciones', 'fase-2'],
        dod: [
          ok('Dashboard, Sidebar, AdminLayout y contacto rediseñados con mejor jerarquía visual.'),
          ok('CertCard y la página de certificaciones muestran estado (vigente/expirada) correctamente.'),
        ],
      },
      {
        id: 'PF-CA-04', titulo: 'Como stakeholder académico, quiero documentación de requerimientos funcionales y user stories',
        tipo: 'tarea', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-05-20', tags: ['documentación', 'fase-2'],
        dod: [
          ok('Documento de requerimientos funcionales para gestión de proyectos y clientes.'),
          ok('User stories de visitantes públicos y funcionalidades de administrador.'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-observabilidad',
    fase: 'Fase 3 · Observabilidad',
    nombre: 'Monitoreo, encriptación de variables, dominios y presentaciones',
    rango: '8 – 30 jun 2026',
    ghSince: '2026-06-08',
    ghUntil: '2026-06-30',
    commits: 104,
    resumen:
      'Sprint de infraestructura interna: monitoreo activo de servicios con checks periódicos, cifrado de variables de entorno sensibles por proyecto, gestión de dominios/DNS, seguimiento CRM (pipeline de oportunidades), briefings de cliente y un módulo de presentaciones (slides) con control remoto.',
    historias: [
      {
        id: 'PF-OB-01', titulo: 'Como administrador, quiero monitorear la salud de mis servicios en producción',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-06-20', tags: ['monitoreo', 'fase-3'],
        dod: [
          ok('Esquema monitors/monitor_checks/monitor_incidents con checks HTTP periódicos.'),
          ok('Página /admin/monitors con estado, latencia e incidentes por monitor.'),
          ok('13 commits dedicados a monitoreo durante la iteración.'),
        ],
      },
      {
        id: 'PF-OB-02', titulo: 'Como administrador, quiero que las variables de entorno de mis proyectos estén cifradas',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-06-15', tags: ['seguridad', 'cripto', 'fase-3'],
        dod: [
          ok('Utilidades de cifrado/descifrado (crypto.ts) para project_env_vars.'),
          ok('Revelado de secretos on-demand vía fetch, sin exponerlos en el HTML inicial.'),
        ],
      },
      {
        id: 'PF-OB-03', titulo: 'Como administrador, quiero gestionar dominios y ver su estado DNS/SSL',
        tipo: 'historia', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-06-25', tags: ['dominios', 'fase-3'],
        dod: [ok('Página /admin/domains con verificación de dominios (8 commits del periodo).')],
      },
      {
        id: 'PF-OB-04', titulo: 'Como administrador, quiero un pipeline de seguimiento comercial (leads → propuesta → cierre) y briefings de cliente',
        tipo: 'historia', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-06-22', tags: ['crm', 'seguimiento', 'fase-3'],
        dod: [
          ok('Página /admin/seguimiento con tablero de interacciones por proyecto.'),
          ok('Módulo de briefings con formulario e ítems asociados.'),
        ],
      },
      {
        id: 'PF-OB-05', titulo: 'Como administrador, quiero presentar slides a clientes con control remoto',
        tipo: 'historia', valor: 'bajo', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-06-28', tags: ['slides', 'fase-3'],
        dod: [
          ok('presentations/presentation_slides con reveal.js.'),
          ok('Vistas /admin/slides/[id]/present y /control sincronizadas (8 commits).'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-vitrina-seo',
    fase: 'Fase 4 · Vitrina y SEO',
    nombre: 'Vitrina pública, status page, EKG y capa técnica de SEO',
    rango: '1 – 5 jul 2026',
    ghSince: '2026-07-01',
    ghUntil: '2026-07-06',
    commits: 126,
    resumen:
      'Se abre el portfolio hacia afuera: página pública de estado (/status) con latencia en tiempo real y animación EKG, sección de notas técnicas, mock de herramientas, y una capa SEO completa (JSON-LD, breadcrumbs, RSS, IndexNow, manifest, OG images).',
    historias: [
      {
        id: 'PF-VS-01', titulo: 'Como visitante, quiero ver el estado en vivo de los servicios (uptime, incidentes, latencia)',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-05', tags: ['status', 'público', 'fase-4'],
        dod: [
          ok('/status muestra uptime global de 30 días e incidentes activos.'),
          ok('Animación EKG con latencia p95 en tiempo real por monitor (13 commits de status).'),
          ok('API de latencia expone último estado y hora de chequeo por monitor.'),
        ],
      },
      {
        id: 'PF-VS-02', titulo: 'Como visitante, quiero que el sitio sea indexable y compartible (SEO técnico completo)',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-05', tags: ['seo', 'fase-4'],
        dod: [
          ok('JSON-LD y breadcrumbs estructurados en páginas de proyecto.'),
          ok('Feed RSS y notificación IndexNow a buscadores en cada publicación (8 commits de IndexNow).'),
          ok('Web app manifest y apple-touch-icon para instalación como PWA.'),
        ],
      },
      {
        id: 'PF-VS-03', titulo: 'Como visitante, quiero una vitrina pública de herramientas y notas técnicas del stack',
        tipo: 'historia', valor: 'medio', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-04', tags: ['vitrina', 'notas', 'fase-4'],
        dod: [
          ok('Secciones /tools y /notes publicadas con 5 artículos técnicos iniciales.'),
          ok('OG images generadas dinámicamente para cada nota/proyecto.'),
        ],
      },
      {
        id: 'PF-VS-04', titulo: 'Como administrador, quiero una demo read-only del panel admin para mostrar a reclutadores',
        tipo: 'spike', valor: 'bajo', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-15', tags: ['demo', 'fase-10'],
        dod: [ok('Entregada en Fase 10 — ver PF-LD-02.')],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-seguridad',
    fase: 'Fase 5 · Seguridad',
    nombre: 'Micro-SIEM, rate limiting durable y blocklist',
    rango: '6 – 9 jul 2026',
    ghSince: '2026-07-06',
    ghUntil: '2026-07-10',
    commits: 117,
    resumen:
      'Endurecimiento de la capa de seguridad del middleware: sensor de requests hostiles (clasificación por firmas), enforcement con blocklist de IPs, rate limiting durable respaldado en base de datos (sobrevive reinicios/deploys) y tests de la blocklist.',
    historias: [
      {
        id: 'PF-SG-01', titulo: 'Como administrador, quiero un sensor que observe y clasifique requests hostiles sin bloquear tráfico legítimo',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-08', tags: ['seguridad', 'siem', 'fase-5'],
        dod: [
          ok('classify.ts clasifica requests por firmas conocidas de ataque.'),
          ok('sensor.ts observa cada request de forma síncrona y no bloqueante (fire-and-forget).'),
          ok('security_events y security_rollups agregan eventos para el panel.'),
        ],
      },
      {
        id: 'PF-SG-02', titulo: 'Como administrador, quiero bloquear IPs maliciosas y aplicar rate limiting que sobreviva a un redeploy',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-09', tags: ['blocklist', 'rate-limit', 'fase-5'],
        dod: [
          ok('blocklist.ts responde 403 seco a IPs bloqueadas, con lectura cacheada 30s.'),
          ok('rate_limit_buckets: ratelimit-durable.ts reemplaza el rate limiting en memoria (9 commits).'),
          ok('Todo el bloque de enforcement es fail-open: un fallo nunca tumba el sitio.'),
          ok('Tests de blocklist y clasificación de seguridad en tests/.'),
        ],
      },
      {
        id: 'PF-SG-03', titulo: 'Como administrador, quiero anomalías de seguridad agregadas en un panel para revisión periódica',
        tipo: 'historia', valor: 'medio', col: 'desarrollo', par: 'MR', agente: 'Claude',
        tags: ['anomalías', 'fase-5'],
        dod: [
          ok('security_anomalies almacena desviaciones detectadas sobre los rollups.'),
          pend('Panel /admin/security con vista consolidada de anomalías y acciones de respuesta.'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-ingenieria',
    fase: 'Fase 6 · Panel de ingeniería',
    nombre: 'Página pública de ingeniería con métricas verificables y prueba de vida',
    rango: '9 – 11 jul 2026',
    ghSince: '2026-07-09',
    ghUntil: '2026-07-11',
    commits: 20,
    resumen:
      'Panel público /engineering que reúne solo señales verificables de producción: Core Web Vitals p75 de usuarios reales (RUM), resultado del pipeline CI (tests, cobertura, duración) y disponibilidad agregada del monitoreo. Cada card explica al hover de dónde sale el número y contra qué umbral se compara —nada de badges decorativos. Se le suma una prueba de vida que consulta datos frescos desde el navegador para demostrar que nada está hardcodeado.',
    historias: [
      {
        id: 'PF-EN-01', titulo: 'Como visitante técnico, quiero un panel público con métricas de ingeniería reales (Web Vitals, CI, disponibilidad)',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-09', tags: ['engineering', 'observabilidad', 'público', 'fase-6'],
        dod: [
          ok('/engineering muestra Core Web Vitals p75 de usuarios reales (RUM) con p50/p95, distribución de rating, tendencia 7d y peor ruta por métrica.'),
          ok('Cards de pipeline CI (tests, cobertura, duración) y disponibilidad agregada, alimentadas de ci_runs y monitor_checks.'),
          ok('CardPopover en cada métrica explica el origen del dato y el umbral contra el que se evalúa; página server-rendered con datos de producción.'),
        ],
      },
      {
        id: 'PF-EN-02', titulo: 'Como visitante técnico, quiero comprobar que las métricas de /engineering están vivas y no hardcodeadas',
        tipo: 'historia', valor: 'medio', col: 'aceptacion', par: 'MR', agente: 'Claude',
        fecha: '2026-07-11', tags: ['engineering', 'verificación', 'fase-6'],
        dod: [
          ok('Endpoint /api/engineering/live devuelve marcas de tiempo frescas (última muestra RUM, último sondeo, último run CI) más el reloj del servidor.'),
          ok('Las cards consultan la prueba de vida al abrirse e indican en vivo la frescura; solo expone metadatos, nunca URLs internas ni configuración.'),
          pend('Merge del PR #2 a main y despliegue a producción de la verificación en vivo.'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-lab-fingerprint',
    fase: 'Fase 7 · Lab educativo',
    nombre: 'Laboratorio de fingerprinting en vivo (Sala de espejos)',
    rango: '11 jul 2026',
    ghSince: '2026-07-11',
    ghUntil: '2026-07-11',
    commits: 21,
    resumen:
      'Demo educativa de device fingerprinting: varios dispositivos entran a una sala por QR y un tablero en vivo los reconoce por las señales que expone el navegador —sin cookies ni login— demostrando que el incógnito no evade la re-identificación. Recolector propio contrastado con FingerprintJS, capa de comportamiento y cierre pedagógico sobre defensas. Entregado en la rama lab-fingerprinting (PR #2).',
    historias: [
      {
        id: 'PF-FP-01', titulo: 'Como visitante, quiero escanear un QR y ver cómo un tablero reconoce mi dispositivo en vivo sin cookies',
        tipo: 'historia', valor: 'alto', col: 'aceptacion', par: 'MR', agente: 'Claude',
        fecha: '2026-07-11', tags: ['fingerprint', 'público', 'fase-7'],
        dod: [
          ok('Landing con consentimiento crea sala + QR; el tablero (/board) refleja los dispositivos por polling corto (Vercel no soporta WebSocket).'),
          ok('Al reentrar en incógnito o borrar cookies, el contador de "revisitas" sube: mismo dispositivo re-identificado (validado por smoke test de API).'),
          pend('Prueba end-to-end en navegador real del ciclo crear → escanear → revisita (canvas/WebGL/audio solo producen valores en un browser).'),
        ],
      },
      {
        id: 'PF-FP-02', titulo: 'Como visitante, quiero entender qué me delata: recolector propio contrastado con una librería y una capa de comportamiento',
        tipo: 'historia', valor: 'alto', col: 'aceptacion', par: 'MR', agente: 'Claude',
        fecha: '2026-07-11', tags: ['fingerprint', 'híbrido', 'fase-7'],
        dod: [
          ok('Recolector propio: canvas, WebGL, AudioContext, fuentes, pantalla, zona horaria, CPU/memoria, idiomas, touch y UA.'),
          ok('Segunda opinión con FingerprintJS (open source): su visitorId se muestra junto al hash propio en el tablero.'),
          ok('Entropía dinámica: cada señal bloqueada/vacía suma 0 bits; se declara como estimación educativa (EFF Panopticlick / AmIUnique), no medición poblacional.'),
          ok('Capa de comportamiento: cadencia de tecleo, velocidad de mouse y giroscopio (con permiso iOS 13+).'),
        ],
      },
      {
        id: 'PF-FP-03', titulo: 'Como responsable del sitio, quiero que la demo sea ética y segura: efímera, consentida y con defensas anti-abuso',
        tipo: 'historia', valor: 'alto', col: 'aceptacion', par: 'MR', agente: 'Claude',
        fecha: '2026-07-11', tags: ['fingerprint', 'privacidad', 'seguridad', 'fase-7'],
        dod: [
          ok('Salas efímeras: TTL de 2h purgadas por el cron (sweepFpRooms), sin PII persistente; consentimiento explícito antes de recolectar.'),
          ok('Rate limiting durable por endpoint (beat reescopado por dispositivo para eventos con muchos móviles tras una NAT).'),
          ok('entropyBits acotado a 0–64 en servidor y valores escapados en el DOM (el UA es controlable).'),
          ok('Cierre pedagógico: por qué el incógnito no protege y cómo defenderse (Tor, resistFingerprinting).'),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'pf-passwordless',
    fase: 'Fase 8 · Login passwordless',
    nombre: 'Login sin contraseña con llaves de seguridad (WebAuthn/FIDO2)',
    rango: '11 – 12 jul 2026',
    ghSince: '2026-07-11',
    ghUntil: '2026-07-12',
    commits: 20,
    resumen:
      'Segunda puerta de entrada a /admin, independiente de GitHub OAuth: llaves FIDO2 (YubiKey) como credenciales discoverable/resident. Registro de llaves gestionado desde /admin/passkeys (alta, nickname, revocación) y login usernameless que identifica la cuenta a partir de la llave tocada, con proof firmado de vida corta para que Auth.js emita la sesión.',
    historias: [
      {
        id: 'PF-PL-01', titulo: 'Como administrador, quiero registrar y gestionar mis llaves de seguridad desde el panel',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-11', tags: ['webauthn', 'passkey', 'fase-8'],
        dod: [
          ok('Tabla webauthnCredentials (credentialID, publicKey, counter, transports, nickname) con índice por login.'),
          ok('/admin/passkeys lista, añade (con nickname) y revoca llaves; excludeCredentials evita re-registrar la misma llave física.'),
          ok('API /api/admin/webauthn/{registration,credentials} protegida por el gate de sesión+allowlist existente.'),
        ],
      },
      {
        id: 'PF-PL-02', titulo: 'Como administrador, quiero entrar a /admin tocando mi llave, sin pasar por GitHub',
        tipo: 'historia', valor: 'alto', col: 'aceptada', par: 'MR', agente: 'Claude',
        fecha: '2026-07-12', tags: ['webauthn', 'passkey', 'auth', 'fase-8'],
        dod: [
          ok('Flujo usernameless (sin allowCredentials): el navegador ofrece las llaves discoverable del rpID y el login se descubre por el credentialID devuelto.'),
          ok('Proof HMAC de 30s (signPasskeyProof/verifyPasskeyProof) conecta la ceremonia FIDO2 con el provider "passkey" de Auth.js, sin repetir la criptografía ahí.'),
          ok('rpID/origin derivados del Host de cada request (prod, previews de Vercel y dev en cualquier puerto), no hardcodeados.'),
        ],
      },
      {
        id: 'PF-PL-03', titulo: 'Como administrador, quiero que el selector de llaves del navegador distinga cada YubiKey por su nombre',
        tipo: 'bug', valor: 'medio', col: 'cola', par: 'MR', agente: 'Claude',
        tags: ['webauthn', 'passkey', 'ux', 'pendiente'],
        dod: [
          pend('Detectado en uso real (2026-07-12): con 2+ llaves registradas, el diálogo nativo "Choose a passkey" de Chrome muestra "mikerb95 / USB security key" repetido para cada una, en vez del nickname (YubiKey 1, YubiKey 2) — porque userDisplayName se fija en generateRegistrationOptions con el login, no con un nombre por llave, y queda grabado en el hardware al registrar.'),
          pend('Fix: pasar un userDisplayName distinto por llave (ej. incluir el nickname) en buildRegistrationOptions, y re-registrar las llaves existentes para que tomen el nuevo nombre — el cambio no aplica retroactivo a credenciales ya grabadas.'),
        ],
      },
    ],
  },
]

export const COMMITS_POR_MES = [
  { mes: 'abr', commits: 80 },
  { mes: 'may', commits: 21 },
  { mes: 'jun', commits: 104 },
  { mes: 'jul', commits: 257 },
]
