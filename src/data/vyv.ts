// Contenido de /docs/verificacion-validacion.
//
// No duplica los 15 niveles de src/data/testing.ts: los reclasifica bajo el
// marco IEEE 1012 (verificación vs. validación) y añade la razón de por qué
// cada uno cae de un lado o del otro. La página importa NIVELES directamente
// para pregunta/herramienta/archivos; este archivo solo aporta la etiqueta y
// el porqué.

export type TipoVV = 'verificacion' | 'validacion'

export const DEFINICIONES: Record<TipoVV, { titulo: string; pregunta: string; enfoque: string }> = {
  verificacion: {
    titulo: 'Verificación',
    pregunta: '¿Estamos construyendo el producto correctamente?',
    enfoque:
      'Conformidad interna: el código hace lo que su propia especificación dice que debe hacer. No necesita a nadie fuera del equipo — un esquema, un contrato o una línea de código ya definen qué es «correcto».',
  },
  validacion: {
    titulo: 'Validación',
    pregunta: '¿Estamos construyendo el producto correcto?',
    enfoque:
      'Conformidad externa: el sistema sirve para lo que una persona real necesita hacer con él. La vara no es una especificación interna, es alguien —o algo que simula a alguien— tratando de cumplir un objetivo real.',
  },
}

export type ClasificacionNivel = {
  /** Debe coincidir con Nivel.id en src/data/testing.ts */
  id: string
  tipo: TipoVV
  porque: string
}

export const CLASIFICACION: ClasificacionNivel[] = [
  {
    id: 'unitario',
    tipo: 'verificacion',
    porque: 'Compara la salida de una función contra lo que su propia firma promete. La vara la puso quien escribió el código, no un usuario.',
  },
  {
    id: 'integracion',
    tipo: 'verificacion',
    porque: 'Comprueba que un UNIQUE o una transacción se comportan como dice el esquema. Sigue siendo una afirmación interna sobre el sistema, no sobre su uso.',
  },
  {
    id: 'contratos',
    tipo: 'verificacion',
    porque: 'Un esquema Zod es la especificación. Verificar contra tu propio esquema es el caso más puro de «¿lo construimos como dijimos que lo íbamos a construir?».',
  },
  {
    id: 'cobertura',
    tipo: 'verificacion',
    porque: 'Mide qué parte del código se ejecutó contra la propia suite. No dice nada sobre si ese código sirve para algo real.',
  },
  {
    id: 'mutation',
    tipo: 'verificacion',
    porque: 'Comprueba que los propios tests defienden lo que dicen defender. Es verificación de la verificación, no toca al usuario en ningún momento.',
  },
  {
    id: 'npm-audit',
    tipo: 'verificacion',
    porque: 'Compara versiones de dependencias contra una lista de advisories publicados. Conformidad contra una base de datos externa, no contra una necesidad de un usuario.',
  },
  {
    id: 'codeql',
    tipo: 'verificacion',
    porque: 'Análisis estático de patrones de código contra reglas conocidas de vulnerabilidad. No ejecuta nada ni involucra a nadie usando el sistema.',
  },
  {
    id: 'verify-prod',
    tipo: 'verificacion',
    porque: 'Un health check confirma que el proceso desplegado es el que se esperaba desplegar. Es fidelidad al propio despliegue, no a una expectativa de usuario.',
  },
  {
    id: 'chaos',
    tipo: 'verificacion',
    porque: 'Confirma que el sistema se degrada como el diseño de resiliencia dice que debe degradarse. La especificación es interna: «esta ruta nunca debe romperse».',
  },
  {
    id: 'monitoreo',
    tipo: 'verificacion',
    porque: 'Sondea si el sistema sigue respondiendo lo que su contrato de servicio promete (disponibilidad). No mide si a alguien le sirve lo que responde.',
  },
  {
    id: 'carga',
    tipo: 'verificacion',
    porque: 'Comprueba que la latencia se mantiene dentro de un presupuesto definido por ingeniería, no por un usuario real observado.',
  },
  {
    id: 'dast',
    tipo: 'verificacion',
    porque: 'Compara el comportamiento del sitio en ejecución contra un catálogo externo de patrones de vulnerabilidad conocidos (OWASP), igual que SAST pero en caliente. El oráculo sigue siendo un estándar, no una persona usando el sistema.',
  },
  {
    id: 'e2e',
    tipo: 'validacion',
    porque:
      'No compara contra una especificación interna: simula a una persona con un navegador tratando de completar un objetivo real (pagar, ingresar, contratar). Si el flujo cambió de forma que ya no sirve, un e2e bien escrito lo nota aunque el código «cumpla su contrato».',
  },
  {
    id: 'a11y',
    tipo: 'validacion',
    porque:
      'La vara no es el propio código: es si una persona con lector de pantalla o sin ratón puede usar la página. axe-core es un proxy automatizado de esa pregunta —cubre ~30-40%— pero la pregunta que responde es externa al sistema, no interna.',
  },
  {
    id: 'usabilidad',
    tipo: 'validacion',
    porque:
      'El único nivel donde no hay ninguna especificación que verificar: el resultado es una observación de alguien que no construyó el sistema intentando usarlo. Es la validación en su forma más literal.',
  },
]

