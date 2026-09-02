// Cuentas de cobro (persona natural NO responsable de IVA, Colombia).
//
// Módulo PURO: sin `../db`, sin `node:crypto`, sin efectos. El formulario del
// panel lo importa también en el navegador para previsualizar el neto mientras
// se teclea, igual que `cobros.ts` en /cobrar. Todo lo que toque base de datos
// vive en lib/portal/invoices.ts.
//
// Contexto normativo, con la única decisión de diseño que de verdad importa:
// el documento con peso fiscal NO es esta cuenta de cobro, es el "Documento
// Soporte en Adquisiciones efectuadas a no obligados a facturar" que genera y
// transmite el PAGADOR (Resolución DIAN 000167 de 2021, art. 616-1 ET). Por eso
// la cuenta de cobro tiene que traer exactamente los datos con los que él arma
// ese soporte - nombre, cédula, dirección, fecha de la operación, descripción y
// valor. Si falta uno, contabilidad la devuelve. Eso es lo que hace obligatorios
// los campos que `validateCuentaCobro` exige. Ver docs/plan-cuentas-de-cobro.md.

// ── Configuración parametrizable ────────────────────────────────────────────
//
// Nada de esto se incrusta en el código. Las bases mínimas de retención se
// movieron durante 2025-2026 con el Decreto 572 de 2025 y sus modificaciones, y
// las fuentes públicas todavía se contradicen entre 2 y 4 UVT. Una tarifa
// escrita a mano en un `.ts` es un bug con temporizador: vive en `app_settings`
// y un contador la corrige sin un deploy.

export type ConceptoId = 'honorarios' | 'servicios' | 'reteica'

export type ConceptoDef = {
  id: ConceptoId
  label: string
  /**
   * Nombre corto para la columna de totales del PDF, donde el ancho disponible
   * es el que sobra a la izquierda del importe. El nombre largo no cabe y se
   * recortaría justo por donde va el porcentaje, que es el dato que se busca.
   */
  labelCorto: string
  norma: string
  /** Fracción, no porcentaje: 0.11 = 11 %. */
  rateDeclarante: number
  rateNoDeclarante: number
  /** Base mínima en UVT. Por debajo de ella no se practica retención. */
  baseUvt: number
}

/** UVT 2026: $52.374. En centavos, como todo el dinero de este repo. */
export const UVT_2026_CENTS = 5_237_400

/** Tope de ingresos para seguir siendo no responsable de IVA (art. 437 par. 3 ET). */
export const TOPE_NO_RESPONSABLE_UVT = 3500

export const CONCEPTOS_DEFAULT: ConceptoDef[] = [
  {
    id: 'honorarios',
    label: 'Retención en la fuente - honorarios y servicios personales',
    labelCorto: 'Retefuente honorarios',
    norma: 'Art. 392 ET',
    rateDeclarante: 0.11,
    rateNoDeclarante: 0.1,
    baseUvt: 0,
  },
  {
    id: 'servicios',
    label: 'Retención en la fuente - servicios generales',
    labelCorto: 'Retefuente servicios',
    norma: 'Art. 392 ET',
    // Ojo, no es un error de tecleo: en servicios generales el NO declarante
    // retiene MÁS (6 %) que el declarante (4 %). Es al revés que en honorarios.
    rateDeclarante: 0.04,
    rateNoDeclarante: 0.06,
    baseUvt: 2,
  },
  {
    id: 'reteica',
    label: 'ReteICA municipal',
    labelCorto: 'ReteICA',
    norma: 'Acuerdo municipal (tarifa por mil según actividad)',
    // Apagada por defecto: la tarifa depende del municipio y de la actividad,
    // así que sin configurar no se practica nada en vez de inventar un número.
    rateDeclarante: 0,
    rateNoDeclarante: 0,
    baseUvt: 0,
  },
]

export type CuentaCobroConfig = {
  uvtCents: number
  /** Salario mínimo del año, para el piso del IBC. null = sin configurar. */
  smmlvCents: number | null
  declarante: boolean
  conceptos: ConceptoDef[]
}

export const CONFIG_DEFAULT: CuentaCobroConfig = {
  uvtCents: UVT_2026_CENTS,
  smmlvCents: null,
  declarante: false,
  conceptos: CONCEPTOS_DEFAULT,
}

