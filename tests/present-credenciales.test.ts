// De dónde saca el estado de la presentación sus credenciales de ESCRITURA.
//
// Esto es la regresión de un fallo real de producción: `UPSTASH_REDIS_REST_TOKEN`
// resultó ser un token de SOLO LECTURA, así que las lecturas funcionaban (el
// panel y los seguidores parecían sanos) y solo al abrir la sesión saltaba un
// `NOPERM ... 'incr'` que se leía como "Redis caído". Se perdió una mañana en
// eso, y el test existe para que no se pierda otra.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { credencialesEstado } from '../src/lib/present/store'

const CLAVES = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

const previo: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of CLAVES) {
    previo[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of CLAVES) {
    if (previo[k] === undefined) delete process.env[k]
    else process.env[k] = previo[k]
  }
})

describe('credenciales de escritura del estado', () => {
  it('prefiere el par KV_REST_API_*, que es el que la integración documenta como de escritura', () => {
    process.env.KV_REST_API_URL = 'https://kv.example'
    process.env.KV_REST_API_TOKEN = 'token-de-escritura'
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token-quiza-de-solo-lectura'

    expect(credencialesEstado()).toEqual({
      url: 'https://kv.example',
      token: 'token-de-escritura',
    })
  })

  it('cae al par UPSTASH_* cuando es el único configurado', () => {
    // Despliegues configurados a mano, sin la integración del Marketplace.
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    expect(credencialesEstado()).toEqual({
      url: 'https://upstash.example',
      token: 'token',
    })
  })

  it('NUNCA mezcla la URL de una base con el token de la otra', () => {
    // Mezclarlos da otro NOPERM, con una causa todavía más difícil de ver.
    process.env.KV_REST_API_URL = 'https://kv.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-la-otra'

    expect(credencialesEstado()).toBeNull()
  })

  it('un par a medias no vale', () => {
    process.env.KV_REST_API_TOKEN = 'solo-el-token'
    expect(credencialesEstado()).toBeNull()

    delete process.env.KV_REST_API_TOKEN
    process.env.UPSTASH_REDIS_REST_URL = 'solo-la-url'
    expect(credencialesEstado()).toBeNull()
  })

  it('sin nada configurado devuelve null y no una cadena vacía', () => {
    // Con cadenas vacías se construiría un cliente que falla en cada comando en
    // vez de caer al almacén en memoria, que es el respaldo previsto en local.
    expect(credencialesEstado()).toBeNull()
  })

  it('el token de SOLO LECTURA no se usa nunca para el estado', () => {
    // Es el que viaja al navegador de cada asistente. Si acabara autenticando
    // las escrituras del servidor, la sustentación entera dejaría de avanzar.
    process.env.KV_REST_API_URL = 'https://kv.example'
    process.env.KV_REST_API_READ_ONLY_TOKEN = 'token-de-solo-lectura'

    expect(credencialesEstado()).toBeNull()

    process.env.KV_REST_API_TOKEN = 'token-de-escritura'
    expect(credencialesEstado()?.token).toBe('token-de-escritura')
  })
})
