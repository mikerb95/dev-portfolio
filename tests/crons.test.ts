import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { cronSecretOk } from '../src/lib/cron-auth'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Guarda contra la clase de bug que dejó el backup un mes sin producir nada
// (ago 2026). Ninguna prueba lo habría atrapado porque el cron respondía 200:
// la ruta declarada en vercel.json existía, pero su handler de GET era el de
// "listar", no el de "hacer el backup", y además vivía bajo /api/admin/, donde
// el middleware exige sesión y devuelve 302 antes de llegar al handler.
//
// Las tres condiciones que se comprueban aquí son exactamente las tres que
// fallaban, y son verificables sin desplegar ni llamar a nadie.

const raiz = join(__dirname, '..')
const crons: { path: string; schedule: string }[] = JSON.parse(
  readFileSync(join(raiz, 'vercel.json'), 'utf8'),
).crons

/** Fichero de ruta Astro que sirve una ruta de API. */
function archivoDeRuta(rutaUrl: string): string {
  return join(raiz, 'src', 'pages', `${rutaUrl.replace(/^\//, '')}.ts`)
}

describe('crons declarados en vercel.json', () => {
  it('hay crons declarados (si no, este test no prueba nada)', () => {
    expect(crons.length).toBeGreaterThan(0)
  })

  it.each(crons.map((c) => c.path))('%s existe como ruta', (path) => {
    expect(existsSync(archivoDeRuta(path)), `no existe ${archivoDeRuta(path)}`).toBe(true)
  })

  // Los crons de Vercel disparan GET. Un endpoint que solo exporta POST recibe
  // la petición diaria en otro handler (o en ninguno) y nadie se entera.
  it.each(crons.map((c) => c.path))('%s exporta un handler GET', (path) => {
    const src = readFileSync(archivoDeRuta(path), 'utf8')
    expect(/export const GET\b/.test(src), `${path} no exporta GET`).toBe(true)
  })

  // Bajo /api/admin/ el middleware exige sesión y responde 302 a /login: el
  // cron nunca llega al handler, mande el secreto que mande.
  it.each(crons.map((c) => c.path))('%s no cuelga del gate de sesión de /api/admin', (path) => {
    expect(path.startsWith('/api/admin')).toBe(false)
  })

  // La validación tiene que pasar por `cronSecretOk` (lib/cron-auth.ts). Las
  // copias inline se desincronizaron una vez: unas comparaban en tiempo
  // constante y otras con `!==`, contra lo que decía la documentación.
  it.each(crons.map((c) => c.path))('%s valida el secreto con cronSecretOk', (path) => {
    const src = readFileSync(archivoDeRuta(path), 'utf8')
    expect(/cronSecretOk\(/.test(src), `${path} no usa cronSecretOk`).toBe(true)
  })

  // Un `auth !== \`Bearer ...\`` vuelve a meter comparación variable en tiempo.
  it.each(crons.map((c) => c.path))('%s no compara el secreto con !==', (path) => {
    const src = readFileSync(archivoDeRuta(path), 'utf8')
    expect(/!==\s*`Bearer/.test(src), `${path} compara el secreto con !==`).toBe(false)
  })
})

describe('cronSecretOk', () => {
  const anterior = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'secreto-de-prueba'
  })

  afterAll(() => {
    if (anterior === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = anterior
  })

  it('acepta el header bien formado', () => {
    expect(cronSecretOk('Bearer secreto-de-prueba')).toBe(true)
  })

  // El fallo real de cron-job.org (sep 2026): el header quedó guardado con el
  // secreto pelado, sin el prefijo, y los dos jobs se pasaron tres semanas
  // recibiendo 401 hasta que el scheduler los deshabilitó solo.
  it('rechaza el secreto sin el prefijo Bearer', () => {
    expect(cronSecretOk('secreto-de-prueba')).toBe(false)
  })

  it('rechaza un secreto distinto de la misma longitud', () => {
    expect(cronSecretOk('Bearer secreto-de-pruebA')).toBe(false)
  })

  it('rechaza header ausente o vacío', () => {
    expect(cronSecretOk(null)).toBe(false)
    expect(cronSecretOk('')).toBe(false)
  })

  // timingSafeEqual lanza si los buffers difieren en tamaño: la guarda de
  // longitud tiene que filtrarlo antes, no propagar la excepción como un 500.
  it('no lanza con headers de cualquier longitud', () => {
    expect(() => cronSecretOk('x')).not.toThrow()
    expect(() => cronSecretOk('Bearer ' + 'x'.repeat(5000))).not.toThrow()
    expect(cronSecretOk('x')).toBe(false)
  })

  it('rechaza todo si no hay secreto en el entorno', () => {
    delete process.env.CRON_SECRET
    expect(cronSecretOk('Bearer secreto-de-prueba')).toBe(false)
  })
})