const num = (v: string | null | undefined): number | null => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Construye la configuración desde filas de `app_settings`. Mismo patrón que
 * `parseRates()` de money.ts: lo que falte cae al valor por defecto en vez de
 * lanzar - una tasa mal tecleada no puede tumbar el panel entero.
 *
 * Las tarifas se guardan en PORCENTAJE ('11'), que es como se teclean, y ReteICA
 * en POR MIL ('9.66'), que es como la publican los municipios. La conversión a
 * fracción pasa aquí, en el borde, una sola vez.
 */
export function parseCuentaCobroConfig(rows: { key: string; value: string | null }[]): CuentaCobroConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const pct = (key: string, fallback: number): number => {
    const n = num(map.get(key))
    return n != null && n >= 0 && n <= 100 ? n / 100 : fallback
  }

  const uvt = num(map.get('uvt_cents'))
  const smmlv = num(map.get('smmlv_cents'))
  const porMil = num(map.get('ret_reteica_por_mil'))
  const baseServicios = num(map.get('ret_servicios_base_uvt'))

  return {
    uvtCents: uvt != null && uvt > 0 ? Math.round(uvt) : UVT_2026_CENTS,
    smmlvCents: smmlv != null && smmlv > 0 ? Math.round(smmlv) : null,
    declarante: map.get('emisor_declarante') === 'true',
    conceptos: CONCEPTOS_DEFAULT.map((c) => {
      if (c.id === 'reteica') {
        const rate = porMil != null && porMil >= 0 && porMil <= 100 ? porMil / 1000 : 0
        return { ...c, rateDeclarante: rate, rateNoDeclarante: rate }
      }
      return {
        ...c,
        rateDeclarante: pct(`ret_${c.id}_declarante`, c.rateDeclarante),
        rateNoDeclarante: pct(`ret_${c.id}_no_declarante`, c.rateNoDeclarante),
        baseUvt:
          c.id === 'servicios' && baseServicios != null && baseServicios >= 0 ? baseServicios : c.baseUvt,
      }
    }),
  }
}

/** Tarifa que aplica según si el emisor es declarante de renta. */
export const rateOf = (c: ConceptoDef, declarante: boolean): number =>
  declarante ? c.rateDeclarante : c.rateNoDeclarante

// ── Retenciones ─────────────────────────────────────────────────────────────

export type Retencion = {
  id: ConceptoId
  label: string
  labelCorto: string
  norma: string
  rate: number
  baseUvt: number
  /** Base mínima ya resuelta a pesos, para poder explicarla en el documento. */
  minimoCents: number
  baseCents: number
  valueCents: number
  /** false = no se practicó (bajo el mínimo, o tarifa en cero). */
  applied: boolean
  motivo?: string
}

/**
 * Calcula las retenciones sobre la base gravable.
 *
 * Cada concepto se redondea a centavo entero POR SEPARADO y solo entonces se
 * suma: acumular decimales y redondear al final da un total que no coincide con
 * la suma de lo impreso, y una cuenta de cobro que no cuadra por un peso es una
 * llamada del área contable.
 */
export function computeRetentions(
  baseCents: number,
  seleccion: readonly ConceptoId[],
  cfg: CuentaCobroConfig = CONFIG_DEFAULT
): Retencion[] {
  const base = Number.isFinite(baseCents) && baseCents > 0 ? Math.round(baseCents) : 0

  return seleccion.flatMap((id): Retencion[] => {
    const def = cfg.conceptos.find((c) => c.id === id)
    if (!def) return []

    const rate = rateOf(def, cfg.declarante)
    const minimoCents = Math.round(def.baseUvt * cfg.uvtCents)
    const common = {
      id: def.id,
      label: def.label,
      labelCorto: def.labelCorto,
      norma: def.norma,
      rate,
      baseUvt: def.baseUvt,
      minimoCents,
      baseCents: base,
    }

    if (rate <= 0) {
      return [{ ...common, valueCents: 0, applied: false, motivo: 'tarifa sin configurar' }]
    }
    if (base < minimoCents) {
      return [{ ...common, valueCents: 0, applied: false, motivo: `base inferior a ${def.baseUvt} UVT` }]
    }
    return [{ ...common, valueCents: Math.round(base * rate), applied: true }]
  })
}

// ── Totales ─────────────────────────────────────────────────────────────────

export type CuentaCobroItem = { description: string; quantity: number; unitCents: number }

