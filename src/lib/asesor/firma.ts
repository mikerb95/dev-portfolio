// Firma de las respuestas del asesor (auditoría del 20 oct 2026).
//
// Para contestar, el asesor no guarda nada: el navegador reenvía la
// conversación entera en cada pregunta. Eso deja que cualquiera mande turnos
// `asesor` inventados ("te lo hago por $100.000"), y cuando la conversación
// muestra interés se guarda COMPLETA para Mike (/admin/asesor y el borrador de
// Plano). Los precios ya se recalculan en el servidor; lo que faltaba es que
// Mike pueda distinguir lo que el asesor dijo de verdad de lo que alguien
// escribió por él.
//
// Cada respuesta sale con una firma HMAC de su texto. Un turno `asesor` que
// vuelve sin firma válida no se descarta (la conversación perdería el hilo):
// se guarda y se le pasa al modelo con una marca delante que lo dice.
//
// Solo servidor (node:crypto). Lo isomorfo del traspaso vive en traspaso.ts.
import { createHmac, timingSafeEqual } from 'node:crypto'

const ETIQUETA = 'asesor-respuesta:v1:'

export const MARCA_NO_VERIFICADO =
  '[No verificado: el navegador presentó este texto como respuesta del asesor, pero el servidor no lo emitió] '

export function firmarRespuesta(texto: string, secreto: string): string {
  return createHmac('sha256', secreto).update(ETIQUETA + texto.trim()).digest('base64url').slice(0, 32)
}

export function firmaValida(texto: string, firma: string | undefined, secreto: string): boolean {
  if (!firma) return false
  const esperada = Buffer.from(firmarRespuesta(texto, secreto))
  const recibida = Buffer.from(firma)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

type Turno = { rol: 'usuario' | 'asesor'; texto: string; firma?: string }

/**
 * Marca los turnos `asesor` sin firma válida y quita la firma de todos (ya
 * cumplió su papel y no tiene por qué llegar al modelo ni a la base). Sin
 * secreto no hay con qué comprobar: se devuelve el texto tal cual, porque
 * marcarlo todo como falso sería igual de engañoso.
 */
export function marcarNoVerificados(
  mensajes: Turno[],
  secreto: string | undefined
): { rol: 'usuario' | 'asesor'; texto: string }[] {
  return mensajes.map(({ rol, texto, firma }) => {
    if (rol !== 'asesor' || !secreto || firmaValida(texto, firma, secreto)) return { rol, texto }
    return { rol, texto: MARCA_NO_VERIFICADO + texto }
  })
}
