// Contenido de una campaña: validación y paso de texto a HTML de correo.
// Módulo puro: lo usa el servidor al enviar y el panel para la vista previa
// en vivo, así que lo que se ve antes de disparar es exactamente lo que sale.
//
// El formato es deliberadamente pobre (párrafos, **negrita**, [enlace](url)):
// un editor rico mete HTML que Outlook rompe y que hay que sanear. Con esto no
// hay HTML de entrada, todo se escapa y solo se generan las tres etiquetas.

export type CampanaContenido = {
  asunto: string
  preheader?: string | null
  titulo: string
  cuerpo: string
  botonTexto?: string | null
  botonUrl?: string | null
}

export const LIMITES = { asunto: 120, preheader: 160, titulo: 140, cuerpo: 8000, botonTexto: 40, botonUrl: 500 }

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Solo https: un `javascript:` o un `http:` no tienen por qué salir en un correo mío. */
export function urlSegura(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Errores de la campaña, en lenguaje del panel. Vacío = se puede enviar. */
export function validarCampana(c: CampanaContenido): string[] {
  const errores: string[] = []
  if (!c.asunto?.trim()) errores.push('Falta el asunto.')
  if (!c.titulo?.trim()) errores.push('Falta el título.')
  if (!c.cuerpo?.trim()) errores.push('Falta el texto del correo.')
  for (const k of Object.keys(LIMITES) as (keyof typeof LIMITES)[]) {
    const v = c[k]
    if (typeof v === 'string' && v.length > LIMITES[k]) errores.push(`El campo "${k}" pasa de ${LIMITES[k]} caracteres.`)
  }
  const hayTexto = !!c.botonTexto?.trim()
  const hayUrl = !!c.botonUrl?.trim()
  if (hayTexto !== hayUrl) errores.push('El botón necesita texto y enlace, o ninguno de los dos.')
  if (hayUrl && !urlSegura(c.botonUrl)) errores.push('El enlace del botón tiene que empezar por https://.')
  for (const m of c.cuerpo?.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g) ?? []) {
    if (!urlSegura(m[2])) errores.push(`El enlace "${m[1]}" tiene que empezar por https://.`)
  }
  return errores
}

/** Una línea de texto a HTML en línea: escapa todo y luego aplica el formato. */
function enLinea(s: string, colorEnlace: string): string {
  let out = escapar(s)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // El texto ya está escapado, así que la URL capturada también: se valida
  // sobre la versión sin escapar y se vuelve a escapar para el atributo.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (todo, texto: string, url: string) => {
    const real = urlSegura(url.replace(/&amp;/g, '&'))
    return real ? `<a href="${escapar(real)}" style="color:${colorEnlace};">${texto}</a>` : texto
  })
  return out
}

/** Párrafos HTML del cuerpo. Una línea en blanco separa párrafos; un salto simple es <br>. */
export function cuerpoAHtml(cuerpo: string, colorEnlace: string): string[] {
  return cuerpo
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('\n').map((l) => enLinea(l, colorEnlace)).join('<br>'))
}

/** Versión en texto plano: los enlaces quedan como "texto (url)". */
export function cuerpoATexto(cuerpo: string): string[] {
  return cuerpo
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)'))
}

/**
 * Texto de consentimiento que se guarda con cada suscriptor. Si cambia, se
 * cambia aquí y las filas viejas conservan el que vio cada persona.
 */
export const TEXTO_CONSENTIMIENTO =
  'Autorizo a CodeByMike (Mike, codebymike.net) a enviarme por correo novedades, promociones y contenido sobre sus servicios de desarrollo de software. Puedo darme de baja en cualquier momento desde el enlace de cada correo.'

export const TEXTO_CONSENTIMIENTO_EN =
  'I authorize CodeByMike (Mike, codebymike.net) to email me news, promotions and content about his software development services. I can unsubscribe at any time from the link in every email.'