export const itemTotal = (i: CuentaCobroItem): number => Math.round(i.quantity * i.unitCents)

export type CuentaCobroTotals = {
  subtotalCents: number
  /** Siempre 0: quien emite cuenta de cobro no es responsable de IVA. */
  taxCents: number
  totalCents: number
  retentions: Retencion[]
  retentionsCents: number
  netCents: number
}

/**
 * Totales del documento.
 *
 * El invariante que define este tipo de documento: `taxCents` es 0 por
 * construcción. Quien emite una cuenta de cobro no es responsable de IVA, así
 * que no hay un camino por el que aparezca un impuesto - no es un default que
 * se pueda sobrescribir desde el formulario.
 *
 * La cuenta se emite por el BRUTO. El neto es informativo: evita la llamada de
 * "¿por qué me pagaron menos?", pero lo que se cobra es `totalCents`.
 */
export function computeCuentaCobro(
  items: readonly CuentaCobroItem[],
  seleccion: readonly ConceptoId[] = [],
  cfg: CuentaCobroConfig = CONFIG_DEFAULT
): CuentaCobroTotals {
  const subtotalCents = items.reduce((s, i) => s + itemTotal(i), 0)
  const retentions = computeRetentions(subtotalCents, seleccion, cfg)
  const retentionsCents = retentions.reduce((s, r) => s + r.valueCents, 0)

  return {
    subtotalCents,
    taxCents: 0,
    totalCents: subtotalCents,
    retentions,
    retentionsCents,
    netCents: subtotalCents - retentionsCents,
  }
}

// ── Valor en letras ─────────────────────────────────────────────────────────
//
// Requisito de forma universal en la práctica colombiana, y la función más
// traicionera del módulo: 21 es "veintiuno" pero 21.000 es "veintiún mil"; 100
// es "cien" y 101 "ciento uno"; 500 es "quinientos" y 700 "setecientos".
//
// Simplificación deliberada: como el número SIEMPRE va seguido del sustantivo
// masculino "pesos", la apócope (uno→un, veintiuno→veintiún) se aplica siempre.
// No hay un caso en este documento donde haga falta la forma plena.

const UNIDADES = [
  '', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]

const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']

const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

/** 0-99. Devuelve '' para 0: los grupos vacíos no se imprimen. */
function dosDigitos(n: number): string {
  if (n < 30) return UNIDADES[n]
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

/** 0-999. */
function tresDigitos(n: number): string {
  if (n === 100) return 'cien' // el único irregular: 100 es 'cien', 101 'ciento uno'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes = [CENTENAS[c], dosDigitos(resto)].filter(Boolean)
  return partes.join(' ')
}

/** Tope de la conversión. Por encima, el documento no es una cuenta de cobro. */
const MAX_LETRAS = 999_999_999_999

/** Entero a palabras en minúscula: 2_500_000 → 'dos millones quinientos mil'. */
export function numeroALetras(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > MAX_LETRAS) return ''
  const entero = Math.floor(n)
  if (entero === 0) return 'cero'

  const millones = Math.floor(entero / 1_000_000)
  const resto = entero % 1_000_000
  const miles = Math.floor(resto / 1000)
  const cientos = resto % 1000

  const partes: string[] = []
  if (millones === 1) partes.push('un millón')
  else if (millones > 1) partes.push(`${numeroALetras(millones)} millones`)
  if (miles === 1) partes.push('mil')
  else if (miles > 1) partes.push(`${tresDigitos(miles)} mil`)
  if (cientos > 0) partes.push(tresDigitos(cientos))

  return partes.join(' ')
}

/**
 * Importe en centavos → la línea que va tras "LA SUMA DE":
 * 250_000_00 → 'DOSCIENTOS CINCUENTA MIL PESOS M/CTE'.
 *
 * M/CTE = moneda corriente. Los centavos solo se escriben si existen: el peso
 * no los usa en la práctica, y escribir 'CON CERO CENTAVOS' en cada documento
 * es ruido.
 */
export function montoEnLetras(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return ''
  const total = Math.round(cents)
  const pesos = Math.floor(total / 100)
  const centavos = total % 100

  const letras = numeroALetras(pesos)
  if (!letras) return ''

  const unidad = pesos === 1 ? 'PESO' : 'PESOS'
  const base = `${letras.toUpperCase()} ${unidad}`
  const cola = centavos > 0 ? ` CON ${numeroALetras(centavos).toUpperCase()} CENTAVOS` : ''
  return `${base}${cola} M/CTE`
}

