// El espejo: que la sala vea la página que el ponente está tocando.
//
// Tres beats del mazo no proyectan una lámina sino una página viva dentro de
// otro iframe (la demo del portal, `/status`, `/engineering`). El ponente las
// USA desde `/present-admin`: entra a la demo, navega el panel. Sin esto, cada
// asistente se quedaría mirando el formulario de entrada mientras él enseña
// otra cosa.
//
// LO QUE VIAJA ES LA URL, NO EL DOM. Duplicar el árbol entre N navegadores es
// otro problema y otro orden de fragilidad. Y no hace falta: todo resultado en
// esas tres páginas pasa por una navegación, así que con la URL la sala ve lo
// que importa. Lo que se pierde es el tecleo carácter a carácter, que además
// enseñaría cuántas letras tiene una contraseña.
//
// FUNCIONA PORQUE NO HAY SESIÓN QUE ESPEJAR. Al portal se entra por
// `/api/portal/demo`, que es un GET sin login y siempre el mismo usuario de
// mentira contra la base de demo: quien abra esa URL ve exactamente lo mismo,
// sea el ponente o cualquiera de la sala. Con un login real esto no
// funcionaría, y es una regla del runbook, no un detalle de implementación.
//
// Módulo puro: decide QUÉ se aplica y qué se descarta. Quién navega el iframe
// es cosa de la página.

/**
 * Lo que publica `/present-admin` y leen los seguidores.
 *
 * El `pos` no es decorativo: ata la URL a SU diapositiva, con la misma idea que
 * hace que el desplazamiento vuelva arriba solo al cambiar de beat. Sin él, la
 * URL del panel del portal seguiría aplicándose después de pasar a `/status` y
 * la sala vería la página que no es.
 */
export type Espejo = { pos: number; href: string; seq: number }

/** Protocolos que se aceptan. Un `javascript:` en un `location.replace` sería
 *  ejecución de código venida de la red, y ninguna página del mazo lo necesita. */
const PROTOCOLOS = ['http:', 'https:']

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/**
 * Valida lo que venga del almacén o de la red. Devuelve `null` ante cualquier
 * duda: quedarse sin espejo es una degradación (la sala ve la página de
 * arranque del beat), aplicar una URL rota es una pantalla en blanco delante
 * del tribunal.
 *
 * `base` es el origen desde el que se resuelve, para rechazar lo que apunte
 * fuera del sitio. La cadena entera (página, mazo, página viva) es de un solo
 * origen a propósito, y una URL ajena aquí solo puede venir de un error o de
 * alguien probando cosas.
 */
export function parsearEspejo(v: unknown, base: string): Espejo | null {
  const c = typeof v === 'string' ? seguroJson(v) : v
  if (!c || typeof c !== 'object') return null
  const { pos, href, seq } = c as Record<string, unknown>
  if (!entero(pos) || pos < 1) return null
  if (!entero(seq) || seq < 0) return null
  if (typeof href !== 'string' || !href) return null
  try {
    const u = new URL(href, base)
    if (!PROTOCOLOS.includes(u.protocol)) return null
    if (u.origin !== new URL(base).origin) return null
    return { pos, href: u.href, seq }
  } catch {
    return null
  }
}

function seguroJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * ¿Este mensaje sustituye al que ya teníamos?
 *
 * Solo si trae un `seq` mayor. El bus no garantiza orden ni entrega, y sin esta
 * comparación un mensaje que llegue tarde desharía una navegación buena: la
 * sala volvería al login justo después de que el ponente entrara al panel.
 */
export function esMasNuevo(entrante: Espejo, actual: Espejo | null): boolean {
  return !actual || entrante.seq > actual.seq
}

/**
 * Qué URL toca para la diapositiva en la que se está.
 *
 * `null` si el espejo pertenece a otra: no es un error, es la vuelta al estado
 * de arranque del beat. Cualquier camino que cambie de diapositiva la reinicia
 * por construcción, sin escrituras extra ni limpieza.
 */
export function urlPara(espejo: Espejo | null, pos: number): string | null {
  return espejo && espejo.pos === pos ? espejo.href : null
}

/**
 * ¿Hay que navegar el iframe?
 *
 * Tres noes, y el tercero es el que evita una pelea:
 *  · sin URL para esta diapositiva, no se toca nada;
 *  · si ya está ahí, tampoco (navegar recargaría la página en mitad de la demo);
 *  · si el iframe está en otro origen o todavía no ha navegado (`actual` es
 *    `null`), tampoco: el mazo monta esas páginas por su cuenta como parte de
 *    la coreografía de algunos beats, y pisarle la navegación mientras la está
 *    haciendo deja el iframe donde no toca.
 */
export function debeNavegar(pedida: string | null, actual: string | null): boolean {
  return pedida !== null && actual !== null && pedida !== actual
}

/**
 * El mensaje a publicar cuando la página viva ha navegado, o `null` si no hay
 * nada nuevo que contar.
 *
 * El `seq` lo lleva el emisor y solo sube. Se deriva del anterior en vez de
 * usar el reloj porque dos mensajes en el mismo milisegundo empatarían, y un
 * empate en `esMasNuevo` es un mensaje descartado.
 */
export function siguienteEspejo(
  pos: number,
  href: string | null,
  anterior: Espejo | null
): Espejo | null {
  if (!href) return null
  if (anterior && anterior.pos === pos && anterior.href === href) return null
  return { pos, href, seq: (anterior?.seq ?? 0) + 1 }
}
