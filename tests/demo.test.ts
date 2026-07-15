import { describe, expect, it } from 'vitest'
import {
  createDemoToken,
  isDemoAllowedMethod,
  isDemoBlockedPath,
  signDemoToken,
  verifyDemoToken,
  DEMO_TTL_SEC,
} from '../src/lib/demo'

const SECRET = 'un-secreto-de-prueba-suficientemente-largo'
const NOW = 1_770_000_000_000

describe('pase de demo · firma y vigencia', () => {
  it('acepta un pase recién emitido', () => {
    const token = createDemoToken(SECRET, NOW)
    expect(verifyDemoToken(SECRET, token, NOW)).toBe(true)
  })

  it('rechaza un pase vencido (el TTL va dentro de lo firmado)', () => {
    const token = createDemoToken(SECRET, NOW)
    const justBefore = NOW + DEMO_TTL_SEC * 1000 - 1000
    const justAfter = NOW + DEMO_TTL_SEC * 1000 + 1000
    expect(verifyDemoToken(SECRET, token, justBefore)).toBe(true)
    expect(verifyDemoToken(SECRET, token, justAfter)).toBe(false)
  })

  it('rechaza un pase firmado con otro secreto', () => {
    const token = createDemoToken('otro-secreto', NOW)
    expect(verifyDemoToken(SECRET, token, NOW)).toBe(false)
  })

  it('no deja extender el TTL editando el payload sin re-firmar', () => {
    const token = createDemoToken(SECRET, NOW)
    const sig = token.slice(token.lastIndexOf('.') + 1)
    const forjado = `${Math.floor(NOW / 1000) + 10 * 365 * 86_400}.${sig}`
    expect(verifyDemoToken(SECRET, forjado, NOW)).toBe(false)
  })

  it('rechaza basura, vacíos y firmas de longitud distinta', () => {
    const exp = Math.floor(NOW / 1000) + 60
    for (const malo of [
      undefined,
      null,
      '',
      'sinpunto',
      '.',
      `${exp}.`,
      `${exp}.zz`,
      `${exp}.abc`,
      `no-numerico.${'a'.repeat(64)}`,
      signDemoToken(SECRET, exp).replace(/.$/, 'f') + 'extra',
    ]) {
      expect(verifyDemoToken(SECRET, malo as string | null | undefined, NOW)).toBe(false)
    }
  })

  it('rechaza si no hay secreto configurado', () => {
    const token = createDemoToken(SECRET, NOW)
    expect(verifyDemoToken(undefined, token, NOW)).toBe(false)
    expect(verifyDemoToken('', token, NOW)).toBe(false)
  })

  it('un bit distinto en la firma invalida el pase', () => {
    const token = createDemoToken(SECRET, NOW)
    const dot = token.lastIndexOf('.')
    const sig = token.slice(dot + 1)
    const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)
    expect(verifyDemoToken(SECRET, `${token.slice(0, dot)}.${flipped}`, NOW)).toBe(false)
  })
})

describe('demo · solo lectura', () => {
  it('permite GET y HEAD, nada más', () => {
    expect(isDemoAllowedMethod('GET')).toBe(true)
    expect(isDemoAllowedMethod('HEAD')).toBe(true)
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'get']) {
      expect(isDemoAllowedMethod(m)).toBe(false)
    }
  })
})

describe('demo · rutas vetadas aunque sean GET', () => {
  it('bloquea los reveladores de credenciales (que son GET)', () => {
    expect(isDemoBlockedPath('/api/admin/services/42/secrets')).toBe(true)
    expect(isDemoBlockedPath('/api/admin/projects/7/envvars')).toBe(true)
  })

  it('bloquea backup, upload y la superficie de la cuenta real', () => {
    for (const p of [
      '/admin/backup',
      '/api/admin/backup',
      '/api/admin/upload',
      '/admin/passkeys',
      '/admin/sessions',
      '/api/admin/sessions',
      '/api/admin/webauthn/authenticate',
      '/api/admin/lab/chaos',
      '/api/admin/lab/chaos/experiment',
    ]) {
      expect(isDemoBlockedPath(p), p).toBe(true)
    }
  })

  it('deja pasar las páginas que la demo existe para mostrar', () => {
    for (const p of [
      '/admin',
      '/admin/costs',
      '/admin/projects',
      '/admin/projects/7',
      '/admin/clients',
      '/admin/monitors',
      '/admin/seguimiento',
      '/admin/lab/pipeline',
      '/api/admin/projects',
      '/api/admin/costs',
    ]) {
      expect(isDemoBlockedPath(p), p).toBe(false)
    }
  })

  it('la barra final no evade el bloqueo', () => {
    expect(isDemoBlockedPath('/admin/backup/')).toBe(true)
    expect(isDemoBlockedPath('/api/admin/services/42/secrets/')).toBe(true)
  })
})
