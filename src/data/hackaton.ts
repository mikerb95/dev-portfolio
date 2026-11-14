// Datos de la página de apoyo para la Defensive Acceleration Hackathon (def/acc)
// de AI Safety Colombia, sábado 14 de noviembre de 2026 (RF-044 a RF-047).
//
// La página solo renderiza: ninguna hora, premio, perfil ni tarea se escribe en
// el .astro. Lo oficial se verificó contra la guía del evento
// (aisafetycolombia.org/defacchackathon/guia) el 14 nov 2026; lo que es del
// equipo (bloques de trabajo, tareas, la entrega a las 4:00 p.m. como meta
// propia) va marcado aparte para no confundirlo con el reglamento.
//
// Módulo puro: lo importan la página (también su <script>), la API y los tests.

export const GUIA_URL = 'https://www.aisafetycolombia.org/defacchackathon/guia'
export const ENTREGA_URL = 'https://www.aisafetycolombia.org/defacchackathon/entregar'

/** Día del evento en Bogotá (UTC-5 todo el año: Colombia no tiene horario de verano). */
export const DIA_EVENTO = '2026-11-14'

/** Límite de integrantes del reglamento. Configurable: el tablero lo lee de aquí. */
export const LIMITE_PERSONAS = { min: 2, max: 5 } as const

/** Horas clave del día, en minutos desde la medianoche de Bogotá. */
export const HITOS = {
  inicioDia: 8 * 60,
  finDia: 20 * 60,
  congelamiento: 14 * 60 + 15,
  entregaRecomendada: 16 * 60,
  cierreEntregas: 17 * 60,
  /** El aviso de prioritarias pendientes se enciende con este margen antes del congelamiento. */
  margenAvisoMin: 90,
} as const

export interface DatoClave {
  etiqueta: string
  valor: string
  detalle: string
}

export const DATOS_CLAVE: DatoClave[] = [
  {
    etiqueta: 'Fecha y lugar',
    valor: 'Sábado 14 de noviembre, 8:00 a.m. a 8:00 p.m.',
    detalle: 'Universidad de los Andes, Bogotá. Sprint en el salón ML 607 (edificio Mario Laserna); pitches y cierre en el Auditorio ML C desde las 5:00 p.m.',
  },
  {
    etiqueta: 'Equipos',
    valor: 'De 2 a 5 personas, sprint de 8 horas',
    detalle: 'Una persona registra el equipo (nombre, integrantes y track) antes de las 11:00 a.m. Quien llega sin equipo entra a uno en la actividad de las 8:30 a.m.',
  },
  {
    etiqueta: 'Premios',
    valor: 'COP 1.000.000 · 500.000 · 500.000',
    detalle: 'Primer, segundo y tercer puesto.',
  },
  {
    etiqueta: 'Pitch',
    valor: '3 minutos por equipo, sin diapositivas',
    detalle: 'Se proyecta la ficha técnica en PDF y el jurado puede hacer algunas preguntas cortas. El orden se publica a las 2:00 p.m.',
  },
]

export const ENTREGA = {
  ventana: 'Abre a las 7:00 a.m. y cierra a las 5:00 p.m. en punto, sin tiempo extra. Se envía una sola vez; las correcciones se piden por correo antes de las 5:00 p.m.',
  campos: [
    'Nombre del equipo',
    'Integrantes (2 a 5) con el correo con el que aplicó cada uno',
    'Título y track',
    'Resumen de 150 a 250 palabras',
    'Enlace al repositorio (GitHub o Colab) o a la demo; en el Track 5, al documento',
    'Ficha técnica en PDF: máximo 2 páginas y 10 MB, con amenaza, defensa, cómo se evaluó, resultados, límites y riesgo de uso dual',
  ],
}