// ── Seguridad social del contratista ────────────────────────────────────────

export type IbcCalculo = {
  ibcCents: number
  pisoCents: number | null
  /** Sobre lo que realmente se cotiza: el mayor entre el IBC y el piso. */
  cotizableCents: number
  bajoPiso: boolean
}

/**
 * IBC del contratista independiente: 40 % del valor mensualizado del contrato,
 * nunca inferior a 1 SMMLV (Decreto 1273 de 2018, art. 244 Ley 1955 de 2019).
 *
 * Informativo: aquí NO se liquidan aportes ni se calculan porcentajes de salud,
 * pensión o riesgos. Eso lo hace la PILA, y meterlo en el panel sería inventar
 * una liquidadora paralela que nadie va a mantener al día.
 */
export function ibcSeguridadSocial(baseMensualCents: number, smmlvCents: number | null = null): IbcCalculo {
  const base = Number.isFinite(baseMensualCents) && baseMensualCents > 0 ? baseMensualCents : 0
  const ibcCents = Math.round(base * 0.4)
  const piso = smmlvCents != null && smmlvCents > 0 ? Math.round(smmlvCents) : null

  return {
    ibcCents,
    pisoCents: piso,
    cotizableCents: piso != null ? Math.max(ibcCents, piso) : ibcCents,
    bajoPiso: piso != null && ibcCents < piso,
  }
}

// ── Leyendas legales ────────────────────────────────────────────────────────
//
// Constantes, no strings sueltos en el .astro: son texto normativo, se citan en
// el PDF y en la vista, y tienen que decir exactamente lo mismo en los dos.

export const LEYENDA_NO_RESPONSABLE_IVA = 'No soy responsable del Impuesto sobre las Ventas - IVA.'

export const LEYENDA_NO_OBLIGADO_FACTURAR =
  'No estoy obligado a expedir factura de venta ni documento equivalente, ' +
  'de conformidad con el artículo 616-2 del Estatuto Tributario y el ' +
  'artículo 1.6.1.4.3 del Decreto 1625 de 2016.'

export const LEYENDA_DOCUMENTO_SOPORTE =
  'El presente documento sirve de soporte para que el adquirente genere el ' +
  'Documento Soporte en Adquisiciones efectuadas a no obligados a facturar ' +
  '(Resolución DIAN 000167 de 2021).'

// ── Emisor y deudor ─────────────────────────────────────────────────────────

export type Emisor = {
  nombre: string
  cedula: string
  direccion: string
  ciudad: string
  telefono: string
  email: string
  banco: string
  tipoCuenta: string
  numeroCuenta: string
  declarante: boolean
}

export type Deudor = {
  nombre: string
  nit: string
  direccion: string
  ciudad: string
}

const str = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

/** Lee los datos del emisor desde `app_settings`. Los campos que falten van vacíos. */
export function parseEmisor(rows: { key: string; value: string | null }[]): Emisor {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const g = (k: string) => str(map.get(k))
  return {
    nombre: g('emisor_nombre'),
    cedula: g('emisor_cedula'),
    direccion: g('emisor_direccion'),
    ciudad: g('emisor_ciudad'),
    telefono: g('emisor_telefono'),
    email: g('emisor_email'),
    banco: g('emisor_banco'),
    tipoCuenta: g('emisor_tipo_cuenta'),
    numeroCuenta: g('emisor_numero_cuenta'),
    declarante: map.get('emisor_declarante') === 'true',
  }
}

/**
 * Extrae los datos del deudor del JSON `clients.billing_info`, que es un
 * diccionario libre. Se buscan varias grafías de la misma clave porque ese
 * campo lo he ido llenando a mano y no tiene esquema.
 */
