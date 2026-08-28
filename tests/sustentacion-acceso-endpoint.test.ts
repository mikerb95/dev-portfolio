// El endpoint de la puerta por contraseña, llamado de verdad.
//
// `sustentacion-acceso.test.ts` prueba la lógica pura (alcance, firma,
// caducidad). Esto prueba el CABLEADO: que la variable de entorno se lea, que
// la cookie salga firmada de forma que `verificarAcceso` la acepte, y que sin
// variable configurada no se abra nada. Es la parte que un test de módulo puro
// no puede cubrir y que, si está mal, no se descubre hasta el día de la charla.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST } from '../src/pages/api/sustentacion/acceso'
import { ACCESO_COOKIE, verificarAcceso } from '../src/lib/sustentacion/acceso'

const CLAVE = 'sustentacion2026'
const SECRETO = 'secreto-de-firma-de-prueba-largo'

/** Lo mínimo de la API de cookies de Astro que usa el endpoint. */
function cookiesFalsas() {
  const puestas = new Map<string, { value: string; opts: Record<string, unknown> }>()
  return {
    puestas,
    set: (name: string, value: string, opts: Record<string, unknown>) =>
      void puestas.set(name, { value, opts }),
    get: (name: string) => {
      const c = puestas.get(name)
      return c ? { value: c.value } : undefined
    },
    delete: () => {},
    has: (name: string) => puestas.has(name),
  }
}

async function llamar(body: unknown, cookies = cookiesFalsas()) {
  const request = new Request('https://codebymike.tech/api/sustentacion/acceso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  })
  // El endpoint solo usa `request` y `cookies` del contexto de Astro.
  const res = await (POST as unknown as (ctx: unknown) => Promise<Response>)({ request, cookies })
  return { res, datos: await res.json(), cookies }
}

const envPrevio = { pass: process.env.SUSTENTACION_PASSWORD, auth: process.env.AUTH_SECRET }

beforeEach(() => {
  process.env.SUSTENTACION_PASSWORD = CLAVE
  process.env.AUTH_SECRET = SECRETO
})

afterEach(() => {
  if (envPrevio.pass === undefined) delete process.env.SUSTENTACION_PASSWORD
  else process.env.SUSTENTACION_PASSWORD = envPrevio.pass
  if (envPrevio.auth === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = envPrevio.auth
})

describe('POST /api/sustentacion/acceso', () => {
  it('con la contraseña correcta emite una cookie que verifica', () => {
    return llamar({ password: CLAVE }).then(({ res, datos, cookies }) => {
      expect(res.status).toBe(200)
      expect(datos).toEqual({ ok: true })

      const cookie = cookies.puestas.get(ACCESO_COOKIE)
      expect(cookie, 'no se emitió la cookie').toBeDefined()
      // El cierre del círculo: lo que emite el endpoint es exactamente lo que
      // el middleware va a verificar. Si los prefijos de firma se separaran,
      // esto fallaría y no se vería hasta estar delante del jurado.
      expect(verificarAcceso(cookie!.value, SECRETO)).toBe(true)
    })
  })

  it('la cookie es httpOnly y no viaja entre sitios', async () => {
    const { cookies } = await llamar({ password: CLAVE })
    const opts = cookies.puestas.get(ACCESO_COOKIE)!.opts
    expect(opts.httpOnly).toBe(true)
    expect(opts.sameSite).toBe('lax')
    expect(opts.path).toBe('/')
    expect(opts.maxAge).toBeGreaterThan(0)
  })

  it('rechaza la contraseña equivocada sin emitir nada', async () => {
    const { res, datos, cookies } = await llamar({ password: 'sustentacion2025' })
    expect(res.status).toBe(403)
    expect(datos.error).toMatch(/incorrecta/i)
    expect(cookies.puestas.has(ACCESO_COOKIE)).toBe(false)
  })

  it('sin variable configurada dice que NO ESTÁ CONFIGURADO, no que falló la clave', async () => {
    // Confundir las dos cosas cuesta media hora de intentos con la contraseña
    // buena, cinco minutos antes de entrar al salón.
    delete process.env.SUSTENTACION_PASSWORD
    const { res, datos, cookies } = await llamar({ password: CLAVE })
    expect(res.status).toBe(503)
    expect(datos.error).toMatch(/no configurado/i)
    expect(cookies.puestas.has(ACCESO_COOKIE)).toBe(false)
  })

  it('sin clave de firma no emite una cookie que luego no valdría', async () => {
    delete process.env.AUTH_SECRET
    const { res, cookies } = await llamar({ password: CLAVE })
    expect(res.status).toBe(503)
    expect(cookies.puestas.has(ACCESO_COOKIE)).toBe(false)
  })

  it('un cuerpo sin contraseña es un 400, no un 403', async () => {
    const { res } = await llamar({})
    expect(res.status).toBe(400)
  })

  it('nunca se cachea', async () => {
    const { res } = await llamar({ password: CLAVE })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
