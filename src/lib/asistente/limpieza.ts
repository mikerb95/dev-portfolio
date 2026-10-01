// Limpieza de datos personales antes de mandar un texto a la API de Claude
// (docs/plan-asistente.md, "Privacidad"). Lo que un cliente escribe puede traer
// su correo, su celular o su cédula, y el asistente no necesita ninguno de los
// tres para cotizar ni para resumir: se reemplazan por una marca.
//
// Lo delicado es no comerse los montos: "$1.500.000" o "presupuesto de
// 2.000.000" también son cifras con puntos. Por eso la cédula y el NIT solo se
// ocultan junto a su palabra clave, y el celular solo con la forma de un
// número colombiano.
//
// Módulo PURO.

export type Limpieza = {
  texto: string
  ocultos: { correos: number; telefonos: number; documentos: number }
}

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Celular (3xx) o fijo nacional (60x), con o sin +57, con espacios o guiones.
const TELEFONO = /(?:\+?57[\s-]?)?(?:3\d{2}|60\d)[\s-]?\d{3}[\s-]?\d{4}\b/g
// Cédula, NIT o documento: solo con la palabra delante.
const DOCUMENTO = /\b(c\.?\s?c\.?|c[ée]dula|nit|documento|identificaci[óo]n)(\s*(?:n[°ºo.]?|número|#|:)?\s*)\d[\d.-]{4,}\d/gi

export function limpiarDatosPersonales(texto: string): Limpieza {
  let correos = 0
  let telefonos = 0
  let documentos = 0
  const limpio = texto
    .replace(CORREO, () => (correos++, '[correo oculto]'))
    .replace(DOCUMENTO, (_m, palabra: string, sep: string) => (documentos++, `${palabra}${sep}[documento oculto]`))
    .replace(TELEFONO, () => (telefonos++, '[teléfono oculto]'))
  return { texto: limpio, ocultos: { correos, telefonos, documentos } }
}
