import { describe, it, expect, vi, beforeEach } from 'vitest'

// distinctPhones toca la BD; aquí lo que se prueba es la lógica de resolución
// del link firmado, así que se sustituye por una lista fija.
const distinctPhones = vi.fn<() => Promise<string[]>>()
vi.mock('../src/lib/cobros-db', () => ({ distinctPhones: () => distinctPhones() }))

import { resolvePhoneFromLink } from '../src/lib/mis-pagos'
import { historyToken, phoneRef } from '../src/lib/cobros-crypto'

const SECRET = 'secreto-de-prueba'
const PHONE = '+573104641228'
const OTRO = '+573001112233'

const link = (phone: string, secret = SECRET) => ({
  r: phoneRef(phone, secret),
  t: historyToken(phone, secret),
})

beforeEach(() => {
  distinctPhones.mockResolvedValue([PHONE, OTRO])
})

describe('resolvePhoneFromLink', () => {
  it('resuelve el teléfono de un link legítimo', async () => {
    const { r, t } = link(PHONE)
    await expect(resolvePhoneFromLink(r, t, SECRET)).resolves.toEqual({ ok: true, phone: PHONE })
  })

  it('no confunde los links de dos clientes', async () => {
    const a = link(PHONE)
    const b = link(OTRO)
    await expect(resolvePhoneFromLink(b.r, b.t, SECRET)).resolves.toEqual({ ok: true, phone: OTRO })
    // El ataque que importa: mezclar el identificador de uno con el token del
    // otro no debe abrir NINGÚN historial.
    await expect(resolvePhoneFromLink(a.r, b.t, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'token_invalido',
    })
  })

  it('rechaza un identificador válido sin token válido', async () => {
    const { r } = link(PHONE)
    await expect(resolvePhoneFromLink(r, 'inventado', SECRET)).resolves.toEqual({
      ok: false,
      reason: 'token_invalido',
    })
    await expect(resolvePhoneFromLink(r, historyToken(PHONE, 'otro-secreto'), SECRET)).resolves.toEqual({
      ok: false,
      reason: 'token_invalido',
    })
  })

  it('rechaza un identificador desconocido', async () => {
    const { t } = link(PHONE)
    await expect(resolvePhoneFromLink('deadbeefdeadbeef', t, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'no_encontrado',
    })
  })

  it('exige ambos parámetros', async () => {
    const { r, t } = link(PHONE)
    await expect(resolvePhoneFromLink(null, t, SECRET)).resolves.toEqual({ ok: false, reason: 'sin_params' })
    await expect(resolvePhoneFromLink(r, null, SECRET)).resolves.toEqual({ ok: false, reason: 'sin_params' })
    await expect(resolvePhoneFromLink(null, null, SECRET)).resolves.toEqual({ ok: false, reason: 'sin_params' })
  })

  it('sin secreto no resuelve nada (no degrada a acceso abierto)', async () => {
    const { r, t } = link(PHONE)
    // Si falta la env var, la página NO debe caer a "mostrar el historial igual".
    await expect(resolvePhoneFromLink(r, t, undefined)).resolves.toEqual({ ok: false, reason: 'sin_secreto' })
    await expect(resolvePhoneFromLink(r, t, '')).resolves.toEqual({ ok: false, reason: 'sin_secreto' })
  })

  it('un link viejo deja de resolver si el teléfono ya no tiene cobros', async () => {
    distinctPhones.mockResolvedValue([OTRO])
    const { r, t } = link(PHONE)
    await expect(resolvePhoneFromLink(r, t, SECRET)).resolves.toEqual({ ok: false, reason: 'no_encontrado' })
  })
})
