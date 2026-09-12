// Resumen de costos de la infraestructura básica propia: Vercel, Turso y Claude.
//
// Módulo PURO e isomorfo (sin BD, sin node:crypto, sin fetch): lo renderiza el
// servidor en /admin/infra y lo vuelve a ejecutar el navegador cada vez que se
// mueve un control del simulador. Una sola aritmética para los dos lados, por
// la misma razón que `computo/calculo.ts`: si el simulador tuviera la suya,
// el número que se mira en pantalla y el que se presupuesta no coincidirían.
//
// Diferencia con /admin/costs: esa página inventaria lo que YA se paga (filas
// reales de `project_services`). Esta responde a otra pregunta - cuánto pasaría
// a costar este stack si el tráfico o el uso crecieran, y en qué dimensión se
// rompe primero cada plan gratuito.

import { TARIFAS_INICIALES } from './computo/tarifas'

/** Una dimensión facturable de un proveedor (lo que se mide y en qué unidad). */
export interface DimensionInfra {
  id: string
  etiqueta: string
  /** Unidad en la que se expresan cuota, uso y precio unitario. */
  unidad: string
  /** Decimales con los que se muestra la cantidad (no el dinero). */
  decimales?: number
}

export interface PlanInfra {
  id: string
  nombre: string
  /** Cargo fijo mensual en USD. */
  baseUsd: number
  /** Cuota incluida por dimensión, en la unidad de la dimensión. */
  incluido: Record<string, number>
  /**
   * Precio por unidad pasada la cuota. `null` significa que el plan NO admite
   * excedente facturable: al pasarse, el proveedor limita o corta. Es el caso
   * de los planes gratuitos, y la distinción importa más que el precio - un
   * excedente cuesta dinero, un tope duro tumba el sitio.
   */
  excedente: Record<string, number | null>
  nota?: string
}

export interface ProveedorInfra {
  id: string
  nombre: string
  url: string
  dimensiones: DimensionInfra[]
  planes: PlanInfra[]
  /**
   * Fecha en que se contrastaron estos números contra la página de precios, en
   * ISO YYYY-MM-DD. Va a la vista a propósito: sin fecha nadie sabe si la cifra
   * sigue siendo buena, y un simulador desactualizado miente con confianza.
   */
  verificado: string
  fuente: string
}

// ---------------------------------------------------------------------------
// Catálogo
//
// Son un PUNTO DE PARTIDA, no una fuente de verdad: los tres proveedores
// cambian precios y cuotas sin avisar. Antes de tomar una decisión de plata con
// esta página hay que abrir la URL de cada proveedor y corregir la fila. Las
// tarifas de excedente de Vercel salen de `computo/tarifas.ts` y no se copian
// aquí, para que facturarle el cómputo a un cliente y simular el propio gasto
// no puedan divergir.
// ---------------------------------------------------------------------------

export const VERCEL: ProveedorInfra = {
  id: 'vercel',
  nombre: 'Vercel',
  url: 'https://vercel.com/docs/pricing',
  verificado: '2026-09-12',
  fuente: 'Tarifas de excedente compartidas con computo/tarifas.ts (TARIFAS_INICIALES).',
  dimensiones: [
    { id: 'cpuActiva', etiqueta: 'CPU activa', unidad: 'h/mes', decimales: 1 },
    { id: 'memoria', etiqueta: 'Memoria aprovisionada', unidad: 'GB-h/mes' },
    { id: 'invocaciones', etiqueta: 'Invocaciones', unidad: 'M/mes', decimales: 2 },
    { id: 'transferencia', etiqueta: 'Transferencia', unidad: 'GB/mes' },
    { id: 'edgeRequests', etiqueta: 'Peticiones al edge', unidad: 'M/mes', decimales: 2 },
  ],
  planes: [
    {
      id: 'hobby',
      nombre: 'Hobby',
      baseUsd: 0,
      incluido: { cpuActiva: 4, memoria: 360, invocaciones: 1, transferencia: 100, edgeRequests: 1 },
      // Todo null: el Hobby no factura excedente, lo corta. Pasarse aquí no es
      // una factura sorpresa, es el sitio caído hasta el mes siguiente.
      excedente: { cpuActiva: null, memoria: null, invocaciones: null, transferencia: null, edgeRequests: null },
      nota: 'Sin excedente facturable: al agotar una cuota el proyecto se limita, no se cobra de más. Tampoco permite uso comercial.',
    },
    {
      id: 'pro',
      nombre: 'Pro',
      baseUsd: 20,
      incluido: { cpuActiva: 4, memoria: 360, invocaciones: 1, transferencia: 1000, edgeRequests: 10 },
      excedente: {
        cpuActiva: TARIFAS_INICIALES.cpuActivaHora,
        memoria: TARIFAS_INICIALES.memoriaGbHora,
        invocaciones: TARIFAS_INICIALES.invocacionesMillon,
        transferencia: TARIFAS_INICIALES.transferenciaGb,
        edgeRequests: TARIFAS_INICIALES.edgeRequestsMillon,
      },
      nota: 'Precio por miembro del equipo. Es el plan mínimo para cobrarle a un cliente.',
    },
  ],
}

