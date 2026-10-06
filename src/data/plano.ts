// Datos de Plano, el cotizador a la medida (docs/plan-plano.md).
//
// Tres cosas viven aquí: las reglas de pago por defecto (aprobadas por Mike el
// 6 oct 2026 y editables desde /admin/plano/ajustes), los hitos a los que se
// atan los pagos, y las preguntas que cierran el rango de horas de cada
// componente. Los precios NO: esos siguen saliendo de src/data/tarifario.ts.
//
// Módulo PURO e isomorfo: lo importa el constructor en el navegador.

import type { Monto } from './tarifario'

// ── Hitos ───────────────────────────────────────────────────────────────────

export type HitoId = 'firma' | 'diseno' | 'hito1' | 'hito2' | 'publicacion'

export type Hito = {
  id: HitoId
  nombre: string
  /** Qué se entrega, dicho para el cliente. */
  entregable: string
  /** Fracción de las horas del proyecto en que se alcanza (0 = al firmar). */
  avance: number
}

export const HITOS: Record<HitoId, Hito> = {
  firma: { id: 'firma', nombre: 'Firma', entregable: 'Propuesta aceptada', avance: 0 },
  diseno: { id: 'diseno', nombre: 'Diseño aprobado', entregable: 'Diseño de las pantallas principales aprobado por ti', avance: 0.25 },
  hito1: { id: 'hito1', nombre: 'Primera entrega', entregable: 'Primera parte funcionando en un enlace de prueba', avance: 0.4 },
  hito2: { id: 'hito2', nombre: 'Segunda entrega', entregable: 'Todo lo acordado funcionando en el enlace de prueba', avance: 0.75 },
  publicacion: { id: 'publicacion', nombre: 'Publicación', entregable: 'Proyecto publicado en tu dominio y equipo capacitado', avance: 1 },
}

// ── Reglas de pago ──────────────────────────────────────────────────────────

export type PagoTramo = { hito: HitoId; pct: number }

export type Tramo = {
  /** Monto hasta el que aplica (inclusive). null = sin techo (el último tramo). */
  hasta: Monto | null
  pagos: PagoTramo[]
}

export type ReglasCuotas = {
  activas: boolean
  /** Recargo mensual sobre el saldo, en porcentaje (1.5 = 1,5 %). */
  recargoMensualPct: number
  maxCuotas: number
  /** Monto desde el que se ofrecen (estrictamente mayor). */
  minimo: Monto
  /** Parte que se paga al firmar; el saldo se financia. */
  anticipoPct: number
}

export type ReglasPlano = {
  tramos: Tramo[]
  cuotas: ReglasCuotas
  /**
   * Tasa de usura vigente, efectiva anual en porcentaje. La publica la
   * Superfinanciera cada mes y Mike la escribe a mano: null = sin dato, y el
   * recargo se muestra como "sin verificar" en vez de darse por bueno.
   */
  usuraEAPct: number | null
  /** Descuento por pago de contado, en porcentaje. Solo lo decide Mike (0 = no se ofrece). */
  descuentoContadoPct: number
  /** Días hábiles entre el hito y el vencimiento de su pago. */
  diasHabilesVencimiento: number
  /** Si el cliente es persona, el vencimiento se corre a la quincena siguiente. */
  quincenaPersonas: boolean
  /** Horas a la semana que Mike le puede dedicar a un proyecto. Da las fechas de los hitos. */
  horasSemana: number
  /** Horas a la semana que Mike puede trabajar en total (para la carga semanal). */
  capacidadSemana: number
}

export const REGLAS_DEFAULT: ReglasPlano = {
  tramos: [
    {
      hasta: { COP: 1_500_000, USD: 500 },
      pagos: [
        { hito: 'firma', pct: 50 },
        { hito: 'publicacion', pct: 50 },
      ],
    },
    {
      hasta: { COP: 5_000_000, USD: 1_700 },
      pagos: [
        { hito: 'firma', pct: 40 },
        { hito: 'diseno', pct: 30 },
        { hito: 'publicacion', pct: 30 },
      ],
    },
    {
      hasta: null,
      pagos: [
        { hito: 'firma', pct: 30 },
        { hito: 'hito1', pct: 25 },
        { hito: 'hito2', pct: 25 },
        { hito: 'publicacion', pct: 20 },
      ],
    },
  ],
  cuotas: {
    activas: true,
    recargoMensualPct: 1.5,
    maxCuotas: 4,
    minimo: { COP: 3_000_000, USD: 1_000 },
    anticipoPct: 40,
  },
  usuraEAPct: null,
  descuentoContadoPct: 0,
  diasHabilesVencimiento: 5,
  quincenaPersonas: true,
  horasSemana: 25,
  capacidadSemana: 40,
}

/** Clave de app_settings donde viven las reglas editadas. */
export const CLAVE_REGLAS = 'plano_reglas'

// ── Preguntas que cierran el rango ──────────────────────────────────────────
//
// Cada opción elige una FRANJA dentro del rango de horas aprobado del
// componente ([0, 1] = el rango entero). Las franjas se solapan a propósito:
// una respuesta reduce la incertidumbre, no la elimina.