export const CRITERIOS = {
  items: ['Impacto potencial e innovación', 'Calidad de ejecución', 'Presentación y claridad'],
  escala: 'Cada criterio de 1 a 5, con el mismo peso (máximo 15). Un 3 es trabajo sólido para un día; un 5 es excepcional.',
  desempate: 'En empate gana el proyecto con mayor puntaje en impacto.',
}

export const REGLAS: string[] = [
  'Se permiten asistentes de IA, citando todo el código, los datos y el contenido generado con ellos.',
  'Solo datos públicos anonimizados o sintéticos, sin voces, rostros ni correos de personas reales.',
  'Nada de atacar, escanear ni probar sistemas reales de terceros sin permiso escrito (Ley 1273 de 2009). Para eso están los benchmarks, los laboratorios y los datos sintéticos.',
  'Nada de publicar exploits funcionales ni malware. Una vulnerabilidad real se reporta en privado y queda fuera de la entrega.',
  'Un proyecto que sobre todo facilite ataques, sin mitigación, no puede ganar premio.',
]

export interface Track {
  numero: number
  nombre: string
  delEquipo?: boolean
  nota?: string
}

// El proyecto (inventario, normalización a CPE, cruce con fuentes de
// vulnerabilidades, alertas con evidencia y remediación) es ciberdefensa
// automatizada; la seguridad del agente que lo opera es el ángulo secundario.
export const TRACKS: Track[] = [
  { numero: 1, nombre: 'Seguridad de agentes', nota: 'Ángulo secundario del proyecto: el analista encerrado en lectura y la suite de inyección.' },
  { numero: 2, nombre: 'Control de IA' },
  { numero: 3, nombre: 'Ciberdefensa automatizada', delEquipo: true, nota: 'Del inventario a la alerta con evidencia y la remediación, para organizaciones sin equipo de seguridad.' },
  { numero: 4, nombre: 'Defensa epistémica' },
  { numero: 5, nombre: 'Infraestructura y gobernanza', nota: 'Sin código.' },
  { numero: 6, nombre: 'Riesgos multiagente' },
]

export const LOGISTICA: string[] = [
  'Llevar portátil y cargador, cédula original (la piden en la portería de Uniandes) y botella de agua.',
  'Los datos de registro en portería llegan por correo antes del evento.',
  'Snacks de desayuno limitados; el almuerzo está incluido.',
  'Los parqueaderos de la universidad cierran a las 6:00 p.m. y los pitches van hasta las 8:00 p.m.: mejor TransMilenio, estación Las Aguas.',
]

export const CONTACTOS = {
  personas: [
    { nombre: 'Jose Gelves', org: 'AI Safety Colombia' },
    { nombre: 'Daniel Diab', org: 'IEEE Computer Society Uniandes' },
  ],
  donde: 'En el salón ML 607',
  correo: 'equipo@aisafetycolombia.org',
}

// ── Cronograma ──────────────────────────────────────────────────────────────

export interface Bloque {
  /** Minutos desde la medianoche de Bogotá. */
  inicio: number
  /** Igual a `inicio` en los hitos puntuales. */
  fin: number
  texto: string
  aproximado?: boolean
  /** Hito duro del reglamento (cierre de entregas, registro del equipo). */
  duro?: boolean
}

const h = (hh: number, mm = 0) => hh * 60 + mm

/** Horario oficial de la guía. */
export const HORARIO_OFICIAL: Bloque[] = [
  { inicio: h(8), fin: h(8, 30), texto: 'Registro, entrada al campus y snacks' },
  { inicio: h(8, 30), fin: h(9), texto: 'Apertura, presentación del reto y formación de equipos' },
  { inicio: h(9), fin: h(17), texto: 'Sprint de 8 horas' },
  { inicio: h(11), fin: h(11), texto: 'Cierre del registro de equipos', duro: true },
  { inicio: h(12, 30), fin: h(12, 30), texto: 'Almuerzo', aproximado: true },
  { inicio: h(14), fin: h(14), texto: 'Se publica el orden de pitches' },
  { inicio: h(16), fin: h(16), texto: 'Entrega sugerida por la organización' },
  { inicio: h(17), fin: h(17), texto: 'Cierre de entregas, en punto', duro: true },
  { inicio: h(17, 10), fin: h(18, 40), texto: 'Pitches de 3 minutos (Auditorio ML C)' },
  { inicio: h(18, 40), fin: h(19, 15), texto: 'Deliberación del jurado' },
  { inicio: h(19, 15), fin: h(19, 30), texto: 'Premiación' },
  { inicio: h(19, 30), fin: h(20), texto: 'Cierre; salida a más tardar a las 8:00 p.m.' },
]