export function parseDeudor(
  nombre: string,
  company: string | null | undefined,
  billingInfo: string | null | undefined
): Deudor {
  let raw: Record<string, unknown> = {}
  try {
    if (billingInfo) raw = JSON.parse(billingInfo) as Record<string, unknown>
  } catch {
    raw = {}
  }
  // Las tildes se PLIEGAN, no se borran: 'Dirección' tiene que casar con
  // 'direccion', y un simple [^a-z] la convertiría en 'direccin'.
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      for (const [rk, rv] of Object.entries(raw)) {
        if (norm(rk) === k && typeof rv === 'string' && rv.trim()) return rv.trim()
      }
    }
    return ''
  }
  return {
    // La razón social manda sobre el nombre de la ficha. En el CRM, `name`
    // suele ser la persona de contacto y `company` la empresa; una cuenta de
    // cobro dirigida a "Juan Pérez" cuando quien paga es "ACME S.A.S." la
    // devuelve contabilidad, porque el NIT y el nombre no concuerdan.
    nombre: str(company) || str(nombre),
    nit: pick('nit', 'documento', 'cedula', 'identificacion'),
    direccion: pick('direccion', 'address'),
    ciudad: pick('ciudad', 'city'),
  }
}

// ── Fechas ──────────────────────────────────────────────────────────────────
//
// La fecha de expedición de una cuenta de cobro es un dato del documento, no
// una marca de tiempo interna: alimenta el Documento Soporte del pagador, que
// tiene plazos por día. En Vercel el servidor corre en UTC, así que formatear
// sin zona hace que todo lo emitido después de las 19:00 hora de Colombia
// aparezca fechado al día siguiente.
//
// Hay DOS clases de fecha aquí y confundirlas produce errores opuestos:
//
//  · Instantes (emisión, pago): un momento real. Se guardan como instante y se
//    formatean en América/Bogotá.
//  · Fechas de calendario (periodo del servicio, vencimiento): vienen de un
//    <input type="date"> como 'YYYY-MM-DD' y NO son un instante. `new Date()`
//    las interpreta como medianoche UTC, que en Bogotá es el día ANTERIOR a
//    las 19:00. Por eso se anclan a medianoche colombiana al entrar.

export const TZ_COLOMBIA = 'America/Bogota'

// Colombia no aplica horario de verano desde 1993, así que el desfase es fijo
// y se puede escribir literal sin que caduque.
const OFFSET_COLOMBIA = '-05:00'

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte lo que llega del formulario en un instante.
 *
 * 'YYYY-MM-DD' se ancla a medianoche EN COLOMBIA, no en UTC: es una fecha de
 * calendario que el usuario eligió en su calendario, no un momento universal.
 * Cualquier otra cosa se parsea tal cual. Una fecha inválida devuelve null y
 * nunca un `Invalid Date`, que se propagaría hasta la base de datos.
 */
export function parseFechaCalendario(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const raw = v.trim()
  const d = new Date(SOLO_FECHA.test(raw) ? `${raw}T00:00:00${OFFSET_COLOMBIA}` : raw)
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtLarga = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: TZ_COLOMBIA,
})

const fmtCorta = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TZ_COLOMBIA,
})

/** '01 de septiembre de 2026'. Para el cuerpo del documento. */
export const formatFechaLarga = (d: Date | null | undefined): string => (d ? fmtLarga.format(d) : '')

/** '01 sept 2026'. Para listados y tablas del panel. */
export const formatFechaCorta = (d: Date | null | undefined): string => (d ? fmtCorta.format(d) : '-')

// ── Identificación de las partes ────────────────────────────────────────────

export type BloqueIdentificacion = {
  rotulo: 'SEÑORES' | 'DEBE A'
  papel: 'deudor' | 'emisor'
  nombre: string
  documento: string
  lineas: string[]
}

/**
 * Los dos bloques que identifican a las partes, EN EL ORDEN EN QUE VAN IMPRESOS.
 *
 * Vive aquí y no en el código que dibuja el PDF porque es una regla del
 * documento, no una decisión de maquetación, y es lo contrario de lo intuitivo:
 * la fórmula colombiana es "[DEUDOR] DEBE A [EMISOR]", así que el rótulo
 * "DEBE A" encabeza a quien COBRA. Colocar al deudor bajo ese rótulo invierte
 * el sentido y convierte la cuenta de cobro en un reconocimiento de deuda
 * propia. Es un error que no rompe nada visible y que solo detecta quien lo
 * lee con cuidado, así que lleva test.
 */
