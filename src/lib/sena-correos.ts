// Asunto de los correos de etapa productiva según el lineamiento del
// instructor de seguimiento (ficha 3114731). El instructor busca los correos
// por asunto, así que el formato tiene que salir idéntico en cada envío:
// "Bitácora 4, CC 1101688000, Ficha 2658787, Nombre Apellido".
// Módulo puro: lo usa el script cliente de /ep.

export type TipoCorreo = 'bitacora' | 'visita'

export const TIPOS_CORREO: Record<TipoCorreo, { prefijo: string; max: number }> = {
  bitacora: { prefijo: 'Bitácora', max: 6 },
  visita: { prefijo: 'Formato Visita', max: 3 },
}

export interface DatosAsunto {
  tipo: TipoCorreo
  numero: number
  cc: string
  ficha: string
  nombre: string
}

// La cédula y la ficha se copian a menudo con puntos o espacios ("1.101.688.000"):
// el ejemplo del lineamiento las trae sin separadores, y así se buscan.
export const soloDigitos = (s: string) => s.replace(/\D/g, '')

const limpiarNombre = (s: string) => s.trim().replace(/\s+/g, ' ')

// Devuelve el asunto o la lista de campos que faltan, para que la UI diga qué
// completar en vez de copiar un asunto a medias que el instructor no encuentra.
export function asuntoCorreo(d: DatosAsunto): { ok: true; asunto: string } | { ok: false; faltan: string[] } {
  const tipo = TIPOS_CORREO[d.tipo]
  const cc = soloDigitos(d.cc)
  const ficha = soloDigitos(d.ficha)
  const nombre = limpiarNombre(d.nombre)

  const faltan: string[] = []
  if (!Number.isInteger(d.numero) || d.numero < 1 || d.numero > tipo.max) faltan.push('número')
  if (!cc) faltan.push('CC')
  if (!ficha) faltan.push('ficha')
  if (!nombre) faltan.push('nombre y apellido')
  if (faltan.length) return { ok: false, faltan }

  return { ok: true, asunto: `${tipo.prefijo} ${d.numero}, CC ${cc}, Ficha ${ficha}, ${nombre}` }
}