// ── Trazabilidad hacia atrás ────────────────────────────────────────────────
// La validación no puede quedarse solo en "usabilidad": el resto de /docs ya
// registra qué necesidad real originó cada requisito. Estos enlaces conectan
// el marco V&V con documentos que existían antes y que no hay que repetir.

export const TRAZABILIDAD = [
  {
    href: '/docs/casos-de-uso',
    titulo: 'Casos de uso',
    rol: 'La validación empieza aquí: cada caso de uso es una necesidad real de un actor, escrita antes que el código.',
  },
  {
    href: '/docs/historias-de-usuario',
    titulo: 'Historias de usuario',
    rol: 'Su Definition of Done es el criterio de validación en formato XP: cuándo una historia sirve de verdad, no solo cuándo compila.',
  },
  {
    href: '/docs/requerimientos-no-funcionales',
    titulo: 'Requerimientos no funcionales',
    rol: 'ISO/IEC 25010 es, en el fondo, un catálogo de propiedades verificables (rendimiento, seguridad, mantenibilidad) — el lado de verificación de este mismo mapa.',
  },
  {
    href: '/docs/testing',
    titulo: 'Testing — los 15 niveles',
    rol: 'El detalle técnico completo de cada nivel: herramienta, volumen, archivos, punto ciego. Esta página los reclasifica; esa los explica uno por uno.',
  },
  {
    href: '/docs/usability-testing',
    titulo: 'Usability testing',
    rol: 'La metodología de validación con usuarios en 6 pasos, aplicada a un flujo real del sitio.',
  },
]

// ── Niveles de integridad (IEEE 1012, cláusula 5) ───────────────────────────
// La distinción verificación/validación no dice cuánto rigor aplicar. Eso lo
// decide el nivel de integridad: la consecuencia de que ese subsistema falle,
// no la probabilidad. A mayor nivel, más tareas de V&V son obligatorias — acá
// se listan las que ya existen y las que el nivel exigiría y todavía faltan.
//
// OPSEC: /docs es público (solo /docs/presentacion es privado, ver
// middleware.ts). Los `refuerzoPendiente` describen la CLASE de tarea de V&V
// que falta, nunca el vector concreto que quedaría sin cubrir: en los
// subsistemas de nivel 3 y 4 esa frase sería un mapa de dónde buscar.

export type NivelIntegridad = 1 | 2 | 3 | 4

// El identificador que define el estándar es el número (4 a 1); el nombre es
// solo la glosa legible. Se eligió una escala monótona en español —crítico >
// alto > moderado > bajo— en vez de calcar High/Major/Moderate/Low, porque
// «mayor» no se lee como un escalón de severidad en castellano.
export const INTEGRIDAD_LABEL: Record<NivelIntegridad, { nombre: string; consecuencia: string }> = {
  4: { nombre: 'Crítico', consecuencia: 'Catastrófica — dinero real perdido, fraude, credenciales de terceros expuestas' },
  3: { nombre: 'Alto', consecuencia: 'Grave — acceso no autorizado al panel o a datos personales de un cliente' },
  2: { nombre: 'Moderado', consecuencia: 'Degradación operativa — se pierde visibilidad, no hay compromiso directo de datos' },
  1: { nombre: 'Bajo', consecuencia: 'Negligible — inconveniencia visual, nada operativo se rompe' },
}

