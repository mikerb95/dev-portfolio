// Reconstruye una conversación del asistente para pintarla en el dashboard a
// partir del historial que se guarda para la API (solo por anexión). Así no
// hace falta una segunda copia "para la pantalla" que pueda desalinearse.
//
// Un turno empieza con cada pregunta de Mike: un mensaje de usuario de texto,
// o el rechazo de una propuesta con indicaciones ("cámbiale la fecha"), que
// viaja como tool_result y lleva el prefijo PREFIJO_CAMBIOS.
//
// Módulo puro: lo importan el servidor y las pruebas.

export const PREFIJO_CAMBIOS = 'Mike no aprobó la propuesta y pidió cambios: '

export type Turno = {
  pregunta: string
  respuesta: string
  /** Herramientas que consultó en el turno, en orden y sin repetir. */
  pasos: string[]
}

type Bloque = { type?: string; text?: string; name?: string; content?: unknown; is_error?: boolean }
type Mensaje = { role: 'user' | 'assistant'; content: string | Bloque[] }

function indicacion(bloques: Bloque[]): string | null {
  for (const b of bloques) {
    if (b.type !== 'tool_result' || !b.is_error || typeof b.content !== 'string') continue
    if (!b.content.startsWith(PREFIJO_CAMBIOS)) continue
    const resto = b.content.slice(PREFIJO_CAMBIOS.length)
    const m = resto.match(/^"([\s\S]*)"\./)
    return m ? m[1]! : resto
  }
  return null
}

export function turnosDe(mensajes: Mensaje[]): Turno[] {
  const turnos: Turno[] = []
  let actual: Turno | null = null
  const abrir = (pregunta: string) => {
    actual = { pregunta, respuesta: '', pasos: [] }
    turnos.push(actual)
  }

  for (const m of mensajes) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') abrir(m.content)
      else {
        const texto = m.content.find((b) => b.type === 'text' && b.text)?.text
        const cambio = indicacion(m.content)
        if (texto && !m.content.some((b) => b.type === 'tool_result')) abrir(texto)
        else if (cambio) abrir(cambio)
      }
      continue
    }
    if (!actual || typeof m.content === 'string') continue
    const t = actual as Turno
    for (const b of m.content) {
      if (b.type === 'text' && b.text?.trim()) t.respuesta = t.respuesta ? `${t.respuesta}\n\n${b.text.trim()}` : b.text.trim()
      if (b.type === 'tool_use' && b.name && !t.pasos.includes(b.name)) t.pasos.push(b.name)
    }
  }
  return turnos
}

/** Preguntas de Mike en la conversación. */
export const contarTurnos = (mensajes: Mensaje[]) => turnosDe(mensajes).length