export const TURSO: ProveedorInfra = {
  id: 'turso',
  nombre: 'Turso',
  url: 'https://turso.tech/pricing',
  verificado: '2026-09-12',
  fuente: 'Página de precios de Turso. La dimensión que manda aquí son las filas LEÍDAS (escaneadas, no devueltas).',
  dimensiones: [
    { id: 'filasLeidas', etiqueta: 'Filas leídas', unidad: 'M/mes' },
    { id: 'filasEscritas', etiqueta: 'Filas escritas', unidad: 'M/mes', decimales: 1 },
    { id: 'almacenamiento', etiqueta: 'Almacenamiento', unidad: 'GB' },
  ],
  planes: [
    {
      id: 'free',
      nombre: 'Free',
      baseUsd: 0,
      incluido: { filasLeidas: 1000, filasEscritas: 25, almacenamiento: 9 },
      excedente: { filasLeidas: null, filasEscritas: null, almacenamiento: null },
      nota: 'La cuota es por organización, no por base: la principal y la de la demo comparten el mismo billón de filas leídas.',
    },
    {
      id: 'scaler',
      nombre: 'Scaler',
      baseUsd: 29,
      incluido: { filasLeidas: 100_000, filasEscritas: 100, almacenamiento: 24 },
      excedente: { filasLeidas: 1 / 1000, filasEscritas: 1 / 10, almacenamiento: 0.75 },
    },
  ],
}

export const CLAUDE: ProveedorInfra = {
  id: 'claude',
  nombre: 'Claude',
  url: 'https://claude.com/pricing',
  verificado: '2026-09-12',
  fuente: 'Precios de API por millón de tokens de la referencia oficial de modelos; suscripciones desde la página de planes.',
  dimensiones: [
    { id: 'entrada', etiqueta: 'Tokens de entrada', unidad: 'MTok/mes', decimales: 1 },
    { id: 'salida', etiqueta: 'Tokens de salida', unidad: 'MTok/mes', decimales: 1 },
  ],
  planes: [
    {
      id: 'pro',
      nombre: 'Suscripción Pro',
      baseUsd: 20,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: null, salida: null },
      nota: 'Tarifa plana con límites de uso por ventana. No da acceso de API: un script que llame a la API paga aparte.',
    },
    {
      id: 'max5',
      nombre: 'Suscripción Max 5x',
      baseUsd: 100,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: null, salida: null },
      nota: 'Mismos límites del Pro multiplicados por 5. Sigue sin ser API.',
    },
    {
      id: 'api-opus-5',
      nombre: 'API · Opus 5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 5, salida: 25 },
      nota: 'Sin cargo fijo: se paga solo lo que se consume. El caché de prompt recorta la entrada hasta ~10% de la tarifa.',
    },
    {
      id: 'api-sonnet-5',
      nombre: 'API · Sonnet 5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 2, salida: 10 },
    },
    {
      id: 'api-haiku-45',
      nombre: 'API · Haiku 4.5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 1, salida: 5 },
    },
  ],
}

export const PROVEEDORES: ProveedorInfra[] = [VERCEL, TURSO, CLAUDE]

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export interface LineaInfra {
  dimension: string
  etiqueta: string
  unidad: string
  decimales: number
  uso: number
  incluido: number
  /** Unidades por encima de la cuota (0 si no se pasó). */
  exceso: number
  /** Precio por unidad del excedente, o null si el plan no admite excedente. */
  precioUnitario: number | null
  costoUsd: number
  /** Se pasó de la cuota y el plan NO cobra excedente: el proveedor limita. */
  topeDuro: boolean
  /** Porcentaje de la cuota consumido (0-100+). null si la cuota es cero. */
  consumoPct: number | null
}

export interface ResumenProveedor {
  proveedorId: string
  nombre: string
  planId: string
  planNombre: string
  baseUsd: number
  excedentesUsd: number
  totalUsd: number
  lineas: LineaInfra[]
  /** Dimensiones donde el plan se rompe (tope duro alcanzado). */
  topesDuros: string[]
}

export interface ResumenStack {
  proveedores: ResumenProveedor[]
  totalMensualUsd: number
  totalAnualUsd: number
  /** Cuántas dimensiones, en todo el stack, chocan contra un tope duro. */
  topesDuros: number
}

export type UsoProveedor = Record<string, number>
export type UsoStack = Record<string, UsoProveedor>
export type SeleccionPlanes = Record<string, string>

/** Busca un plan por id; cae al primero si el id no existe (nunca devuelve null). */
export function planDe(proveedor: ProveedorInfra, planId: string | undefined): PlanInfra {
  return proveedor.planes.find((p) => p.id === planId) ?? proveedor.planes[0]
}

