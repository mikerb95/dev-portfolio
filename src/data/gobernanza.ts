// Contenido de /docs/gobernanza.
//
// Niveles de autoridad (estratégico / táctico / operativo) y matriz RACI del
// proyecto. La particularidad que hay que sostener en la sustentación: aquí los
// tres niveles NO son tres personas - son tres tipos de decisión, separados por
// quién puede autorizar qué. La separación no depende de la disciplina de quien
// programa: está impuesta por el pipeline (ci.yml), la allowlist del middleware
// y la política de migraciones aditivas. Por eso cada fila lleva `evidencia`:
// el archivo o mecanismo donde esa frontera existe en el código.

export type Nivel = 'estrategico' | 'tactico' | 'operativo'

export interface NivelAutoridad {
  id: Nivel
  nombre: string
  /** La frase de la pirámide: qué hace este nivel, en cuatro palabras. */
  lema: string
  /** Quién ocupa el rol en este proyecto (persona, automatización, o ambas). */
  quien: string
  decide: string[]
  /** El límite: lo que este nivel NO puede hacer aunque tenga acceso técnico. */
  noPuede: string
  evidencia: { que: string; donde: string }[]
}

export const NIVELES_AUTORIDAD: NivelAutoridad[] = [
  {
    id: 'estrategico',
    nombre: 'Estratégico',
    lema: 'Aprueba recursos y salida',
    quien:
      'El dueño del producto (Mike). Frente a un encargo de cliente, el cliente comparte este nivel dentro del alcance contratado: aprueba alcance y presupuesto, no la implementación.',
    decide: [
      'Qué sale a producción y cuándo: el deploy es una decisión humana reservada, ninguna automatización publica por su cuenta.',
      'Qué recursos se contratan y se pagan: dominio, proyecto de Vercel, Turso, pasarela de pagos, canal de alertas.',
      'Quién tiene acceso al panel de control (allowlist de logins) y quién recibe credenciales del portal.',
      'Qué requisito entra al alcance y cuándo pasa de «planeado» a «implementado», y qué iteración se cierra.',
      'Los compromisos públicos de servicio: objetivos de nivel de servicio y precios publicados.',
    ],
    noPuede:
      'Saltarse las compuertas que él mismo definió sin dejar rastro: el pipeline corre igual, el health check post-deploy corre igual y el rollback automático se dispara igual sobre un deploy aprobado.',
    evidencia: [
      { que: 'Regla no negociable: solo el dueño dispara deploys y commits', donde: 'CLAUDE.md' },
      { que: 'Allowlist de acceso al panel, revalidada en cada request', donde: 'ALLOWED_GITHUB_LOGINS · src/middleware.ts' },
      { que: 'Alcance y estado de cada requisito, con origen y verificación', donde: 'src/data/documentacion.ts' },
      { que: 'Cierre de iteraciones', donde: 'src/data/iteraciones-portfolio.ts' },
      { que: 'Secretos y recursos contratados', donde: 'variables de entorno en Vercel (proyecto dev-portfolio)' },
    ],
  },
  {
    id: 'tactico',
    nombre: 'Táctico',
    lema: 'Coordina y activa rollback',
    quien:
      'La cadena de entrega: el pipeline de integración continua, los crons externos y el middleware de seguridad. Cuando la automatización no alcanza (un incidente que exige criterio), lo ocupa la misma persona con otro sombrero: el de operador de guardia.',
    decide: [
      'Si una versión desplegada se queda o se revierte: comprueba la salud del despliegue y ejecuta el rollback sin pedir permiso.',
      'El orden y las precondiciones del trabajo: el deploy no se verifica si antes no pasaron pruebas y build.',
      'Si un request se bloquea, se limita o pasa: clasificador de amenazas, límite de tasa durable y lista de bloqueo.',
      'Cuándo notificar y a quién: alertas push cuando hay rollback, incidente o anomalía de seguridad.',
      'Cuándo corre el trabajo periódico: chequeos de monitores, consolidados y alertas.',
    ],
    noPuede:
      'Publicar una versión nueva. Solo puede confirmar la que ya fue aprobada o devolver el sistema a la anterior - avanzar es del nivel estratégico, retroceder es suyo.',
    evidencia: [
      { que: 'Job «Verificar deploy + rollback»: health check contra /api/health y vercel rollback', donde: '.github/workflows/ci.yml' },
      { que: 'Dependencia entre etapas: el deploy se verifica solo si pasó calidad', donde: 'needs: quality · .github/workflows/ci.yml' },
      { que: 'Decisiones de bloqueo por request, con política fail-open', donde: 'src/middleware.ts · src/lib/security/' },
      { que: 'Trabajo periódico autenticado con secreto de cron', donde: '/api/cron/* (Bearer CRON_SECRET)' },
      { que: 'Notificación de rollback e incidentes', donde: 'src/lib/notify.ts (ntfy)' },
    ],
  },
  {
    id: 'operativo',
    nombre: 'Operativo',
    lema: 'Ejecuta, prueba y reporta',
    quien:
      'El desarrollo diario: quien escribe el código (con asistencia de un agente) y los sensores del sistema que registran lo que pasa.',
    decide: [
      'Cómo se implementa un requisito ya aprobado: diseño de módulos, estructura de datos, algoritmos.',
      'Qué pruebas cubren cada cambio y en qué nivel (unitaria, integración, extremo a extremo, accesibilidad, seguridad).',
      'Qué se registra como evento observable y con qué detalle, dentro de la política de datos públicos agregados.',
      'Qué se documenta en /docs y qué cifras se publican - siempre leídas del dato tipado, nunca escritas a mano.',
    ],
    noPuede:
      'Publicar en producción, eliminar una columna del esquema, ni exponer secretos: las migraciones son aditivas por política y los secretos solo se revelan por un endpoint bajo sesión administrada.',
    evidencia: [
      { que: 'Lógica de negocio y módulos puros', donde: 'src/lib/' },
      { que: 'Suites de prueba', donde: 'tests/ (Vitest) · e2e/ (Playwright)' },
      { que: 'Registro de eventos sensibles, sin bloquear la respuesta', donde: 'recordSecurityEvent · tabla security_events' },
      { que: 'Migraciones generadas, solo aditivas, nunca editadas a mano', donde: 'drizzle/' },
      { que: 'Cifras de /docs leídas del dato tipado', donde: 'src/data/' },
    ],
  },
]

