import { timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'

// Autenticación de los crons externos (cron-job.org pega a /api/cron/* con
// `Authorization: Bearer <CRON_SECRET>`).
//
// Vivía copiada dentro de cada endpoint y las copias se desincronizaron: unas
// comparaban en tiempo constante y otras con un `!==` normal, mientras
// CLAUDE.md documentaba que todas usaban timingSafeEqual. La comparación vive
// aquí para que "cómo se valida un cron" tenga una sola respuesta en el repo.
//
// El secreto se lee con `serverEnv` y no con `import.meta.env` directo: este
// módulo lo importan endpoints que corren tanto en el dev server (donde el
// .env solo llega a import.meta.env) como en Vercel (donde solo llega a
// process.env).

/**
 * ¿La cabecera `Authorization` corresponde al CRON_SECRET?
 *
 * Comparación en tiempo constante: `timingSafeEqual` exige buffers del mismo
 * tamaño (lanza si difieren), así que la longitud se filtra antes. Esa
 * comprobación previa filtra la longitud del header, no la del secreto, que es
 * lo único que habría que proteger.
 *
 * Devuelve false si falta el secreto en el entorno, y nunca lanza: un cron sin
 * configurar responde 401, no 500.
 */
export function cronSecretOk(auth: string | null | undefined): boolean {
  const secret = serverEnv('CRON_SECRET')
  if (!secret || !auth) return false
  const recibido = Buffer.from(auth)
  const esperado = Buffer.from(`Bearer ${secret}`)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}