export function bloquesIdentificacion(emisor: Emisor, deudor: Deudor): BloqueIdentificacion[] {
  const contacto = [emisor.telefono, emisor.email].filter(Boolean).join('  ·  ')
  return [
    {
      rotulo: 'SEÑORES',
      papel: 'deudor',
      nombre: deudor.nombre,
      documento: `NIT/C.C. ${deudor.nit}`,
      lineas: [deudor.direccion, deudor.ciudad].filter(Boolean),
    },
    {
      rotulo: 'DEBE A',
      papel: 'emisor',
      nombre: emisor.nombre,
      documento: `C.C. ${emisor.cedula}`,
      lineas: [emisor.direccion, emisor.ciudad, contacto].filter(Boolean),
    },
  ]
}

// ── Validación ──────────────────────────────────────────────────────────────
//
// Esta función es lo que sustituye a una restricción en base: `invoices` guarda
// dos formas distintas de documento en la misma tabla, y quien impide que se
// mezclen es el borde, no el esquema.

export type CuentaCobroDraft = {
  docType?: string
  concept?: string | null
  city?: string | null
  items: readonly CuentaCobroItem[]
  emisor: Emisor
  deudor: Deudor
  taxCents?: number
}

/** Devuelve la lista de problemas. Vacía = el documento se puede emitir. */
export function validateCuentaCobro(d: CuentaCobroDraft): string[] {
  const errs: string[] = []

  if (d.docType && d.docType !== 'cuenta_cobro') errs.push('el tipo de documento no es una cuenta de cobro')
  if (d.taxCents) errs.push('una cuenta de cobro no lleva IVA: el emisor no es responsable')

  if (!d.items.length) errs.push('falta al menos un concepto')
  if (d.items.some((i) => !str(i.description))) errs.push('hay un concepto sin descripción')
  if (d.items.some((i) => !(i.quantity > 0))) errs.push('hay una cantidad inválida')
  if (d.items.some((i) => !(i.unitCents >= 0))) errs.push('hay un valor unitario inválido')
  if (computeCuentaCobro(d.items).totalCents <= 0) errs.push('el total debe ser mayor que cero')

  if (!str(d.concept)) errs.push('falta el concepto detallado del servicio')
  if (!str(d.city)) errs.push('falta la ciudad de expedición')

  // Datos del emisor: sin ellos el pagador no puede armar su documento soporte.
  if (!str(d.emisor.nombre)) errs.push('falta el nombre del emisor')
  if (!str(d.emisor.cedula)) errs.push('falta la cédula del emisor')
  if (!str(d.emisor.direccion)) errs.push('falta la dirección del emisor')
  if (!str(d.emisor.ciudad)) errs.push('falta la ciudad del emisor')
  // Sin datos bancarios no hay pago, por muy correcto que sea el resto.
  if (!str(d.emisor.banco)) errs.push('falta el banco del emisor')
  if (!str(d.emisor.numeroCuenta)) errs.push('falta el número de cuenta del emisor')

  // Datos del deudor: el NIT es el campo que más devoluciones causa.
  if (!str(d.deudor.nombre)) errs.push('falta el nombre o razón social del deudor')
  if (!str(d.deudor.nit)) errs.push('falta el NIT o cédula del deudor (va en billing_info del cliente)')

  return errs
}

// ── Semáforo del tope de responsabilidad de IVA ─────────────────────────────

export type TopeIva = {
  emitidoCents: number
  topeCents: number
  ratio: number
  nivel: 'ok' | 'aviso' | 'alerta' | 'superado'
}

/**
 * Cuánto llevo emitido en el año contra las 3.500 UVT del art. 437 par. 3 ET.
 *
 * Superado el tope dejo de ser no responsable de IVA y paso a estar obligado a
 * facturación electrónica: la cuenta de cobro deja de ser el soporte correcto.
 * Eso lo tiene que avisar el panel, no descubrirlo el contador en marzo.
 */
export function topeIva(emitidoCents: number, cfg: CuentaCobroConfig = CONFIG_DEFAULT): TopeIva {
  const topeCents = Math.round(TOPE_NO_RESPONSABLE_UVT * cfg.uvtCents)
  const emitido = Number.isFinite(emitidoCents) && emitidoCents > 0 ? emitidoCents : 0
  const ratio = topeCents > 0 ? emitido / topeCents : 0

  const nivel: TopeIva['nivel'] =
    ratio >= 1 ? 'superado' : ratio >= 0.9 ? 'alerta' : ratio >= 0.7 ? 'aviso' : 'ok'

  return { emitidoCents: emitido, topeCents, ratio, nivel }
}
