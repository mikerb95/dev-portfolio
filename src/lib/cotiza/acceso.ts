// Acceso por PIN a Cotiza (RF-220, docs/plan-cotiza.md).
//
// Por qué existe
// --------------
// Cotiza se usa en la calle o en la oficina de un cliente, desde un equipo que
// no es el mío o con el celular, donde depender de GitHub OAuth o de la YubiKey
// es justo lo que estorba. El PIN quita esa dependencia.
//
// Por qué es aceptable una llave tan débil
// ----------------------------------------
// Cuatro dígitos son 10.000 combinaciones (decisión de Mike, contra la
// recomendación de seis). Lo que la hace tolerable son tres cosas, y las tres
// se prueban en tests/cotiza-acceso.test.ts:
//
//  1. ALCANCE. Abre las rutas de Cotiza y ninguna más. La bóveda, los cobros,
//     las finanzas y los clientes siguen detrás de GitHub y de la allowlist.
//  2. FRENOS. 5 fallos por IP cierran esa IP 15 minutos, y 10 fallos en una
//     hora sumando todas las IP apagan la puerta del PIN durante una hora. Con
//     eso, adivinar el PIN a ciegas toma meses, y cada intento deja rastro.
//  3. FALLA CERRADA. Es autorización, no observabilidad (misma excepción que la
//     revocación de sesiones en el middleware): si no se puede leer el PIN o
//     los contadores, el PIN no abre. GitHub sigue funcionando igual.
//
// Este módulo es puro (sin base de datos) porque lo carga el middleware y
// porque las decisiones de alcance y de frenos tienen que poder probarse sin
// montar nada. La parte con base vive en `pin-db.ts`.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COTIZA_COOKIE = 'cotiza_acceso'

/** Doce horas: una jornada de trabajo sin volver a teclearlo. */
export const COTIZA_TTL_SEG = 12 * 60 * 60

/** Clave de `app_settings` donde se guarda el hash del PIN, nunca el PIN. */
export const CLAVE_PIN = 'cotiza_pin'

/** Freno por IP: fallos permitidos y ventana. */
export const FALLOS_POR_IP = 5
export const VENTANA_IP_MS = 15 * 60_000

/** Freno general: fallos sumando todas las IP, ventana y cierre resultante. */
export const FALLOS_GLOBALES = 10
export const VENTANA_GLOBAL_MS = 60 * 60_000
export const CIERRE_MS = 60 * 60_000

/** Página propia de entrada; no es `/login`, que ofrece GitHub y la llave. */
export const RUTA_ENTRADA = '/cotiza/entrar'

/**
 * Rutas que abre el PIN. Patrones anclados y no un `startsWith('/admin/cotiza')`,
 * que abriría `/admin/cotizaciones` el día que alguien la creara sin pensar en
 * esta puerta. Los segmentos aceptan solo minúsculas, dígitos y guion: ni
 * puntos ni barras dobles, así que no hay forma de subir de directorio.
 */
const RUTAS_PIN: RegExp[] = [
  /^\/admin\/cotiza$/,
  /^\/admin\/cotiza\/[a-z0-9-]+$/,
  /^\/api\/admin\/cotiza(?:\/[a-z0-9-]+)+$/,
]

/** ¿Abre el PIN esta ruta CANÓNICA (sin prefijo de idioma ni barra final)? */
export function esRutaDeCotiza(canonicalPath: string): boolean {
  return RUTAS_PIN.some((re) => re.test(canonicalPath))
}

/** Exactamente cuatro dígitos ASCII. Nada de espacios, signos ni otros números Unicode. */
export function pinBienFormado(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]{4}$/.test(pin)
}

/**
 * Motivo para rechazar un PIN NUEVO, o null si sirve. Con cuatro dígitos, los
 * frenos solo funcionan si el PIN no está entre los primeros que prueba
 * cualquiera: repetidos (0000, 7777), escaleras (1234, 9876) y parejas
 * (1212). No aplica al entrar, solo al fijarlo en Ajustes.
 */