export const ORDEN_NIVELES: Nivel[] = ['estrategico', 'tactico', 'operativo']

// ── RACI ────────────────────────────────────────────────────────────────────

export type RolRaci = 'R' | 'A' | 'C' | 'I'

export const LEYENDA_RACI: Record<RolRaci, { nombre: string; que: string }> = {
  R: { nombre: 'Responsable', que: 'Ejecuta la actividad.' },
  A: { nombre: 'Aprobador', que: 'Responde por el resultado. Solo puede haber uno por actividad.' },
  C: { nombre: 'Consultado', que: 'Aporta criterio antes de decidir.' },
  I: { nombre: 'Informado', que: 'Recibe el avance o el resultado.' },
}

export interface ActividadRaci {
  id: string
  actividad: string
  /**
   * Roles de ese nivel en la actividad. Un nivel puede acumular varios: lo
   * habitual es ['A', 'R'] cuando quien aprueba es también quien ejecuta - que
   * en un proyecto de una sola persona es la mitad de las filas. null = ese
   * nivel no participa en absoluto (mejor que inventar una I de relleno).
   */
  asignacion: Record<Nivel, RolRaci[] | null>
  /** Por qué la A cae donde cae: el riesgo que justifica reservar la aprobación ahí. */
  porque: string
  /** Dónde se comprueba en el repositorio que la frontera existe de verdad. */
  evidencia: string
}

