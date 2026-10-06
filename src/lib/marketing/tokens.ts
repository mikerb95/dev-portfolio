// Tokens de los enlaces de marketing. Solo-servidor (node:crypto).
//
// Baja: HMAC del id del suscriptor. No caduca a propósito: la Ley 1581 pide
// que la baja funcione siempre, y un enlace de un correo de hace un año tiene
// que seguir sirviendo. No da acceso a nada más que a darse de baja, así que
// un enlace reenviado no expone nada.
//
// Confirmación (doble opt-in): token aleatorio de un solo uso; en la base solo
// se guarda su hash, como los de invitación del portal.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serverEnv } from '../env'

/**
 * Secreto de los enlaces de baja. Sin él no se envía ninguna campaña: un
 * correo promocional sin baja funcional incumple la ley, así que aquí se falla
 * cerrado (al revés que la observabilidad).
 */
export const secretoMarketing = (): string | null => serverEnv('MARKETING_SECRET') ?? null

export function tokenBaja(suscriptorId: number, secreto: string): string {
  return createHmac('sha256', secreto).update(`baja:${suscriptorId}`, 'utf8').digest('hex').slice(0, 32)
}

export function verificarTokenBaja(suscriptorId: number, token: unknown, secreto: string): boolean {
  if (typeof token !== 'string' || !Number.isInteger(suscriptorId) || suscriptorId <= 0) return false
  const a = Buffer.from(tokenBaja(suscriptorId, secreto), 'utf8')
  const b = Buffer.from(token, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const nuevoTokenConfirmacion = (): string => randomBytes(24).toString('base64url')

export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex')
