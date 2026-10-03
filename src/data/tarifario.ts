// Tarifario: la única fuente de precios de la oferta (docs/plan-asistente.md).
//
// Lo leen /paginas-web (los "desde" de cada plan) y el cotizador del asistente
// (lib/asistente/calculo-cotizacion.ts). Si el precio viviera en dos sitios,
// la web y el agente terminarían diciéndole cosas distintas al mismo cliente.
//
// Todas las cifras las fijó Mike el 1 oct 2026. Ninguna sale de un modelo ni
// de una conversión: COP y USD son tarifas independientes (el visitante de
// fuera no es local a Colombia y no paga en pesos convertidos).
//
// Módulo PURO e isomorfo: sin BD ni efectos, se puede importar en el navegador.

export type Moneda = 'COP' | 'USD'
export type Monto = Record<Moneda, number>

/** Tarifa por hora de trabajo. */
export const TARIFA_HORA: Monto = { COP: 70_000, USD: 30 }

export type PaqueteWeb = {
  id: 'presencia' | 'negocio' | 'a-medida'
  nombre: string
  desde: Monto
}

/**
 * Planes de /paginas-web, en el mismo orden que el diccionario (`pw.planes`).
 * "A medida" es lo que docs/plan-oferta-principal.md llama Operación: tienda o
 * reservas, pagos en línea, panel y monitoreo. Su piso queda por debajo de la
 * suma mínima de COMPONENTES (69 h, unos $4.8M) a propósito: es lo que se
 * anuncia, y cada proyecto real se cotiza con la tabla.
 */
export const PAQUETES_WEB: readonly PaqueteWeb[] = [
  { id: 'presencia', nombre: 'Presencia', desde: { COP: 650_000, USD: 250 } },
  { id: 'negocio', nombre: 'Negocio', desde: { COP: 1_500_000, USD: 500 } },
  { id: 'a-medida', nombre: 'A medida', desde: { COP: 4_500_000, USD: 1_500 } },
]

export type Componente = {
  id: string
  nombre: string
  /** Rango de horas [mínimo, máximo] de una unidad. */
  horas: readonly [number, number]
  /** Si se cobra por unidad, qué cuenta como una (p. ej. cada tipo de dato). */
  unidad?: string
}

/** Software a la medida: horas por componente, aprobadas el 1 oct 2026. */
export const COMPONENTES: readonly Componente[] = [
  { id: 'descubrimiento', nombre: 'Descubrimiento y alcance', horas: [4, 8] },
  { id: 'usuarios', nombre: 'Usuarios y permisos', horas: [8, 16] },
  { id: 'panel', nombre: 'Panel de administración', horas: [6, 12], unidad: 'tipo de dato administrado (productos, citas, clientes...)' },
  { id: 'pagos', nombre: 'Pagos en línea (Wompi)', horas: [12, 20] },
  { id: 'reservas', nombre: 'Reservas y agenda', horas: [20, 35] },
  { id: 'tienda', nombre: 'Tienda y catálogo', horas: [20, 35] },
  { id: 'integracion', nombre: 'Conexión con otro sistema', horas: [10, 25], unidad: 'sistema conectado' },
  { id: 'facturacion', nombre: 'Facturación electrónica', horas: [16, 30] },
  { id: 'reportes', nombre: 'Reportes y tableros', horas: [8, 20] },
  { id: 'pwa', nombre: 'App instalable desde la web', horas: [8, 16] },
  { id: 'app-nativa', nombre: 'App en las tiendas de Apple y Google', horas: [80, 160] },
  { id: 'migracion', nombre: 'Pasar datos de otro sistema', horas: [6, 20] },
  { id: 'entrega', nombre: 'Publicar, vigilar y enseñar a usarlo', horas: [6, 10] },
]

/**
 * Capacitación en IA. Solo en pesos: es para empresas en Colombia, y la
 * página en inglés también la muestra en COP (decisión de Mike).
 *
 * La nota de precio que se ve en /capacitacion-ia vive en `training_programs`
 * (la edita el panel); estas cifras son las que usa el cotizador para calcular.
 */
export const CAPACITACION = {
  horas: 8,
  cupo: 20,
  sesionCOP: 1_000_000,
  personaAdicionalCOP: 40_000,
} as const

/**
 * Lo que trae cada página web después del precio (decisiones de Mike, 2 oct
 * 2026). Se publica en las preguntas frecuentes de /paginas-web y lo dice el
 * asesor de la burbuja; tests/asistente-cotizacion.test.ts comprueba que el
 * texto de la página diga estas mismas cifras.
 */
export const ENTREGA = {
  /** Rondas de cambios incluidas antes de publicar. Las demás, por hora. */
  rondasCambios: 2,
  /** Días después de publicar en que se arreglan errores sin costo (solo errores). */
  garantiaDias: 30,
} as const

/**
 * Dominio y hosting por año, DESDE EL SEGUNDO: el primero va incluido en el
 * precio de la página. "A medida" no tiene cifra fija: depende del uso
 * (usuarios, archivos guardados, redundancia) y lo cotiza Mike.
 */
export const HOSTING_ANUAL: Record<'presencia' | 'negocio', Monto> = {
  presencia: { COP: 250_000, USD: 100 },
  negocio: { COP: 400_000, USD: 150 },
}

/** Reglas comerciales (1 oct 2026). */
export const REGLAS = {
  /** Margen de seguridad sobre las horas de software a la medida. */
  colchon: 0.2,
  /** Lo mínimo por cualquier trabajo a la medida: el precio de Presencia. */
  minimo: { COP: 650_000, USD: 250 } as Monto,
  /** Parte que se paga antes de empezar; el resto, al entregar. */
  anticipo: 0.5,
  validezDias: 15,
  /** Los precios se redondean HACIA ARRIBA a este múltiplo. */
  redondeo: { COP: 50_000, USD: 50 } as Monto,
} as const

const FORMATO: Record<Moneda, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
}

/** "$650.000 COP" o "$250 USD". */
export function formatearMonto(valor: number, moneda: Moneda): string {
  return `$${FORMATO[moneda].format(valor)} ${moneda}`
}

/** Etiqueta "desde" de un plan web en el idioma de la página: COP en español, USD en inglés. */
export function etiquetaDesde(paquete: PaqueteWeb, locale: 'es' | 'en'): string {
  return locale === 'es'
    ? `desde ${formatearMonto(paquete.desde.COP, 'COP')}`
    : `from ${formatearMonto(paquete.desde.USD, 'USD')}`
}