/** Plan interno del equipo, debajo del oficial. */
export const BLOQUES_EQUIPO: Bloque[] = [
  { inicio: h(9), fin: h(9, 30), texto: 'Contratos de datos, esquema, repositorio y archivo de créditos de IA' },
  { inicio: h(9, 30), fin: h(10, 30), texto: 'Despliegue vacío en Vercel con Turso, descarga de fuentes, primer inventario de prueba, buscar mentores' },
  { inicio: h(10, 30), fin: h(12, 30), texto: 'Construcción en paralelo' },
  { inicio: h(12, 30), fin: h(13), texto: 'Almuerzo por turnos', aproximado: true },
  { inicio: h(13), fin: h(13, 30), texto: 'Primera integración de punta a punta' },
  { inicio: h(13, 30), fin: h(14, 15), texto: 'Piezas de prioridad alta y correcciones' },
  { inicio: h(14, 15), fin: h(14, 15), texto: 'Congelar funciones', duro: true },
  { inicio: h(14, 15), fin: h(15), texto: 'Evals, suite de inyección, grabar el clip de la demo' },
  { inicio: h(15), fin: h(15, 45), texto: 'Ficha PDF, resumen, créditos, README, consolidar docs' },
  { inicio: h(15, 45), fin: h(16), texto: 'Revisar la entrega' },
  { inicio: h(16), fin: h(16), texto: 'Entregar', duro: true },
  { inicio: h(16), fin: h(17), texto: 'Ensayar el pitch tres veces con cronómetro' },
]

// ── Jurado y mentores ───────────────────────────────────────────────────────

export interface Fuente {
  texto: string
  url: string
}

export interface Perfil {
  nombre: string
  rol: 'Jurado' | 'Mentor'
  org: string
  resumen: string
  /** Trabajo público concreto (charlas, proyectos, libros), verificado en sus fuentes. */
  destacados?: string[]
  /** Inferencia a partir de su trabajo público, nunca una preferencia declarada. */
  valoraria?: string[]
  /** Solo mentores: para qué buscarlo durante el sprint. */
  util?: string
  fuentes?: Fuente[]
}

export const ETIQUETA_INFERENCIA = 'Inferencia a partir de su trabajo público, no una preferencia declarada'

