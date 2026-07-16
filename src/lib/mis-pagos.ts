// Resolución del link firmado del histórico (/mis-pagos?r=…&t=…).
//
// El link lleva DOS valores derivados del teléfono, nunca el número:
//   r = phoneRef(phone)      → identificador opaco, dice QUÉ historial se pide
//   t = historyToken(phone)  → credencial, prueba que el link salió de mí
// Ambos son HMAC del mismo secreto pero de dominios distintos, así que conocer
// `r` (que viaja en la URL y puede quedar en logs) no permite deducir `t`.

import { distinctPhones } from './cobros-db'
import { phoneRef, verifyHistoryToken } from './cobros-crypto'

export type ResolveResult =
  | { ok: true; phone: string }
  | { ok: false; reason: 'sin_secreto' | 'sin_params' | 'no_encontrado' | 'token_invalido' }

/**
 * Devuelve el teléfono dueño del link, o por qué no.
 *
 * El identificador es irreversible, así que se resuelve recalculando el HMAC de
 * cada teléfono con cobros y comparando. La lista es pequeña (mis clientes de
 * campo) y solo se recorre cuando alguien abre su link.
 */
export async function resolvePhoneFromLink(
  r: string | null,
  t: string | null,
  secret: string | undefined,
): Promise<ResolveResult> {
  if (!secret) return { ok: false, reason: 'sin_secreto' }
  if (!r || !t) return { ok: false, reason: 'sin_params' }

  const phones = await distinctPhones()
  const phone = phones.find((p) => phoneRef(p, secret) === r)
  if (!phone) return { ok: false, reason: 'no_encontrado' }

  // El identificador acierta pero el token no: alguien reusó una URL a medias o
  // está probando. Se distingue del caso anterior solo para el registro interno;
  // la página muestra el mismo mensaje en ambos.
  if (!verifyHistoryToken(phone, t, secret)) return { ok: false, reason: 'token_invalido' }

  return { ok: true, phone }
}
