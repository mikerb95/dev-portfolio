// Estimación de la remuneración de un contrato de aprendizaje durante la etapa
// productiva: mes de arranque partido, meses completos, descuentos,
// prestaciones proyectadas al cierre y total de la etapa. Módulo PURO e
// isomorfo: lo usa el script de /ep en el navegador, así que no puede
// importar `node:crypto` ni `../db`.
//
// Convenciones de nómina colombiana que se aplican a propósito:
// - Mes comercial de 30 días (art. 134 CST): un arranque el 9 de cualquier mes
//   son 22 días, tenga el mes 28 o 31. Seis meses de etapa son siempre 180.
// - Las prestaciones se liquidan sobre año de 360 días.
// - Cada tramo usa el SMMLV y el auxilio del año en que cae. Es una
//   simplificación: la ley permite promediar el último año cuando el salario
//   varió, y la diferencia en una etapa de seis meses son unos pocos miles de
//   pesos. Se prefiere que el desglose muestre de dónde sale cada número.

import {
  APORTE_PENSION,
  APORTE_SALUD,
  TASA_INTERESES_CESANTIAS,
  VALORES_POR_ANIO,
  type ValoresAnio,
} from '../data/salario-minimo-co'

export type Formacion = 'tradicional' | 'dual' | 'universitario'
export type Trabajo = 'presencial' | 'remoto' | 'hibrido'

export interface EntradaRemuneracion {
  /** Primer día de fase práctica, `YYYY-MM-DD`. */
  inicioIso: string
  formacion: Formacion
  trabajo: Trabajo
  /** Solo tradicional y universitario: el mes de arranque trae días de fase lectiva remunerada. */
  lectivaMismoMes: boolean
  /** Solo dual: inicio del contrato, del que cuenta el primer año. Por defecto, `inicioIso`. */
  contratoInicioIso?: string
  /** Duración de la etapa productiva. Por defecto 6 (864 horas). */
  meses?: number
}

export interface ValoresAplicados extends ValoresAnio {
  anio: number
  /** El año no tiene valores cargados y se usan los del último año conocido. */
  provisional: boolean
  /** Año del que salen realmente los valores. */
  anioFuente: number
}

export interface GrupoDias {
  pct: number
  dias: number
}

export interface TramoMes {
  anio: number
  /** 0-11, como `Date#getMonth`. */
  mes: number
  diasLectiva: number
  pctLectiva: number
  /** Días de práctica agrupados por porcentaje (en dual pueden ser dos grupos si el aniversario cae en el mes). */
  practica: GrupoDias[]
  diasPractica: number
  completo: boolean
  valores: ValoresAplicados
  apoyoLectiva: number
  apoyoPractica: number
  apoyo: number
  auxilio: number
  bruto: number
  salud: number
  pension: number
  descuentos: number
  neto: number
}

export interface PagoPrestacion {
  concepto: string
  periodo: string
  monto: number
  /** Fecha límite legal (`YYYY-MM-DD`), o `null` si se paga en la liquidación final. */
  fechaIso: string | null
}

export interface ResultadoRemuneracion {
  inicioIso: string
  finIso: string
  nombreAuxilio: string
  tramos: TramoMes[]
  mesArranque: TramoMes
  /** Primer mes completo sin días lectivos; `null` si la etapa no tiene ninguno. */
  mesTipico: TramoMes | null
  prima: PagoPrestacion[]
  cesantias: PagoPrestacion[]
  intereses: PagoPrestacion[]
  vacaciones: PagoPrestacion
  totales: {
    diasPractica: number
    bruto: number
    descuentos: number
    neto: number
    prestaciones: number
    total: number
  }
  /** Años distintos que toca la etapa, con los valores que se usaron en cada uno. */
  anios: ValoresAplicados[]
}

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

interface Ymd {
  y: number
  m: number
  d: number
}

// Todo el cálculo trabaja con año/mes/día enteros y aritmética UTC: son días
// de calendario, no instantes, y así el resultado no depende de la zona del
// navegador que lo ejecute.
function parseIso(iso: string): Ymd {
  const match = SOLO_FECHA.exec(iso)
  if (!match) throw new Error('fecha inválida')
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const t = new Date(Date.UTC(y, m, d))
  // JS desborda '2026-02-30' al 2 de marzo en silencio.
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m || t.getUTCDate() !== d) {
    throw new Error('fecha inválida')
  }
  return { y, m, d }
}

const toIso = ({ y, m, d }: Ymd) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const fromUtc = (t: Date): Ymd => ({ y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() })

const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

function sumarMeses(f: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(f.y, f.m, f.d))
  t.setUTCMonth(t.getUTCMonth() + n)
  return fromUtc(t)
}