// La guía oficial no publica los jurados: estos perfiles salen de su trabajo
// público, revisado el 14 nov 2026 en las fuentes que lista cada uno (solo
// páginas profesionales: perfiles de charlas, repositorios, publicaciones).
// Falta un tercer juez cuyo nombre no llegó completo; se agrega cuando se confirme.
export const PERFILES: Perfil[] = [
  {
    nombre: 'Christian Urcuqui',
    rol: 'Jurado',
    org: 'TryHackMe y Universidad Icesi',
    resumen: 'Investigador en la intersección de IA y ciberseguridad (CyberAI) y científico de datos de seguridad. Lleva más de diez años construyendo sistemas de machine learning para detección de amenazas y analítica de seguridad, entre industria, investigación y academia; es docente investigador del grupo i2t de la Universidad Icesi. Trabaja en seguridad de IA, machine learning adversarial y modelado de amenazas para sistemas con LLM y agentes, y ha presentado en DEF CON, Ekoparty, DragonJARCON, BSides y PyCon.',
    destacados: [
      'Coautor y coordinador de tres libros de ciberseguridad y ciencia de datos con la Universidad Icesi: "Ciberseguridad: un enfoque desde la ciencia de datos", "Ciberseguridad: los datos tienen la respuesta" (2022) y "Ciberseguridad: los datos, las semillas del caos" (2023).',
      '"Hackeando agentes": la superficie de ataque de los agentes con MCP, tool calling y RAG (secuestro de herramientas, envenenamiento de contexto, inyección persistente) y sus defensas: validación de salidas, control de ejecución de herramientas y aislamiento de contexto.',
      '"Hack, Test, Ship: DevSecOps for AI Security": un taller donde las pruebas de inyección, abuso de herramientas y fuga de información corren en el pipeline y bloquean un cambio cuando hay una regresión de seguridad.',
      'Orion, un framework que conecta el lado ofensivo y el defensivo sobre modelos de IA con MITRE ATLAS y agentes LLM, para convertir los ataques encontrados en defensas.',
      'Modelado de amenazas usado de forma ofensiva contra agentes, RAG y arquitecturas con tool calling, con MITRE ATLAS y el OWASP Top 10 para LLM como marcos.',
    ],
    valoraria: [
      'Que el equipo ataque su propio sistema y muestre qué encontró.',
      'Defensas concretas y nombradas: control de ejecución de herramientas, aislamiento de contexto y validación de salida.',
      'La suite de inyección como prueba repetible que se puede correr en CI, no como una demo de una sola vez.',
      'Un modelo de amenazas mapeado a un marco reconocido (MITRE ATLAS u OWASP Top 10 para LLM).',
    ],
    fuentes: [{ texto: 'Perfil y charlas en Sessionize', url: 'https://sessionize.com/christian-urcuqui' }],
  },
  {
    nombre: 'Antonio Badilla-Olivas',
    rol: 'Jurado',
    org: 'SPAR y CRSS',
    resumen: 'Ingeniero de IA y ML en CRSS y estudiante de maestría en Ciencias de la Computación en la Universidad de Costa Rica, donde fue profesor. Investiga seguridad, control e interpretabilidad de IA. El 8 de octubre de 2026 dio en AI Safety Colombia la charla "Control de IA cuando los agentes se encuentran".',
    destacados: [
      'Mentee del proyecto "In-the-Wild AI Control" de SPAR (otoño de 2026), que construye LOC-Arena: un laboratorio de IA ficticio donde los agentes pueden intentar un despliegue no autorizado, con subagentes, siete repositorios, monitores síncronos y asíncronos, y un verificador sellado que mide la brecha entre lo que se detecta y lo que de verdad ocurrió.',
      'En su charla: un modelo no confiable vigilado por un monitor de confianza y un auditor humano; un ataque es una cadena de pasos y basta atrapar un eslabón para frenarlo; los monitores pensados para un solo agente fallan ante muchos (demasiadas trayectorias, acciones fragmentadas bajo el umbral, permisos que se acumulan).',
      'Secret Hitler Sandbox, un entorno para estudiar capacidades de engaño en sistemas multiagente con LLM.',
      'The Refusal Axis, trabajo de interpretabilidad sobre la dirección de rechazo en Gemma 3 12B.',
    ],
    valoraria: [
      'Un monitor separado del sistema que vigila, en lugar de confiar en que el agente se porte bien.',
      'Medir contra una verdad conocida: cuánto detecta el sistema frente a lo que realmente pasó (el inventario de prueba con respuesta conocida va en esa línea).',
      'Medición frente a un atacante que se adapta, no solo frente a ataques fijos.',
      'Rigor: línea base, una definición clara de qué cuenta como éxito y en qué eslabón de la cadena se atrapa el ataque.',
    ],
    fuentes: [
      { texto: 'Charla para AI Safety Colombia (repositorio)', url: 'https://github.com/Antonio-Tresol/ai-control-and-mas-intro-talk' },
      { texto: 'Publicaciones en alphaXiv', url: 'https://www.alphaxiv.org/@antonio-badilla-olivas' },
    ],
  },
  {
    nombre: 'Pablo Pastrana',
    rol: 'Mentor',
    org: 'Dapper',
    resumen: 'Dapper es una regtech que monitorea cambios regulatorios con IA; su conector MCP está en el directorio de Claude.',
    util: 'Preguntarle por la fatiga de alertas y por cómo empaquetar un producto MCP.',
  },
  {
    nombre: 'Robert Gómez',
    rol: 'Mentor',
    org: 'AIMEDIC',
    resumen: 'AIMEDIC lleva IA generativa a clínicas.',
    util: 'Validar al comprador: organizaciones con datos sensibles y sin equipo de seguridad.',
  },
  {
    nombre: 'Jairo Torregrosa',
    rol: 'Mentor',
    org: 'Mercado Libre',
    resumen: 'Mentor del evento. La guía oficial solo publica su nombre y su empresa.',
  },
]

