// Guardia de cifras: toda cantidad de dinero que el asistente escriba en un
// borrador tiene que salir de un cálculo (calculo-cotizacion.ts). Si aparece
// una que no, el borrador se rechaza y el agente lo rehace con la lista de
// cifras inventadas a la vista.
//
// Solo se miran cantidades MARCADAS como dinero ($, US$, COP, USD, "millones",
// "mil"): "20 personas", "8 horas", "50 %" o "15 días" no son precio y no
// deben disparar la guardia. Se aceptan las dos convenciones de separadores
// (es: 1.500.000 y 1,5 millones; en: 1,500 y 1.5k).
//
// Módulo PURO.

export type CifraEncontrada = {
  texto: string
  valor: number
  /** Precisión con la que se escribió: "4,8 millones" admite ±50.000. */
  tolerancia: number
}

const MULTIPLICADOR: Record<string, number> = {
  millones: 1e6,
  millón: 1e6,
  millon: 1e6,
  m: 1e6,
  mil: 1e3,
  k: 1e3,
}

// $ o US$ delante, o COP/USD/millones/mil/M/k detrás (al menos una marca).
const PATRON =
  /(US\$|COP\s?\$|\$)?\s?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)(?:\s?(millones|millón|millon|mil|M|k)\b)?(?:\s?(COP|USD|pesos|dólares|dolares))?/gi

/** Lee un número con separadores de miles o un decimal corto. Devuelve [valor, decimales]. */
function leerNumero(crudo: string): [number, number] {
  if (/^\d{1,3}([.,]\d{3})+$/.test(crudo)) return [Number(crudo.replace(/[.,]/g, '')), 0]
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(crudo)
  if (!m) return [NaN, 0]
  const dec = m[2] ?? ''
  return [Number(`${m[1]}.${dec || '0'}`), dec.length]
}

export function extraerCifras(texto: string): CifraEncontrada[] {
  const out: CifraEncontrada[] = []
  for (const m of texto.matchAll(PATRON)) {
    const [entero, prefijo, numero, mult, sufijo] = m
    if (!prefijo && !mult && !sufijo) continue
    // "mil" y "M" sueltos sin moneda son ambiguos ("2 mil personas"): solo
    // cuentan si además hay una marca de dinero.
    if (!prefijo && !sufijo && mult && !/^millon|^millón/i.test(mult)) continue
    const [base, decimales] = leerNumero(numero!)
    if (!Number.isFinite(base)) continue
    const factor = mult ? MULTIPLICADOR[mult.toLowerCase()] ?? 1 : 1
    const valor = Math.round(base * factor)
    const tolerancia = mult ? (factor / 10 ** decimales) / 2 : 0
    out.push({ texto: entero.trim(), valor, tolerancia })
  }
  return out
}

export type ResultadoGuardia = { ok: boolean; inventadas: CifraEncontrada[] }

/** Compara las cifras de dinero del texto con las que permiten los cálculos. */
export function verificarCifras(texto: string, permitidas: readonly number[]): ResultadoGuardia {
  const inventadas = extraerCifras(texto).filter(
    (c) => !permitidas.some((p) => Math.abs(p - c.valor) <= c.tolerancia)
  )
  return { ok: inventadas.length === 0, inventadas }
}
