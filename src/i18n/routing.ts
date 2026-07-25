// Helpers puros de ruteo de idioma. Sin `node:crypto`, sin `../db`, sin nada
// con efectos: los importa tanto el middleware (servidor) como el selector de
// idioma en el navegador.
//
// CRÍTICO: `delocalizePath` / `isPrivateCanonicalPath` son los que usa el
// middleware para clasificar una ruta ANTES de decidir rate limit, gate de
// admin o veto de demo. Los guards existentes (`lib/security/paths.ts`,
// `lib/demo.ts`, `lib/portal/paths.ts`) comparan contra rutas literales sin
// prefijo — son ciegos a `/en/`. Si un request a `/en/admin` llegara a esos
// guards sin normalizar antes, el gate de admin nunca se activaría: un
// bypass real, no cosmético. Ver docs/plan-i18n-en.md §3.

import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'

const LOCALE_PREFIX_RE = /^\/(en)(\/|$)/

/** ¿Qué locale indica esta URL? Cualquier cosa que no sea `/en` es español. */
export function getLocaleFromUrl(pathname: string): Locale {
  const match = LOCALE_PREFIX_RE.exec(pathname)
  return match ? (match[1] as Locale) : DEFAULT_LOCALE
}

/**
 * Quita el prefijo de idioma y deja la ruta "canónica" (la misma que en
 * español, sin prefijo). Es la única función que deben usar los guards de
 * seguridad para clasificar una ruta — nunca el pathname crudo.
 */
export function delocalizePath(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX_RE, '/').replace(/\/{2,}/g, '/')
  return stripped === '' ? '/' : stripped
}

/** Antepone el prefijo de idioma. `es` no lleva prefijo (es el default). */
export function localizePath(pathname: string, locale: Locale): string {
  const canonical = delocalizePath(pathname)
  if (locale === DEFAULT_LOCALE) return canonical
  return canonical === '/' ? `/${locale}` : `/${locale}${canonical}`
}

/** URL equivalente de una ruta en cada idioma soportado. */
export function alternateUrls(pathname: string): Record<Locale, string> {
  const canonical = delocalizePath(pathname)
  return Object.fromEntries(LOCALES.map((l) => [l, localizePath(canonical, l)])) as Record<Locale, string>
}

// Rutas que NUNCA existen en otro idioma que no sea el default: admin, API,
// portal de clientes, cobros de campo y los tres gates de login. No son
// contenido (traducirlas no tiene sentido) y, sobre todo, cada guard de
// seguridad las compara por ruta literal — permitir un prefijo /en/ delante
// crearía una copia de cada una sin vigilancia.
const PRIVATE_EXACT = new Set(['/login', '/logout', '/entrar', '/docs/presentacion'])
const PRIVATE_PREFIXES = ['/admin', '/api', '/portal', '/cobrar']

/** ¿Esta ruta CANÓNICA (ya sin prefijo de idioma) es privada? */
export function isPrivateCanonicalPath(canonicalPath: string): boolean {
  if (PRIVATE_EXACT.has(canonicalPath)) return true
  return PRIVATE_PREFIXES.some((p) => canonicalPath === p || canonicalPath.startsWith(`${p}/`))
}

/**
 * ¿Este request, tal como llegó (con o sin prefijo /en/), apunta a una ruta
 * privada bajo un idioma no-default? Esa combinación no debe existir nunca:
 * el middleware la corta con 404 antes de clasificar nada más.
 */
export function isLocalizedPrivateRequest(pathname: string): boolean {
  const locale = getLocaleFromUrl(pathname)
  if (locale === DEFAULT_LOCALE) return false
  return isPrivateCanonicalPath(delocalizePath(pathname))
}