export type Subsistema = {
  id: string
  nombre: string
  nivel: NivelIntegridad
  porque: string
  archivos: string
  /** ids de NIVELES (src/data/testing.ts) que ya cubren este subsistema. */
  cubiertoPor: string[]
  refuerzoPendiente?: string
}

export const SUBSISTEMAS: Subsistema[] = [
  {
    id: 'pagos',
    nombre: 'Pagos y cobros (Wompi)',
    nivel: 4,
    porque: 'Un fallo aquí es dinero real: doble cobro, estado de pago inconsistente entre pasarela y base propia.',
    archivos: 'src/lib/payments.ts, payments-state.ts, cobros*.ts',
    cubiertoPor: ['unitario', 'integracion', 'contratos', 'mutation', 'e2e'],
    refuerzoPendiente: 'Falta cubrir con concurrencia real todas las transiciones de la máquina de estados, no solo el camino feliz.',
  },
  {
    id: 'boveda',
    nombre: 'Bóveda de secretos (project_services.secrets)',
    nivel: 4,
    porque: 'Un fallo expone credenciales de terceros cifradas con AES-256-GCM a quien no debería verlas.',
    archivos: 'src/lib/crypto.ts, src/lib/vault.ts, project_services.secrets',
    cubiertoPor: ['unitario', 'codeql', 'npm-audit'],
    // Cerrado: la redacción antes de serializar pasó de repetirse a mano en cada
    // endpoint a una función con tipo `Omit` (src/lib/vault.ts) que el
    // compilador exige, más tests/vault.test.ts.
    refuerzoPendiente: 'Un nivel 4 pediría además revisión independiente del propio cifrado: hoy el diseño criptográfico lo audita quien lo escribió.',
  },
  {
    id: 'auth',
    nombre: 'Autenticación (admin OAuth+allowlist, portal scrypt)',
    nivel: 3,
    porque: 'Un fallo da acceso no autorizado al panel de control o a los datos de un cliente en el portal.',
    archivos: 'auth.config.ts, src/lib/auth.ts (admin) — src/lib/portal/session.ts, login.ts (portal)',
    cubiertoPor: ['integracion', 'e2e', 'dast'],
    refuerzoPendiente: 'Los casos negativos de revocación se prueban a mano; un nivel 3 pediría cubrirlos también de forma automatizada.',
  },
  {
    id: 'middleware-seguridad',
    nombre: 'Middleware de seguridad (clasificador, rate limit, blocklist)',
    nivel: 3,
    porque: 'Un fallo permite el bypass de un atacante. El diseño fail-open acota el daño a «no protege», nunca a «tumba el sitio».',
    archivos: 'src/lib/security/*',
    cubiertoPor: ['unitario', 'integracion', 'chaos', 'dast'],
  },
  {
    id: 'observabilidad',
    nombre: 'Micro-SIEM, crons, notificaciones',
    nivel: 2,
    porque: 'Un fallo pierde visibilidad operativa, no compromete datos directamente — proporcional al no-op silencioso con que ya están diseñados.',
    archivos: 'src/lib/notify.ts, src/pages/api/cron/*',
    cubiertoPor: ['unitario', 'monitoreo'],
  },
  {
    id: 'contenido-publico',
    nombre: 'Contenido público (/notes, /status, /tools)',
    nivel: 1,
    porque: 'Un fallo es inconveniencia visual. Nada operativo ni financiero depende de que estas páginas rendericen bien.',
    archivos: 'src/pages/*.astro (rutas públicas)',
    // Ojo: NO lo cubre «cobertura». El include de vitest.config.ts es
    // src/lib/**, así que ninguna página .astro entra en ese porcentaje.
    cubiertoPor: ['e2e', 'a11y'],
  },
]

// ── Procesos del ciclo de vida (IEEE 1012, cláusula 6) ──────────────────────
// El estándar no ata las tareas de V&V a "niveles de prueba" sino a fases del
// ciclo de vida del software. Este proyecto cubre casi todas sin haberlas
// nombrado así — esta tabla es esa traducción.