function sumarDias(f: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(f.y, f.m, f.d))
  t.setUTCDate(t.getUTCDate() + n)
  return fromUtc(t)
}

const MESES_POR_DEFECTO = 6

export function valoresDelAnio(anio: number): ValoresAplicados {
  const conocidos = Object.keys(VALORES_POR_ANIO).map(Number).sort((a, b) => a - b)
  if (VALORES_POR_ANIO[anio]) {
    return { ...VALORES_POR_ANIO[anio], anio, anioFuente: anio, provisional: false }
  }
  // Un año sin decreto cargado no rompe el cálculo: toma el más cercano y lo
  // marca, para que el desglose diga que ese tramo es una estimación.
  const fuente = anio > conocidos[conocidos.length - 1] ? conocidos[conocidos.length - 1] : conocidos[0]
  return { ...VALORES_POR_ANIO[fuente], anio, anioFuente: fuente, provisional: true }
}

/** Porcentaje del SMMLV durante la fase lectiva, según la modalidad. */
export function pctLectiva(formacion: Formacion): number {
  return formacion === 'universitario' ? 1 : 0.75
}

export function nombreAuxilio(trabajo: Trabajo): string {
  if (trabajo === 'presencial') return 'Auxilio de transporte'
  if (trabajo === 'remoto') return 'Auxilio de conectividad digital'
  // Híbrido: los días presenciales dan transporte y los remotos conectividad,
  // pero no se acumulan en un mismo día, así que el monto mensual es uno solo.
  return 'Auxilio de transporte o conectividad'
}

const redondear = (n: number) => Math.round(n)

