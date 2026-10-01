// Texto de la notificación push que dispara un mensaje de /contact. Vive
// aparte del endpoint porque lo usan dos lados: /api/contact lo envía de
// verdad, y la página lo dibuja en el celular de ejemplo ("así me llega").
// Con una sola función, el celular no puede mostrar un aviso distinto del
// que llega.
//
// Módulo puro e isomorfo.

export const LARGO_VISTA_PREVIA = 140

export interface DatosAviso {
  name: string
  email: string
  subject?: string | null
  body: string
}

export function vistaPrevia(body: string): string {
  return body.length > LARGO_VISTA_PREVIA ? `${body.slice(0, LARGO_VISTA_PREVIA)}…` : body
}

export function avisoContacto(d: DatosAviso): { titulo: string; cuerpo: string } {
  return {
    titulo: `Nuevo mensaje de ${d.name}`,
    cuerpo: `${d.subject ? `${d.subject}\n` : ''}${vistaPrevia(d.body)}\n- ${d.email}`,
  }
}
