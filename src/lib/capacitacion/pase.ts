import type { AstroCookies } from 'astro'
import { TRAINING_COOKIE, verifyTrainingPass } from './access'
import { codigoSigueVivo } from './repo'
import { serverEnv } from '../env'

/**
 * ¿Este visitante tiene pase vigente del banco de recursos?
 *
 * Dos comprobaciones, no una: la firma (barata, sin base) y que el código de
 * grupo siga vivo (una query). La segunda es la que permite cortar el acceso de
 * una cohorte sin esperar a que venzan sus cookies, y por eso se hace en cada
 * request en vez de confiar en el TTL del token.
 *
 * Fail-CLOSED ante un error de base: sin poder confirmar que el código sigue
 * vivo, el visitante ve el banco público. Es el único punto del repo donde no
 * se abre ante el fallo, y la razón es que abrir aquí publicaría material
 * restringido en una página que la CDN puede cachear.
 */
export async function tienePaseCapacitacion(cookies: AstroCookies): Promise<boolean> {
  const secret = serverEnv('TRAINING_ACCESS_SECRET')
  const token = cookies.get(TRAINING_COOKIE)?.value
  const pase = verifyTrainingPass(secret, token)
  if (!pase) return false

  try {
    return await codigoSigueVivo(pase.codeId)
  } catch (err) {
    console.error('[capacitacion] no se pudo revalidar el código del pase', err)
    return false
  }
}
