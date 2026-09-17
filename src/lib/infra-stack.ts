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
  /**
   * Crédito de uso en dólares que el plan regala cada mes, aplicado sobre el
   * consumo total en vez de sobre una dimensión concreta. Es la forma del plan
   * Pro de Vercel: no incluye 4 horas de CPU ni 100 GB de nada, incluye 20
   * dólares que se van gastando en lo que se consuma.
   */
  creditoUsd?: number
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
  url: 'https://vercel.com/pricing',
  verificado: '2026-09-17',
  fuente: 'vercel.com/pricing y vercel.com/docs/pricing (actualizada el 3 sep 2026). Las tarifas bajo demanda son las de computo/tarifas.ts, las mismas con las que se le factura a un cliente, y coinciden con el "starting at" de la página: varían por región.',
  dimensiones: [
    { id: 'cpuActiva', etiqueta: 'CPU activa', unidad: 'h/mes', decimales: 1 },
    { id: 'memoria', etiqueta: 'Memoria aprovisionada', unidad: 'GB-h/mes' },
    { id: 'invocaciones', etiqueta: 'Invocaciones', unidad: 'M/mes', decimales: 2 },
    { id: 'transferencia', etiqueta: 'Transferencia al visitante', unidad: 'GB/mes' },
    { id: 'transferenciaOrigen', etiqueta: 'Transferencia función-edge', unidad: 'GB/mes' },
    { id: 'edgeRequests', etiqueta: 'Peticiones al edge', unidad: 'M/mes', decimales: 2 },
  ],
  planes: [
    {
      id: 'hobby',
      nombre: 'Hobby',
      baseUsd: 0,
      incluido: {
        cpuActiva: 4, memoria: 360, invocaciones: 1,
        transferencia: 100, transferenciaOrigen: 10, edgeRequests: 1,
      },
      // Todo null: el Hobby no factura excedente, lo corta. Pasarse aquí no es
      // una factura sorpresa, es el sitio limitado hasta el mes siguiente.
      excedente: {
        cpuActiva: null, memoria: null, invocaciones: null,
        transferencia: null, transferenciaOrigen: null, edgeRequests: null,
      },
      nota: 'El único plan con cuota incluida POR RECURSO, y sin excedente facturable: al agotar una se limita el proyecto, no se cobra de más. Tampoco permite uso comercial.',
    },
    {
      id: 'pro',
      nombre: 'Pro',
      baseUsd: 20,
      // Cero en todas: el Pro NO incluye cuota por recurso. Lo que incluye son
      // 20 dólares de crédito de uso, y en cuanto se agotan todo es bajo
      // demanda desde la primera unidad. Modelarlo como cuotas (que fue mi
      // primera versión) regalaba 1 TB de transferencia que no existe.
      incluido: {
        cpuActiva: 0, memoria: 0, invocaciones: 0,
        transferencia: 0, transferenciaOrigen: 0, edgeRequests: 0,
      },
      excedente: {
        cpuActiva: TARIFAS_INICIALES.cpuActivaHora,
        memoria: TARIFAS_INICIALES.memoriaGbHora,
        invocaciones: TARIFAS_INICIALES.invocacionesMillon,
        transferencia: TARIFAS_INICIALES.transferenciaGb,
        transferenciaOrigen: TARIFAS_INICIALES.transferenciaOrigenGb,
        edgeRequests: TARIFAS_INICIALES.edgeRequestsMillon,
      },
      creditoUsd: 20,
      nota: 'Incluye 20 dólares de crédito de uso: pasado el crédito se cobra bajo demanda desde la primera unidad, sin cuota por recurso. El precio es por asiento de desarrollador (el segundo son otros 20). La transferencia y las peticiones al edge van en realidad por Flat Rate CDN, un producto de capacidad fija que aquí se aproxima con la tarifa bajo demanda.',
    },
  ],
}