export const NOTA_MENTORES = 'Los mentores pasan por el salón durante el sprint, sin horario fijo.'

// ── Tablero del equipo: frentes y tareas precargadas ────────────────────────

export type Prioridad = 'Requisito' | 'Imprescindible' | 'Alto' | 'Si alcanza'
export const PRIORIDADES: Prioridad[] = ['Requisito', 'Imprescindible', 'Alto', 'Si alcanza']
/** Prioridades que disparan el aviso antes del congelamiento. */
export const PRIORIDADES_CRITICAS: Prioridad[] = ['Requisito', 'Imprescindible']

export interface GrupoSemilla {
  id: string
  nombre: string
  /** Los frentes entran al reparto; los grupos extra se asignan a mano. */
  tipo: 'frente' | 'extra'
}

export interface TareaSemilla {
  grupo: string
  numero?: number
  titulo: string
  prioridad: Prioridad
  horas: number
  /** Dato que llegó incompleto y falta confirmar con el equipo. */
  porConfirmar?: boolean
}

export const GRUPOS: GrupoSemilla[] = [
  { id: 'nucleo', nombre: 'Núcleo', tipo: 'frente' },
  { id: 'normalizador', nombre: 'Normalizador', tipo: 'frente' },
  { id: 'ingesta', nombre: 'Ingesta y agente', tipo: 'frente' },
  { id: 'seguridad', nombre: 'Seguridad y evals', tipo: 'frente' },
  { id: 'panel', nombre: 'Panel, demo y pitch', tipo: 'frente' },
  { id: 'entrega', nombre: 'Entrega', tipo: 'extra' },
  { id: 'dia', nombre: 'El día', tipo: 'extra' },
]

const DOC_POR_FRENTE = 0.3