export function calcularProveedor(
  proveedor: ProveedorInfra,
  planId: string | undefined,
  uso: UsoProveedor = {},
): ResumenProveedor {
  const plan = planDe(proveedor, planId)
  const lineas: LineaInfra[] = proveedor.dimensiones.map((d) => {
    const cantidad = Math.max(0, uso[d.id] ?? 0)
    const incluido = plan.incluido[d.id] ?? 0
    const exceso = Math.max(0, cantidad - incluido)
    const precioUnitario = plan.excedente[d.id] ?? null
    return {
      dimension: d.id,
      etiqueta: d.etiqueta,
      unidad: d.unidad,
      decimales: d.decimales ?? 0,
      uso: cantidad,
      incluido,
      exceso,
      precioUnitario,
      costoUsd: precioUnitario == null ? 0 : exceso * precioUnitario,
      topeDuro: exceso > 0 && precioUnitario == null,
      consumoPct: incluido > 0 ? (cantidad / incluido) * 100 : null,
    }
  })
  const excedentesUsd = lineas.reduce((s, l) => s + l.costoUsd, 0)
  return {
    proveedorId: proveedor.id,
    nombre: proveedor.nombre,
    planId: plan.id,
    planNombre: plan.nombre,
    baseUsd: plan.baseUsd,
    excedentesUsd,
    totalUsd: plan.baseUsd + excedentesUsd,
    lineas,
    topesDuros: lineas.filter((l) => l.topeDuro).map((l) => l.etiqueta),
  }
}

export function calcularStack(
  seleccion: SeleccionPlanes,
  uso: UsoStack,
  proveedores: ProveedorInfra[] = PROVEEDORES,
): ResumenStack {
  const resumenes = proveedores.map((p) => calcularProveedor(p, seleccion[p.id], uso[p.id] ?? {}))
  const totalMensualUsd = resumenes.reduce((s, r) => s + r.totalUsd, 0)
  return {
    proveedores: resumenes,
    totalMensualUsd,
    totalAnualUsd: totalMensualUsd * 12,
    topesDuros: resumenes.reduce((s, r) => s + r.topesDuros.length, 0),
  }
}

/**
 * Plan más barato de un proveedor que aguante el uso dado SIN chocar con un
 * tope duro. Lo que se busca no es el precio mínimo sino el mínimo viable: un
 * plan gratuito que se queda corto no cuesta 0, cuesta una caída.
 */
export function planRecomendado(proveedor: ProveedorInfra, uso: UsoProveedor): ResumenProveedor {
  const viables = proveedor.planes
    .map((p) => calcularProveedor(proveedor, p.id, uso))
    .filter((r) => r.topesDuros.length === 0)
  const candidatos = viables.length > 0
    ? viables
    : proveedor.planes.map((p) => calcularProveedor(proveedor, p.id, uso))
  return candidatos.reduce((mejor, r) => (r.totalUsd < mejor.totalUsd ? r : mejor))
}

// ---------------------------------------------------------------------------
// Escenarios
//
// Tres puntos de una curva, no predicciones. El de arranque es el orden de
// magnitud de un sitio personal con monitoreo propio; los otros dos multiplican
// el tráfico para ver DÓNDE se rompe el gratis, que es la pregunta que de
// verdad importa al presupuestar.
// ---------------------------------------------------------------------------

export interface Escenario {
  id: string
  nombre: string
  descripcion: string
  uso: UsoStack
}

export const ESCENARIOS: Escenario[] = [
  {
    id: 'arranque',
    nombre: 'Arranque',
    descripcion: 'El portafolio solo: tráfico bajo, crons cada 5 minutos y la demo pública.',
    uso: {
      vercel: { cpuActiva: 1.5, memoria: 120, invocaciones: 0.3, transferencia: 15, edgeRequests: 0.5 },
      turso: { filasLeidas: 300, filasEscritas: 3, almacenamiento: 1 },
      claude: { entrada: 0, salida: 0 },
    },
  },
  {
    id: 'clientes',
    nombre: 'Con clientes',
    descripcion: 'Portafolio + portal activo + tres sitios de cliente sobre la misma cuenta.',
    uso: {
      vercel: { cpuActiva: 8, memoria: 900, invocaciones: 2.5, transferencia: 220, edgeRequests: 6 },
      turso: { filasLeidas: 1800, filasEscritas: 30, almacenamiento: 5 },
      claude: { entrada: 40, salida: 6 },
    },
  },
  {
    id: 'pico',
    nombre: 'Pico',
    descripcion: 'Una campaña o una prueba de carga sin el CDN por delante: el mes malo.',
    uso: {
      vercel: { cpuActiva: 35, memoria: 4000, invocaciones: 12, transferencia: 1400, edgeRequests: 30 },
      turso: { filasLeidas: 12_000, filasEscritas: 120, almacenamiento: 12 },
      claude: { entrada: 200, salida: 30 },
    },
  },
]

/** Planes con los que arranca la vista: lo que se paga hoy (todo gratis salvo la suscripción). */
export const SELECCION_INICIAL: SeleccionPlanes = {
  vercel: 'hobby',
  turso: 'free',
  claude: 'pro',
}

export function escenarioPorId(id: string | null | undefined): Escenario {
  return ESCENARIOS.find((e) => e.id === id) ?? ESCENARIOS[0]
}