export type ProcesoCicloVida = {
  id: string
  nombre: string
  tareaVV: string
  dondeEnRepo: string
}

export const PROCESOS_CICLO_VIDA: ProcesoCicloVida[] = [
  { id: 'gestion', nombre: 'Gestión', tareaVV: 'Plan de V&V y asignación de nivel de integridad por riesgo', dondeEnRepo: 'Esta página + docs/plan-*.md' },
  { id: 'adquisicion', nombre: 'Adquisición / suministro', tareaVV: 'Auditoría de dependencias y librerías de terceros', dondeEnRepo: 'npm audit, CodeQL' },
  { id: 'concepto', nombre: 'Desarrollo — Concepto', tareaVV: 'Evaluación de la necesidad real antes de escribir código', dondeEnRepo: '/docs/casos-de-uso' },
  { id: 'requisitos', nombre: 'Desarrollo — Requisitos', tareaVV: 'Trazabilidad de cada requisito a una prueba concreta', dondeEnRepo: '/docs/historias-de-usuario, /docs/requerimientos-no-funcionales' },
  { id: 'diseno', nombre: 'Desarrollo — Diseño', tareaVV: 'Evaluación de interfaces contra su especificación', dondeEnRepo: 'Contratos Zod (tests/contracts.test.ts)' },
  { id: 'implementacion', nombre: 'Desarrollo — Implementación', tareaVV: 'Revisión del código fuente y de sus propias pruebas', dondeEnRepo: 'Unitarias + mutation testing' },
  { id: 'prueba', nombre: 'Desarrollo — Prueba', tareaVV: 'Generación y ejecución de casos de prueba', dondeEnRepo: 'Unitarias, integración, e2e' },
  { id: 'instalacion', nombre: 'Desarrollo — Instalación', tareaVV: 'Auditoría de configuración tras el despliegue', dondeEnRepo: 'job verify-production, health checks' },
  // Sin cifra de monitores: ese número ya vive en NIVELES.monitoreo.volumen
  // (testing.ts) y duplicarlo acá lo dejaría desactualizado en silencio.
  { id: 'operacion', nombre: 'Operación', tareaVV: 'Monitoreo continuo y detección de anomalías', dondeEnRepo: 'Monitoreo sintético + micro-SIEM' },
  { id: 'mantenimiento', nombre: 'Mantenimiento', tareaVV: 'Análisis de impacto de cada cambio antes de fusionarlo', dondeEnRepo: 'Suite de regresión en cada push' },
]

export const GLOSARIO_VV = [
  { termino: 'IEEE 1012', def: 'El estándar que formaliza la distinción verificación/validación para software (Verification and Validation Plans). No define herramientas, solo el marco de preguntas.' },
  { termino: 'V-model', def: 'Representación clásica del ciclo de vida donde cada etapa de construcción tiene su etapa de verificación espejo. Aquí no se sigue el modelo en cascada, pero la pregunta de cada espejo sigue aplicando.' },
  { termino: 'Oráculo', def: 'La fuente de verdad contra la que se compara un resultado. En verificación el oráculo es interno (un esquema, un contrato); en validación el oráculo es una necesidad externa, a menudo humana.' },
  { termino: 'UAT', def: 'User Acceptance Testing: validación formal hecha por quien va a usar o pagar por el sistema, no por quien lo construyó. Este proyecto no tiene un UAT formal separado — el usability testing y los casos de uso cumplen ese rol.' },
  { termino: 'Nivel de integridad', def: 'Clasificación de IEEE 1012 (1 a 4) según la consecuencia de que un subsistema falle, no según la probabilidad de que falle. A mayor nivel, más tareas de V&V son obligatorias.' },
  { termino: 'IV&V', def: 'V&V independiente: la ejecuta alguien con presupuesto, personal y línea de reporte separados de quien desarrolló. IEEE 1012 la exige en los niveles de integridad altos, porque el autor de un módulo comparte los puntos ciegos de su propio diseño. Un proyecto de una persona no puede cumplirla.' },
]