export function problemaDePin(pin: unknown): string | null {
  if (!pinBienFormado(pin)) return 'El PIN son 4 dígitos.'
  const d = [...pin].map(Number)
  if (d.every((x) => x === d[0])) return 'No uses el mismo dígito cuatro veces.'
  const pasos = [d[1] - d[0], d[2] - d[1], d[3] - d[2]]
  if (pasos.every((p) => p === 1) || pasos.every((p) => p === -1)) return 'No uses una escalera como 1234 o 9876.'
  if (d[0] === d[2] && d[1] === d[3]) return 'No uses una pareja repetida como 1212.'
  return null
}

/**
 * Huella corta del hash guardado. Entra en la firma de la cookie: cambiar el
 * PIN cambia el hash (la sal es nueva cada vez) y con él la huella, así que
 * todas las cookies emitidas con el PIN anterior dejan de valer solas, sin
 * tabla de sesiones que limpiar.
 */
export function versionDePin(hashGuardado: string): string {
  return createHash('sha256').update(hashGuardado).digest('hex').slice(0, 16)
}

function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function firma(secreto: string, version: string, expiraMs: number): string {
  // Prefijo propio: esta firma no vale como acceso de la sustentación
  // (`sust:acceso:v1`) ni como ningún otro pase firmado con la misma clave.
  return createHmac('sha256', secreto).update(`cotiza:acceso:v1:${version}:${expiraMs}`).digest('hex')
}

/** `<expiraMs>.<firma>`. Se emite solo tras comprobar el PIN. */
export function firmarAccesoCotiza(secreto: string, version: string, ahoraMs = Date.now()): string {
  const expira = ahoraMs + COTIZA_TTL_SEG * 1000
  return `${expira}.${firma(secreto, version, expira)}`
}

/**
 * ¿Vale esta cookie ahora, con el PIN vigente? Sin secreto o sin PIN guardado
 * nunca vale: la ausencia de configuración cierra la puerta, no la abre.
 */
export function verificarAccesoCotiza(
  token: string | null | undefined,
  secreto: string | null | undefined,
  version: string | null | undefined,
  ahoraMs = Date.now()
): boolean {
  if (!token || !secreto || !version) return false

  const corte = token.indexOf('.')
  if (corte <= 0) return false

  const crudo = token.slice(0, corte)
  if (!/^[0-9]+$/.test(crudo)) return false
  const expira = Number(crudo)
  if (!Number.isSafeInteger(expira) || expira <= ahoraMs) return false
  // Una cookie que dice vencer más allá del TTL no la emitió este código.
  if (expira > ahoraMs + COTIZA_TTL_SEG * 1000) return false

  return igualSeguro(token.slice(corte + 1), firma(secreto, version, expira))
}

export type EstadoFrenos = {
  fallosIp: number
  /** Fin del cierre general en ms, o null si la puerta está abierta. */
  cerradaHastaMs: number | null
}

export type DecisionIntento =
  | { tipo: 'permitido' }
  | { tipo: 'ip_frenada' }
  | { tipo: 'puerta_cerrada'; reintentarEnSeg: number }

/** ¿Se deja probar un PIN con este estado de los frenos? */
export function decidirIntento(estado: EstadoFrenos, ahoraMs = Date.now()): DecisionIntento {
  if (estado.cerradaHastaMs !== null && estado.cerradaHastaMs > ahoraMs) {
    return { tipo: 'puerta_cerrada', reintentarEnSeg: Math.ceil((estado.cerradaHastaMs - ahoraMs) / 1000) }
  }
  if (estado.fallosIp >= FALLOS_POR_IP) return { tipo: 'ip_frenada' }
  return { tipo: 'permitido' }
}

/**
 * ¿Este fallo es el que cierra la puerta? Exactamente el que alcanza el
 * límite, para que el cierre (y el aviso a ntfy) ocurra una vez y no en cada
 * fallo posterior de la misma hora.
 */
export function cierraLaPuerta(fallosGlobalesTrasEsteFallo: number): boolean {
  return fallosGlobalesTrasEsteFallo === FALLOS_GLOBALES
}