export const TURSO: ProveedorInfra = {
  id: 'turso',
  nombre: 'Turso',
  url: 'https://turso.tech/pricing',
  verificado: '2026-09-17',
  fuente: 'turso.tech/pricing con facturación ANUAL, que es la columna barata: mes a mes Developer son 5,99, Scaler 29 y Pro 499. La dimensión que manda aquí son las filas LEÍDAS (escaneadas, no devueltas).',
  dimensiones: [
    // Las lecturas van en miles de millones y no en millones como las
    // escrituras porque así las factura Turso (1 dólar por cada mil millones).
    // Con la unidad en millones, el precio unitario de Developer y el de Scaler
    // se redondearían al mismo 0,001 en pantalla siendo distintos.
    { id: 'filasLeidas', etiqueta: 'Filas leídas', unidad: 'mil M/mes', decimales: 2 },
    { id: 'filasEscritas', etiqueta: 'Filas escritas', unidad: 'M/mes', decimales: 1 },
    { id: 'almacenamiento', etiqueta: 'Almacenamiento', unidad: 'GB' },
    { id: 'sincronizacion', etiqueta: 'Sincronización', unidad: 'GB/mes' },
  ],
  planes: [
    {
      id: 'free',
      nombre: 'Free',
      baseUsd: 0,
      incluido: { filasLeidas: 0.5, filasEscritas: 10, almacenamiento: 5, sincronizacion: 3 },
      excedente: { filasLeidas: null, filasEscritas: null, almacenamiento: null, sincronizacion: null },
      nota: 'Tope de 100 bases y, sobre todo, cuota por ORGANIZACIÓN y no por base: la principal y la de la demo se reparten los mismos 500 millones de lecturas.',
    },
    {
      id: 'developer',
      nombre: 'Developer',
      baseUsd: 4.99,
      incluido: { filasLeidas: 2.5, filasEscritas: 25, almacenamiento: 9, sincronizacion: 10 },
      excedente: { filasLeidas: 1, filasEscritas: 1, almacenamiento: 0.75, sincronizacion: 0.35 },
      nota: 'El primer plan que cobra excedente en vez de cortar, y ahí está su valor: cinco dólares compran que un pico de tráfico salga en la factura y no en una caída.',
    },
    {
      id: 'scaler',
      nombre: 'Scaler',
      baseUsd: 24.92,
      incluido: { filasLeidas: 100, filasEscritas: 100, almacenamiento: 24, sincronizacion: 24 },
      excedente: { filasLeidas: 0.8, filasEscritas: 0.8, almacenamiento: 0.5, sincronizacion: 0.25 },
    },
    {
      id: 'pro',
      nombre: 'Pro',
      baseUsd: 416.58,
      incluido: { filasLeidas: 250, filasEscritas: 250, almacenamiento: 50, sincronizacion: 100 },
      excedente: { filasLeidas: 0.75, filasEscritas: 0.75, almacenamiento: 0.45, sincronizacion: 0.15 },
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
      id: 'api-haiku-45',
      nombre: 'API · Haiku 4.5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 1, salida: 5 },
      nota: 'La tarifa más baja del catálogo. Sin cargo fijo: se paga solo lo que se consume, y el caché de prompt recorta la entrada hasta ~10% de la tarifa.',
    },
    {
      id: 'api-sonnet-5',
      nombre: 'API · Sonnet 5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 2, salida: 10 },
    },
    {
      id: 'api-opus-5',
      nombre: 'API · Opus 5',
      baseUsd: 0,
      incluido: { entrada: 0, salida: 0 },
      excedente: { entrada: 5, salida: 25 },
    },
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
  ],
}

// Google Workspace no se factura por consumo sino por asiento, así que su única
// dimensión son los buzones y el "excedente" es el precio por usuario sobre una
// cuota incluida de cero. Sale el mismo número y no hace falta un caso especial
// en el cálculo, que es lo que se quiere evitar: una rama aparte para un solo
// proveedor es la que nadie vuelve a probar.
export const WORKSPACE: ProveedorInfra = {
  id: 'workspace',
  nombre: 'Google Workspace',
  url: 'https://workspace.google.com/pricing',
  verificado: '2026-09-17',
  // Google cobra Workspace en PESOS en Colombia, así que el precio nativo es el
  // de COP y el dólar de aquí es una conversión a 4.000, no una tarifa. Si el
  // dólar se mueve, la factura en pesos no: se mueve esta columna.
  fuente: 'workspace.google.com/pricing con compromiso anual y precios en COP (Colombia): Starter 29.200, Standard 58.400 y Plus 90.900 por usuario al mes. Convertidos a USD a 4.000 COP/USD para poder sumarlos con el resto del stack.',
  dimensiones: [
    { id: 'usuarios', etiqueta: 'Buzones', unidad: 'usuarios' },
  ],
  planes: [
    {
      id: 'starter',
      nombre: 'Business Starter',
      baseUsd: 0,
      incluido: { usuarios: 0 },
      excedente: { usuarios: 7.3 },
      nota: 'El plan más barato con correo en dominio propio: 29.200 COP por usuario al mes, 30 GB de almacenamiento conjunto por persona y videollamadas de hasta 100 participantes. Hay un precio de lanzamiento de 26.280 durante 12 meses, pero solo para clientes nuevos y los primeros 20 usuarios, así que el catálogo usa el estándar.',
    },
    {
      id: 'standard',
      nombre: 'Business Standard',
      baseUsd: 0,
      incluido: { usuarios: 0 },
      excedente: { usuarios: 14.6 },
      nota: '58.400 COP por usuario al mes: el doble de precio a cambio de 2 TB por persona y grabación de reuniones. Solo se justifica cuando los 30 GB del Starter se llenan.',
    },
    {
      id: 'plus',
      nombre: 'Business Plus',
      baseUsd: 0,
      incluido: { usuarios: 0 },
      excedente: { usuarios: 22.73 },
      nota: '90.900 COP por usuario al mes: 5 TB, Vault para retención y búsqueda, y administración avanzada de dispositivos.',
    },
  ],
}