export const RACI: ActividadRaci[] = [
  {
    id: 'alcance',
    actividad: 'Definir el alcance de una iteración',
    asignacion: { estrategico: ['A', 'R'], tactico: ['I'], operativo: ['C'] },
    porque:
      'Comprometer alcance es comprometer tiempo y dinero propios. El nivel operativo aporta la estimación, pero no puede aprobar su propia carga de trabajo.',
    evidencia: 'src/data/iteraciones-portfolio.ts · docs/plan-*.md',
  },
  {
    id: 'desarrollo',
    actividad: 'Desarrollar una funcionalidad',
    asignacion: { estrategico: ['A'], tactico: ['I'], operativo: ['R'] },
    porque:
      'La implementación es una decisión técnica delegada; lo que no se delega es dar por buena la funcionalidad terminada.',
    evidencia: 'src/lib/ · src/pages/',
  },
  {
    id: 'pruebas',
    actividad: 'Ejecutar las pruebas (unitarias, e2e, accesibilidad, análisis estático)',
    asignacion: { estrategico: ['I'], tactico: ['C'], operativo: ['R'] },
    porque:
      'Quien ejecuta las pruebas no debería ser quien decide si un resultado en rojo se ignora: el pipeline consulta el resultado y corta por sí mismo.',
    evidencia: 'tests/ · e2e/ · workflows ci.yml, security.yml, a11y.yml, mutation.yml, dast.yml',
  },
  {
    id: 'deploy',
    actividad: 'Aprobar y disparar el despliegue a producción',
    asignacion: { estrategico: ['A'], tactico: ['R'], operativo: ['I'] },
    porque:
      'Es el punto de no retorno hacia usuarios reales. La aprobación es humana y reservada; la ejecución mecánica del despliegue ya es de la plataforma.',
    evidencia: 'Regla de deploys en CLAUDE.md · despliegue en Vercel disparado por el dueño',
  },
  {
    id: 'health',
    actividad: 'Verificar la salud del sistema después de desplegar',
    asignacion: { estrategico: ['I'], tactico: ['R'], operativo: ['C'] },
    porque:
      'Una comprobación automática e incondicional vale más que la atención de una persona justo después de publicar, que es cuando menos disponible está.',
    evidencia: 'Paso «Health check post-deploy» contra /api/health en .github/workflows/ci.yml',
  },
  {
    id: 'rollback',
    actividad: 'Revertir a la versión anterior (rollback)',
    asignacion: { estrategico: ['A'], tactico: ['R'], operativo: ['I'] },
    porque:
      'Revertir se ejecuta sin esperar autorización porque el costo de esperar es tiempo de caída; la política que lo autoriza se aprobó antes, no durante el incidente.',
    evidencia: 'Paso «Rollback automático» + notificación ntfy en .github/workflows/ci.yml',
  },
  {
    id: 'migracion',
    actividad: 'Aplicar una migración de esquema',
    asignacion: { estrategico: ['A'], tactico: ['I'], operativo: ['R'] },
    porque:
      'Una migración destructiva no tiene rollback barato: los datos ya no están. Por eso las migraciones son aditivas por política y eliminar una columna exige autorización explícita.',
    evidencia: 'drizzle/ (generadas, nunca editadas a mano) · política de migraciones aditivas en CLAUDE.md',
  },
  {
    id: 'secretos',
    actividad: 'Gestionar secretos y variables de entorno',
    asignacion: { estrategico: ['A'], tactico: ['C'], operativo: ['I'] },
    porque:
      'Un secreto filtrado no se corrige con un despliegue: hay que rotarlo en cada sistema que lo usa. El nivel operativo trabaja con los secretos, pero no los custodia.',
    evidencia: 'Bóveda cifrada AES-256-GCM en project_services.secrets · revelado solo bajo sesión administrada',
  },
  {
    id: 'alerta',
    actividad: 'Atender una alerta de seguridad',
    asignacion: { estrategico: ['A'], tactico: ['R'], operativo: ['C'] },
    porque:
      'La contención automática (limitar, bloquear) actúa en milisegundos; la decisión de escalar, avisar a un cliente o aceptar el riesgo sigue siendo humana.',
    evidencia: 'src/lib/security/ (clasificador, límite de tasa, lista de bloqueo) · tabla security_events · alertas ntfy',
  },
  {
    id: 'publicacion-docs',
    actividad: 'Publicar cifras en /docs y /status',
    asignacion: { estrategico: ['A'], tactico: ['I'], operativo: ['R'] },
    porque:
      'Son afirmaciones públicas sobre el propio sistema. Se generan desde el dato tipado y las mediciones reales para que nadie pueda «ajustar» un número al escribir la página.',
    evidencia: 'src/data/ como fuente de verdad de /docs · /status proyecta monitor_checks, no cifras escritas a mano',
  },
  {
    id: 'cobro',
    actividad: 'Cobrar a un cliente y conciliar el pago',
    asignacion: { estrategico: ['A'], tactico: ['R'], operativo: ['C'] },
    porque:
      'Es la única actividad donde un error mueve dinero de otra persona. La máquina de estados idempotente ejecuta; quién cobra, cuánto y a quién no se automatiza.',
    evidencia: 'src/lib/payments.ts (createPaymentIdempotent, applyGatewayEvent) · src/lib/payments-state.ts',
  },
  {
    id: 'datos-cliente',
    actividad: 'Dar acceso a un cliente a su información en el portal',
    asignacion: { estrategico: ['A'], tactico: ['C'], operativo: ['R'] },
    porque:
      'Un fallo de aislamiento no degrada una función: expone los datos de un cliente a otro. El identificador de cliente nunca viene del request, sale siempre de la sesión.',
    evidencia: 'requirePortalSession() en src/lib/portal/ · tests/portal-isolation.test.ts',
  },
]

/** Las dos reglas de la lámina; tests/gobernanza.test.ts las comprueba sobre RACI. */
export const REGLAS_RACI = [
  'Toda actividad tiene exactamente un Aprobador (A): si responden dos, no responde ninguno.',
  'Toda actividad tiene al menos un Responsable (R): sin ejecutor, la fila es una intención, no una asignación.',
]