export type OpcionPregunta = { texto: string; franja: readonly [number, number] }
export type Pregunta = { id: string; texto: string; opciones: OpcionPregunta[] }

const bajo = (texto: string, hasta = 0.35): OpcionPregunta => ({ texto, franja: [0, hasta] })
const medio = (texto: string, desde = 0.3, hasta = 0.7): OpcionPregunta => ({ texto, franja: [desde, hasta] })
const alto = (texto: string, desde = 0.65): OpcionPregunta => ({ texto, franja: [desde, 1] })

export const PREGUNTAS: Record<string, Pregunta[]> = {
  descubrimiento: [
    {
      id: 'claridad',
      texto: '¿Qué tan claro tiene el cliente lo que quiere?',
      opciones: [bajo('Lo tiene escrito'), medio('Más o menos'), alto('Hay que descubrirlo juntos')],
    },
  ],
  usuarios: [
    {
      id: 'roles',
      texto: '¿Cuántos tipos de usuario hay?',
      opciones: [bajo('Solo el administrador', 0.3), medio('Dos roles', 0.3, 0.65), alto('Tres o más, con permisos finos', 0.6)],
    },
    {
      id: 'ingreso',
      texto: '¿Cómo entran?',
      opciones: [bajo('Correo y contraseña', 0.6), alto('Correo y también Google', 0.4)],
    },
  ],
  panel: [
    {
      id: 'complejidad',
      texto: '¿Cómo es cada tipo de dato?',
      opciones: [bajo('Lista y formulario', 0.4), medio('Con fotos, filtros o estados', 0.35, 0.75), alto('Con flujos de aprobación', 0.7)],
    },
  ],
  pagos: [
    {
      id: 'medios',
      texto: '¿Cómo se cobra?',
      opciones: [bajo('Un pago por enlace'), medio('Checkout con PSE y tarjeta'), alto('Suscripciones o pagos recurrentes')],
    },
  ],
  reservas: [
    {
      id: 'recursos',
      texto: '¿Qué se agenda?',
      opciones: [bajo('Una sola persona o recurso'), medio('Varios, con horarios propios'), alto('Varios, con sedes o servicios combinados')],
    },
    {
      id: 'recordatorios',
      texto: '¿Lleva recordatorios?',
      opciones: [bajo('No', 0.5), alto('Sí, por correo o WhatsApp', 0.5)],
    },
  ],
  tienda: [
    {
      id: 'catalogo',
      texto: '¿De qué tamaño es el catálogo?',
      opciones: [bajo('Menos de 50 productos', 0.4), medio('Entre 50 y 500'), alto('Más de 500 o con variantes (talla, color)', 0.6)],
    },
    {
      id: 'inventario',
      texto: '¿Controla existencias?',
      opciones: [bajo('No', 0.5), alto('Sí, con inventario', 0.5)],
    },
  ],
  integracion: [
    {
      id: 'api',
      texto: '¿El otro sistema tiene API?',
      opciones: [bajo('Sí, moderna y documentada', 0.4), medio('Sí, pero vieja o a medias', 0.35, 0.75), alto('No, hay que ingeniárselas', 0.7)],
    },
  ],
  facturacion: [
    {
      id: 'proveedor',
      texto: '¿Ya tiene proveedor de facturación (Siigo, Alegra...)?',
      opciones: [bajo('Sí, con API', 0.45), medio('Sí, pero sin API', 0.4, 0.8), alto('No, hay que elegirlo', 0.5)],
    },
  ],
  reportes: [
    {
      id: 'detalle',
      texto: '¿Qué tan elaborados son?',
      opciones: [bajo('Unas cifras y una tabla'), medio('Gráficas con filtros por fecha'), alto('Exportar a Excel y tableros por rol')],
    },
  ],
  pwa: [
    {
      id: 'offline',
      texto: '¿Tiene que funcionar sin internet?',
      opciones: [bajo('No hace falta', 0.4), alto('Lo básico, sin conexión', 0.4)],
    },
    {
      id: 'avisos',
      texto: '¿Manda notificaciones?',
      opciones: [bajo('No', 0.5), alto('Sí', 0.5)],
    },
  ],
  'app-nativa': [
    {
      id: 'diferencia',
      texto: '¿Qué tan distinta es de la web?',
      opciones: [bajo('La misma experiencia', 0.4), medio('Usa cámara, ubicación u otras funciones del celular', 0.35, 0.75), alto('Experiencia aparte, con diseño propio', 0.7)],
    },
  ],
  migracion: [
    {
      id: 'origen',
      texto: '¿De dónde vienen los datos?',
      opciones: [bajo('Una hoja de cálculo ordenada'), medio('Otro sistema que exporta'), alto('Datos sucios o de varias fuentes')],
    },
  ],
  entrega: [
    {
      id: 'equipo',
      texto: '¿A cuántas personas hay que enseñar?',
      opciones: [bajo('A una', 0.4), medio('A un equipo pequeño', 0.35, 0.75), alto('A varias áreas', 0.7)],
    },
  ],
}

/** Componentes que van en toda propuesta de software: sin ellos no hay proyecto. */
export const SIEMPRE_ESENCIALES = ['descubrimiento', 'entrega'] as const
