// Normalización y formato de teléfonos. Puro y testeable: no toca BD ni red.
//
// El teléfono es la llave del histórico de /mis-pagos y del vínculo con el CRM,
// así que TIENE que guardarse siempre en la misma forma canónica (E.164). Que
// '310 464 1228', '+573104641228' y '3104641228' terminen en filas distintas
// sería un histórico partido en tres.

/** País por defecto para números locales: Colombia. */
const DEFAULT_COUNTRY = '57'

/** Móviles colombianos: 10 dígitos que empiezan por 3. */
const CO_MOBILE_RE = /^3\d{9}$/

// E.164 admite hasta 15 dígitos; exigimos al menos 8 para descartar extensiones
// o números incompletos que no sirven para WhatsApp.
const E164_RE = /^\+[1-9]\d{7,14}$/

/**
 * Lleva un teléfono escrito a mano a E.164, o devuelve null si no es válido.
 *
 *   '3104641228'      → '+573104641228'
 *   '310 464 1228'    → '+573104641228'
 *   '+57 310 4641228' → '+573104641228'
 *   '(310) 464-1228'  → '+573104641228'
 *   '0057 310…'       → '+573104641228'   (prefijo internacional 00)
 *   '1234'            → null
 *
 * Solo asume Colombia para móviles locales de 10 dígitos. Cualquier otro país
 * debe escribirse con '+' explícito: adivinar el país de un número extranjero
 * sería peor que rechazarlo.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = DEFAULT_COUNTRY): string | null {
  if (typeof raw !== 'string') return null

  // El '+' solo tiene sentido al inicio: uno en medio ('310+4641228') es basura,
  // no un indicativo, y no se limpia silenciosamente.
  const s0 = raw.trim().replace(/[\s()\-.]/g, '')
  const hadPlus = s0.startsWith('+')
  const s = hadPlus ? s0.slice(1) : s0
  if (!/^\d+$/.test(s)) return null

  // Prefijo internacional marcado: '00' equivale a '+'.
  if (!hadPlus && s.startsWith('00')) return check(`+${s.slice(2)}`)

  if (hadPlus) return check(`+${s}`)

  // Sin '+': móvil colombiano de 10 dígitos, o el mismo con el indicativo pegado.
  if (CO_MOBILE_RE.test(s)) return check(`+${defaultCountry}${s}`)
  if (s.startsWith(defaultCountry) && CO_MOBILE_RE.test(s.slice(defaultCountry.length))) return check(`+${s}`)

  return null
}

const check = (e164: string): string | null => (E164_RE.test(e164) ? e164 : null)

/** ¿Ya está en E.164 canónico? Útil para validar lo que sale de la BD. */
export const isE164 = (s: unknown): s is string => typeof s === 'string' && E164_RE.test(s)

/**
 * Formato legible para la UI: '+57 310 464 1228'. Los colombianos se agrupan
 * 3-3-4 (como se escriben aquí); el resto se deja tal cual — inventar grupos
 * para un país que no conocemos confunde más de lo que ayuda.
 */
export function formatPhone(e164: string | null | undefined): string {
  if (!isE164(e164)) return e164 ?? ''
  const co = e164.match(/^\+57(\d{3})(\d{3})(\d{4})$/)
  return co ? `+57 ${co[1]} ${co[2]} ${co[3]}` : e164
}

/**
 * Enmascara para vistas públicas: '+57 310 ••• ••28'. Deja el prefijo y los
 * dos últimos dígitos, suficiente para que el dueño se reconozca y no para que
 * un tercero identifique el número.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!isE164(e164)) return '•••'
  const co = e164.match(/^\+57(\d{3})\d{5}(\d{2})$/)
  if (co) return `+57 ${co[1]} ••• ••${co[2]}`
  return `${e164.slice(0, 4)}••••${e164.slice(-2)}`
}

/** Dígitos sin '+' para la URL de wa.me ('+573104641228' → '573104641228'). */
export const waDigits = (e164: string): string => e164.replace(/^\+/, '')

/** Link de WhatsApp con el mensaje precargado. Sin API: lo abre tu propio WhatsApp. */
export const waLink = (e164: string, message: string): string =>
  `https://wa.me/${waDigits(e164)}?text=${encodeURIComponent(message)}`
