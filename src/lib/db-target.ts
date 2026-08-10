// ¿A qué base apunta este proceso? Módulo puro: lo usa `db/index.ts` para
// etiquetarse a sí mismo y `/api/health` para publicarlo, y las pruebas de
// carga de `lab/k6` para negarse a arrancar si el servidor que van a maltratar
// está leyendo de una base remota.
//
// El guardarraíl anterior solo miraba la URL del SERVIDOR ('nunca
// codebymike.tech'), y eso deja pasar el caso que de verdad duele: k6 contra
// localhost, pero con el dev server conectado a la Turso de producción. Así se
// agotó la cuota de lecturas (ago 2026).

/** Hosts que cuentan como locales. `file:`/`:memory:` también lo son. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', 'host.docker.internal', 'sqld', 'db'])

/**
 * ¿La URL apunta a una base local (sqld en Docker, archivo, memoria)?
 *
 * Ante cualquier duda devuelve `false`: una URL que no sabemos leer se trata
 * como remota. Es el único sentido seguro para el error, porque un falso
 * "local" es exactamente el permiso para lanzar mil usuarios sintéticos contra
 * la base buena.
 */
export function isLocalDbUrl(url: string | undefined | null): boolean {
  if (!url) return false
  const raw = url.trim()
  if (raw === ':memory:') return true
  if (raw.startsWith('file:') || raw.startsWith('/') || raw.startsWith('./')) return true
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return LOCAL_HOSTS.has(host)
  } catch {
    return false
  }
}
