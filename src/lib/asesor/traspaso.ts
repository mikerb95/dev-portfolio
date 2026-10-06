// Traspaso del estimado de la portada a la burbuja de WhatsApp (RF-037).
//
// El campo "Cuéntame qué necesitas" del hero hace la PRIMERA vuelta de una
// conversación con el asesor (mismo endpoint, misma guardia, mismo tope). Si
// la persona quiere seguir preguntando, no se abre una conversación nueva: la
// vuelta que ya pagó pasa a la burbuja tal cual, con sus cálculos (para que el
// servidor los vuelva a ejecutar en la siguiente pregunta), sus cifras
// marcadas y el token del asesor en vivo si Mike ya fue avisado.
//
// Módulo PURO e isomorfo: lo importan el script del hero y el de la burbuja,
// y tests/asesor-portada.test.ts lo prueba sin DOM.

/** Lo que devuelve POST /api/asesor y el hero necesita conservar. */
export type RespuestaAsesor = {
  texto: string
  whatsapp?: string | null
  contacto?: boolean
  calculos?: unknown[]
  cifras?: string[]
  conversacion?: string
}

/** Estado que la burbuja guarda en sessionStorage (WhatsappFab.astro). */
export type EstadoTraspaso = {
  mensajes: { rol: 'usuario' | 'asesor'; texto: string }[]
  calculos: unknown[]
  whatsapp: string | null
  marcas: Record<string, string[]>
  contacto: 'no' | 'visible'
  conversacion?: string
}

/** Nombre del evento con el que el hero le entrega la conversación a la burbuja. */
export const EVENTO_TRASPASO = 'asesor:continuar'

/**
 * Arma el estado de la burbuja a partir de la pregunta del hero y la
 * respuesta del servidor. La respuesta queda en el índice 1 (la pregunta es
 * el 0), y ahí van sus cifras calculadas para que la burbuja pinte la marca
 * "Calculado con el tarifario" igual que si la vuelta hubiera ocurrido dentro.
 */
export function armarTraspaso(pregunta: string, r: RespuestaAsesor): EstadoTraspaso {
  const estado: EstadoTraspaso = {
    mensajes: [
      { rol: 'usuario', texto: pregunta },
      { rol: 'asesor', texto: r.texto },
    ],
    calculos: Array.isArray(r.calculos) ? r.calculos : [],
    whatsapp: r.whatsapp ?? null,
    marcas: r.cifras?.length ? { '1': r.cifras } : {},
    contacto: r.contacto ? 'visible' : 'no',
  }
  if (r.conversacion) estado.conversacion = r.conversacion
  return estado
}
