// Origen canónico del sitio.
//
// Existe porque el dominio cambió: el sitio nació en codebymike.net y desde
// sep 2026 vive en codebymike.net (el .tech redirige con 308 y sigue siendo
// válido en enlaces viejos). Antes de esto el literal estaba copiado en una
// docena de módulos - crons, correos, PDFs, alertas - y una migración de
// dominio significaba cazar cadenas sueltas.
//
// Solo se usa donde NO hay un request del que derivar el origen: correos,
// notificaciones ntfy, IndexNow, PDFs, y los fallbacks de `Astro.site`. Todo
// lo que sí nace de un request (redirect-url de Wompi, WebAuthn, enlaces
// relativos) sigue derivándose del Host real, que es lo que mantiene vivos los
// previews y `astro dev`.

import { serverEnv } from './env'

/** Origen de producción, sin barra final. */
export const SITE_ORIGIN = 'https://codebymike.net'

/** Host de producción, sin esquema. Para textos de UI y User-Agents. */
export const SITE_HOST = 'codebymike.net'

/**
 * Origen absoluto para armar enlaces fuera de un request. `AUTH_URL` manda
 * cuando existe (previews y despliegues con dominio propio); si no, el de
 * producción.
 */
export const siteUrl = (): string => (serverEnv('AUTH_URL') ?? SITE_ORIGIN).replace(/\/$/, '')
