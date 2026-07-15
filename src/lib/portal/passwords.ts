// Hashing de contraseñas del portal de clientes.
//
// scrypt de node:crypto, sin dependencias. Elegido sobre bcrypt/argon2 porque
// (a) es lo único con KDF serio en la stdlib, así que no añade binarios nativos
// que compliquen el build en Vercel, y (b) su coste en memoria lo hace caro de
// paralelizar en GPU, que es justo la amenaza contra un volcado de la base.
//
// El hash guardado lleva SUS PROPIOS parámetros: `scrypt$N$r$p$salt$hash`. Así
// puedo endurecerlos el día que haga falta y los hashes viejos siguen
// verificando (y se re-hashean al vuelo en el próximo login correcto).

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

// N=2^15 (32768) con r=8: ~32 MB por hash y ~100 ms de CPU. Suficiente para
// hacer inviable un ataque de diccionario a gran escala y lo bastante barato
// para una función serverless (el límite de memoria por defecto es 1 GB).
const PARAMS = { N: 32_768, r: 8, p: 1 } as const
const KEY_LEN = 64
const SALT_LEN = 16

// Promisificado a mano en vez de con util.promisify: los tipos de promisify
// resuelven a la sobrecarga de 3 argumentos de scrypt y no dejan pasar las
// opciones, que es justo donde viven N/r/p.
const derive = (password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    // `maxmem` por defecto (32 MB) se queda corto para N=2^15 y scrypt lanza.
    // La fórmula del propio scrypt es 128*N*r; se da margen holgado.
    scryptCb(password.normalize('NFKC'), salt, KEY_LEN, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  })

/** Requisitos mínimos de contraseña. Devuelve el motivo del rechazo o null. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'La contraseña debe tener al menos 10 caracteres.'
  }
  if (password.length > 200) return 'La contraseña es demasiado larga (máx. 200 caracteres).'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe combinar letras y números.'
  }
  return null
}

/** Deriva el hash de una contraseña nueva. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const hash = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/**
 * Verifica una contraseña contra un hash almacenado. Nunca lanza: un hash
 * corrupto o de formato desconocido es simplemente un `false` (un error aquí
 * sería un oráculo sobre el estado de la cuenta).
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  try {
    const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split('$')
    if (scheme !== 'scrypt' || !saltRaw || !hashRaw) return false

    const N = Number(nRaw)
    const r = Number(rRaw)
    const p = Number(pRaw)
    // Un N absurdo en la base (corrupción o manipulación) no debe convertirse en
    // una bomba de memoria: se rechaza antes de derivar nada.
    if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false
    if (!Number.isInteger(r) || r < 1 || r > 32) return false
    if (!Number.isInteger(p) || p < 1 || p > 16) return false

    const expected = Buffer.from(hashRaw, 'base64url')
    const actual = await derive(password, Buffer.from(saltRaw, 'base64url'), N, r, p)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/** ¿Este hash usa parámetros viejos? Si sí, se re-hashea tras un login correcto. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false
  const [scheme, N, r, p] = stored.split('$')
  return scheme !== 'scrypt' || Number(N) < PARAMS.N || Number(r) < PARAMS.r || Number(p) < PARAMS.p
}