export function calcularRemuneracion(entrada: EntradaRemuneracion): ResultadoRemuneracion {
  const inicio = parseIso(entrada.inicioIso)
  const meses = entrada.meses ?? MESES_POR_DEFECTO
  // Mismo criterio que las ventanas de bitácora de /ep: la etapa termina el
  // día antes de cumplir los N meses.
  const fin = sumarDias(sumarMeses(inicio, meses), -1)
  const finIso = toIso(fin)

  const dual = entrada.formacion === 'dual'
  const aniversarioIso = dual
    ? (() => {
        const contrato = parseIso(entrada.contratoInicioIso || entrada.inicioIso)
        if (toIso(contrato) > entrada.inicioIso) {
          throw new Error('el contrato no puede empezar después de la fase práctica')
        }
        return toIso(sumarMeses(contrato, 12))
      })()
    : ''

  // En dual el porcentaje depende de la antigüedad del contrato, no de la fase.
  const pctPracticaEn = (iso: string) => (dual ? (iso < aniversarioIso ? 0.75 : 1) : 1)
  const conLectiva = !dual && entrada.lectivaMismoMes

  const tramos: TramoMes[] = []
  let cursor = { y: inicio.y, m: inicio.m }
  for (;;) {
    const esPrimero = cursor.y === inicio.y && cursor.m === inicio.m
    const esUltimo = cursor.y === fin.y && cursor.m === fin.m
    const largo = diasDelMes(cursor.y, cursor.m)

    const desde = esPrimero ? Math.min(inicio.d, 30) : 1
    // Terminar el último día real del mes (28 de febrero, 31 de marzo) cuenta
    // como mes comercial completo.
    const hasta = esUltimo && fin.d < largo ? Math.min(fin.d, 30) : 30

    const porPct = new Map<number, number>()
    for (let dia = desde; dia <= hasta; dia++) {
      // Los días comerciales 29 y 30 de febrero no existen: toman la fecha del
      // último día real para decidir el porcentaje.
      const iso = toIso({ y: cursor.y, m: cursor.m, d: Math.min(dia, largo) })
      const pct = pctPracticaEn(iso)
      porPct.set(pct, (porPct.get(pct) ?? 0) + 1)
    }
    const practica = [...porPct.entries()].map(([pct, dias]) => ({ pct, dias }))
    const diasPractica = hasta - desde + 1
    const diasLectiva = esPrimero && conLectiva ? desde - 1 : 0

    const valores = valoresDelAnio(cursor.y)
    const diario = valores.smmlv / 30
    const pctLect = pctLectiva(entrada.formacion)

    const apoyoLectiva = redondear(diario * pctLect * diasLectiva)
    const apoyoPractica = redondear(practica.reduce((s, g) => s + diario * g.pct * g.dias, 0))
    const apoyo = apoyoLectiva + apoyoPractica
    const auxilio = redondear((valores.auxilio / 30) * diasPractica)
    // Salud sobre todo el apoyo del mes; pensión solo sobre el de práctica,
    // porque en fase lectiva no se cotiza. El auxilio no es base de aportes.
    const salud = redondear(apoyo * APORTE_SALUD)
    const pension = redondear(apoyoPractica * APORTE_PENSION)
    const bruto = apoyo + auxilio

    tramos.push({
      anio: cursor.y,
      mes: cursor.m,
      diasLectiva,
      pctLectiva: pctLect,
      practica,
      diasPractica,
      completo: diasPractica === 30,
      valores,
      apoyoLectiva,
      apoyoPractica,
      apoyo,
      auxilio,
      bruto,
      salud,
      pension,
      descuentos: salud + pension,
      neto: bruto - salud - pension,
    })

    if (esUltimo) break
    cursor = cursor.m === 11 ? { y: cursor.y + 1, m: 0 } : { y: cursor.y, m: cursor.m + 1 }
  }

  // Prestaciones: solo los días de práctica las causan. Prima y cesantías
  // incluyen el auxilio en la base (el de conectividad tiene los mismos
  // efectos que el de transporte); vacaciones, no.
  const basePrestacional = (t: TramoMes) => t.apoyoPractica + t.auxilio

  const prima: PagoPrestacion[] = []
  const semestres = new Map<string, TramoMes[]>()
  for (const t of tramos) {
    const clave = `${t.anio}-${t.mes < 6 ? 1 : 2}`
    semestres.set(clave, [...(semestres.get(clave) ?? []), t])
  }
  for (const [clave, ts] of semestres) {
    const [anio, sem] = clave.split('-').map(Number)
    const limite = sem === 1 ? `${anio}-06-30` : `${anio}-12-20`
    const primero = ts[0]
    const ultimo = ts[ts.length - 1]
    prima.push({
      concepto: 'Prima de servicios',
      periodo: `${sem === 1 ? 'Primer' : 'Segundo'} semestre ${anio}`,
      monto: redondear(ts.reduce((s, t) => s + basePrestacional(t), 0) / 12),
      // Si la etapa termina antes de la fecha legal, esa prima sale en la
      // liquidación. Con fin == límite se paga en la fecha, que es igual.
      fechaIso: finIso > limite ? limite : null,
    })
    void primero
    void ultimo
  }

  const cesantias: PagoPrestacion[] = []
  const intereses: PagoPrestacion[] = []
  const porAnio = new Map<number, TramoMes[]>()
  for (const t of tramos) porAnio.set(t.anio, [...(porAnio.get(t.anio) ?? []), t])
  for (const [anio, ts] of porAnio) {
    const monto = redondear(ts.reduce((s, t) => s + basePrestacional(t), 0) / 12)
    const dias = ts.reduce((s, t) => s + t.diasPractica, 0)
    // Las del año cerrado se consignan al fondo; las del año en que termina
    // el contrato se pagan directo en la liquidación.
    const cierraAnio = anio < fin.y
    cesantias.push({
      concepto: 'Cesantías',
      periodo: String(anio),
      monto,
      fechaIso: cierraAnio ? `${anio + 1}-02-14` : null,
    })
    intereses.push({
      concepto: 'Intereses a las cesantías',
      periodo: String(anio),
      monto: redondear((monto * TASA_INTERESES_CESANTIAS * dias) / 360),
      fechaIso: cierraAnio ? `${anio + 1}-01-31` : null,
    })
  }

  const vacaciones: PagoPrestacion = {
    concepto: 'Vacaciones compensadas',
    periodo: `${tramos.reduce((s, t) => s + t.diasPractica, 0)} días de práctica`,
    monto: redondear(tramos.reduce((s, t) => s + t.apoyoPractica, 0) / 24),
    fechaIso: null,
  }

  const suma = (xs: { monto: number }[]) => xs.reduce((s, x) => s + x.monto, 0)
  const bruto = tramos.reduce((s, t) => s + t.bruto, 0)
  const descuentos = tramos.reduce((s, t) => s + t.descuentos, 0)
  const neto = bruto - descuentos
  const prestaciones = suma(prima) + suma(cesantias) + suma(intereses) + vacaciones.monto

  return {
    inicioIso: toIso(inicio),
    finIso,
    nombreAuxilio: nombreAuxilio(entrada.trabajo),
    tramos,
    mesArranque: tramos[0],
    mesTipico: tramos.find((t) => t.completo && t.diasLectiva === 0) ?? null,
    prima,
    cesantias,
    intereses,
    vacaciones,
    totales: {
      diasPractica: tramos.reduce((s, t) => s + t.diasPractica, 0),
      bruto,
      descuentos,
      neto,
      prestaciones,
      total: neto + prestaciones,
    },
    anios: [...porAnio.keys()].map(valoresDelAnio),
  }
}
