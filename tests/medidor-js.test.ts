import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { generarMedidorJs } from '../scripts/build-medidor.mjs'
import { validarLote } from '../src/lib/computo/lote'
import { verificarLote } from '../src/lib/computo/firma'
import type * as MedidorTs from '../instrumentacion/medidor'

// Las versiones JavaScript del medidor se generan desde el .ts. Si alguien
// cambia el .ts y olvida regenerar, los proyectos en JavaScript mandarían
// lotes con otra lógica, y la diferencia aparecería como consumo inventado.

const dir = join(process.cwd(), 'instrumentacion')
const SECRETO = '9'.repeat(64)

describe('versiones JavaScript del medidor', () => {
  it('coinciden con lo que genera el .ts actual (si falla: npm run medidor:build)', () => {
    const { mjs, cjs } = generarMedidorJs()
    expect(readFileSync(join(dir, 'medidor.mjs'), 'utf8')).toBe(mjs)
    expect(readFileSync(join(dir, 'medidor.cjs'), 'utf8')).toBe(cjs)
  })

  it('no dejan rastro de tipos de TypeScript', () => {
    const { mjs, cjs } = generarMedidorJs()
    for (const codigo of [mjs, cjs]) {
      expect(codigo).not.toMatch(/^\s*(export\s+)?(interface|type)\s+\w+/m)
      expect(codigo).not.toMatch(/\bas\s+(unknown|Record|RespuestaNode)\b/)
    }
  })

  const cargar = {
    cjs: async () => createRequire(import.meta.url)(join(dir, 'medidor.cjs')) as typeof MedidorTs,
    mjs: async () => (await import('../instrumentacion/medidor.mjs')) as typeof MedidorTs,
  }

  for (const [formato, importar] of Object.entries(cargar)) {
    it(`${formato}: lo que envía pasa la firma y la validación de la ingesta`, async () => {
      const { crearMedidor } = await importar()
      const ahora = Date.parse('2026-09-23T15:00:00Z')
      const envios: { headers: Record<string, string>; cuerpo: string }[] = []
      const m = crearMedidor({
        endpoint: 'https://panel.test/api/computo/ingest',
        proyecto: 'cliente-js',
        secreto: SECRETO,
        reloj: () => ahora,
        cpuMs: () => 5,
        fetch: async (_url, init) => {
          envios.push({ headers: init.headers as Record<string, string>, cuerpo: init.body as string })
          return new Response(null, { status: 200 })
        },
      })
      m.iniciar(10)(90)
      await m.vaciar()
      const [e] = envios
      expect(verificarLote(e.headers['x-computo-timestamp'], e.headers['x-computo-signature'], e.cuerpo, SECRETO, ahora)).toBe('ok')
      const lote = validarLote(JSON.parse(e.cuerpo), ahora)
      expect(lote.ok && lote.lote.muestras[0]).toMatchObject({ invocaciones: 1, transferBytes: 90, originTransferBytes: 100, cpuMs: 5 })
    })
  }
})