// Núcleo suma 4.25 h en el plan, pero el detalle de sus tareas (la 1 y la 13)
// llegó cortado: van con el título que se alcanzó a leer, repartiendo esas
// horas, y marcadas "por confirmar" para corregirlas desde el tablero.
export const TAREAS: TareaSemilla[] = [
  { grupo: 'nucleo', numero: 1, titulo: 'Descarga de fuentes a Turso y cruce', prioridad: 'Imprescindible', horas: 2.5, porConfirmar: true },
  { grupo: 'nucleo', numero: 13, titulo: 'Tarea 13 del Núcleo (por definir)', prioridad: 'Alto', horas: 1.75, porConfirmar: true },
  { grupo: 'normalizador', numero: 3, titulo: 'Generador de inventario de prueba con respuesta conocida', prioridad: 'Requisito', horas: 1 },
  { grupo: 'normalizador', numero: 4, titulo: 'Normalizador de nombre a CPE medido', prioridad: 'Imprescindible', horas: 2.5 },
  { grupo: 'ingesta', numero: 7, titulo: 'Analista con Claude Agent SDK encerrado en lectura', prioridad: 'Imprescindible', horas: 1.5 },
  { grupo: 'ingesta', numero: 10, titulo: 'Servidor MCP empaquetado como plugin de Claude Code', prioridad: 'Alto', horas: 2.25 },
  { grupo: 'ingesta', numero: 15, titulo: 'Comunicado por audiencia con aprobación humana', prioridad: 'Si alcanza', horas: 1 },
  { grupo: 'seguridad', numero: 5, titulo: 'Suite de inyección con defensa y sin defensa', prioridad: 'Imprescindible', horas: 1.5 },
  { grupo: 'seguridad', numero: 6, titulo: 'Verificador determinista del comunicado', prioridad: 'Imprescindible', horas: 1 },
  { grupo: 'seguridad', numero: 8, titulo: 'Página de límites y riesgo dual', prioridad: 'Imprescindible', horas: 0.5 },
  { grupo: 'seguridad', numero: 12, titulo: 'Repositorio abierto con prompts, casos y trazas', prioridad: 'Alto', horas: 0.25 },
  { grupo: 'panel', numero: 2, titulo: 'Despliegue en Vercel, Turso y worker', prioridad: 'Requisito', horas: 1 },
  { grupo: 'panel', numero: 9, titulo: 'Evidencia por alerta y cobertura faltante', prioridad: 'Alto', horas: 0.5 },
  { grupo: 'panel', numero: 11, titulo: 'Barrido de umbrales en una gráfica', prioridad: 'Alto', horas: 0.5 },
  { grupo: 'panel', numero: 14, titulo: 'Remediación accionable', prioridad: 'Si alcanza', horas: 1 },
  // 16. Documentación del proyecto: 1.5 h repartidas, una subtarea por frente.
  ...['nucleo', 'normalizador', 'ingesta', 'seguridad', 'panel'].map((grupo): TareaSemilla => ({
    grupo,
    numero: 16,
    titulo: 'Documentación del proyecto (parte del frente)',
    prioridad: 'Alto',
    horas: DOC_POR_FRENTE,
  })),
  { grupo: 'entrega', titulo: 'Resumen de 150 a 250 palabras', prioridad: 'Requisito', horas: 0.25 },
  { grupo: 'entrega', titulo: 'Ficha técnica en PDF (2 páginas, 10 MB)', prioridad: 'Requisito', horas: 0.5 },
  { grupo: 'entrega', titulo: 'Archivo de créditos de IA', prioridad: 'Requisito', horas: 0.25 },
  { grupo: 'entrega', titulo: 'README', prioridad: 'Imprescindible', horas: 0.25 },
  { grupo: 'entrega', titulo: 'Revisar la entrega', prioridad: 'Requisito', horas: 0.25 },
  { grupo: 'entrega', titulo: 'Enviar antes de las 4:00 p.m.', prioridad: 'Requisito', horas: 0.1 },
  { grupo: 'entrega', titulo: 'Ensayar el pitch tres veces con cronómetro', prioridad: 'Imprescindible', horas: 1 },
  { grupo: 'dia', titulo: 'Registrar el equipo antes de las 11:00 a.m. (nombre, integrantes y track)', prioridad: 'Requisito', horas: 0.1 },
  { grupo: 'dia', titulo: 'Cédula original', prioridad: 'Requisito', horas: 0 },
  { grupo: 'dia', titulo: 'Portátil y cargador', prioridad: 'Requisito', horas: 0 },
  { grupo: 'dia', titulo: 'Teléfono con datos', prioridad: 'Alto', horas: 0 },
  { grupo: 'dia', titulo: 'Grabador de pantalla probado', prioridad: 'Alto', horas: 0 },
  { grupo: 'dia', titulo: 'Botella de agua', prioridad: 'Si alcanza', horas: 0 },
]
