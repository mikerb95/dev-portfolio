import { describe, it, expect } from 'vitest'
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

  it.each(crons.map((c) => c.path))('%s comprueba CRON_SECRET', (path) => {
    const src = readFileSync(archivoDeRuta(path), 'utf8')
    expect(/CRON_SECRET/.test(src), `${path} no menciona CRON_SECRET`).toBe(true)
  })
})