export const PROVEEDORES: ProveedorInfra[] = [VERCEL, TURSO, CLAUDE, WORKSPACE]

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
  /** Lo que cuesta el consumo ANTES de aplicar el crédito del plan. */
  excedentesUsd: number
  /** Crédito de uso que trae el plan (0 si no trae). */
  creditoUsd: number
  /** Parte del crédito que este consumo llega a gastar. */
  creditoAplicadoUsd: number
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
  // El consumo se calcula SIEMPRE bruto y el crédito se resta después, en vez
  // de repartirlo entre dimensiones: así la tabla sigue enseñando lo que cuesta
  // de verdad cada una y el crédito se ve como lo que es, un descuento.
  const excedentesUsd = lineas.reduce((s, l) => s + l.costoUsd, 0)
  const creditoAplicadoUsd = Math.min(plan.creditoUsd ?? 0, excedentesUsd)
  return {
    proveedorId: proveedor.id,
    nombre: proveedor.nombre,
    planId: plan.id,
    planNombre: plan.nombre,
    baseUsd: plan.baseUsd,
    excedentesUsd,
    creditoUsd: plan.creditoUsd ?? 0,
    creditoAplicadoUsd,
    totalUsd: plan.baseUsd + excedentesUsd - creditoAplicadoUsd,
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
      vercel: { cpuActiva: 1.5, memoria: 120, invocaciones: 0.3, transferencia: 15, transferenciaOrigen: 2, edgeRequests: 0.5 },
      turso: { filasLeidas: 0.3, filasEscritas: 3, almacenamiento: 1, sincronizacion: 0 },
      claude: { entrada: 0, salida: 0 },
      workspace: { usuarios: 1 },
    },
  },
  {
    id: 'clientes',
    nombre: 'Con clientes',
    descripcion: 'Portafolio + portal activo + tres sitios de cliente sobre la misma cuenta.',
    uso: {
      vercel: { cpuActiva: 8, memoria: 900, invocaciones: 2.5, transferencia: 220, transferenciaOrigen: 20, edgeRequests: 6 },
      turso: { filasLeidas: 1.8, filasEscritas: 30, almacenamiento: 5, sincronizacion: 0 },
      claude: { entrada: 40, salida: 6 },
      workspace: { usuarios: 2 },
    },
  },
  {
    id: 'pico',
    nombre: 'Pico',
    descripcion: 'Una campaña o una prueba de carga sin el CDN por delante: el mes malo.',
    uso: {
      vercel: { cpuActiva: 35, memoria: 4000, invocaciones: 12, transferencia: 1400, transferenciaOrigen: 120, edgeRequests: 30 },
      turso: { filasLeidas: 12, filasEscritas: 120, almacenamiento: 12, sincronizacion: 0 },
      claude: { entrada: 200, salida: 30 },
      workspace: { usuarios: 3 },
    },
  },
]

/**
 * Planes con los que arranca la vista: la tarifa más baja de cada proveedor.
 * Es el punto de partida real del stack, y además el más informativo - así la
 * página abre mostrando dónde se rompe el gratis, que es la pregunta cara.
 */
export const SELECCION_INICIAL: SeleccionPlanes = {
  vercel: 'hobby',
  turso: 'free',
  claude: 'api-haiku-45',
  workspace: 'starter',
}

export function escenarioPorId(id: string | null | undefined): Escenario {
  return ESCENARIOS.find((e) => e.id === id) ?? ESCENARIOS[0]
}
