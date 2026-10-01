import { describe, expect, it } from 'vitest'
import {
  agregarAlHistorial,
  entradaModelo,
  parsearHistorial,
  partirRespuesta,
  recortar,
  resumenSinIa,
  semanaAnterior,
  type DatosSemana,
  type Resumen,
} from '../src/lib/resumen-semanal'

const base: DatosSemana = {
  desde: '2026-09-21',
  hasta: '2026-09-27',
  uptime: [
    { nombre: 'codebymike.net', pct: 100, caidas: 0 },
    { nombre: 'toledo', pct: 98.123, caidas: 2 },
  ],
  incidentes: { total: 2, minutos: 37, abiertos: 0 },
  seguridad: { intentos: 2913, origenes: 41, porCategoria: [{ categoria: 'auth_probing', intentos: 2700 }, { categoria: 'recon_cms', intentos: 120 }], bloqueos: 3 },
  crons: { corridas: 63, fallos: 1, conFallo: ['backup'] },
  ci: { corridas: 40, fallidas: 2, revertidas: 0 },
  analista: { analisis: 9, costoUsd: 0.6789 },
}

describe('contrato de entrada al modelo', () => {
  it('nombra las categorías en palabras, no con su clave interna', () => {
    expect(entradaModelo(base)).toContain('intentaban entrar a cuentas')
    expect(entradaModelo(base)).not.toContain('auth_probing')
  })

  it('no lleva IPs, rutas ni user-agents: solo agregados', () => {
    const json = entradaModelo(base)
    expect(json).not.toMatch(/\d{1,3}(\.\d{1,3}){3}/)
    expect(json).not.toMatch(/\/wp-|\.php|\.env|Mozilla/)
  })

  it('tiene tamaño acotado aunque crezcan las listas', () => {
    const grande: DatosSemana = {
      ...base,
      uptime: Array.from({ length: 50 }, (_, i) => ({ nombre: `sitio-${i}`, pct: 100 - i / 10, caidas: i % 3 })),
      seguridad: { ...base.seguridad, porCategoria: Array.from({ length: 30 }, (_, i) => ({ categoria: `c${i}`, intentos: i })) },
      crons: { ...base.crons, conFallo: Array.from({ length: 20 }, (_, i) => `job-${i}`) },
    }
    const r = recortar(grande)
    expect(r.uptime).toHaveLength(12)
    expect(r.uptime[0]!.nombre).toBe('sitio-49') // el peor primero
    expect(r.seguridad.porCategoria).toHaveLength(6)
    expect(r.seguridad.porCategoria[0]!.intentos).toBe(29)
    expect(r.crons.conFallo).toHaveLength(6)
    expect(entradaModelo(grande).length).toBeLessThan(2500)
  })

  it('redondea porcentajes y costo', () => {
    const r = recortar(base)
    expect(r.uptime.find((u) => u.nombre === 'toledo')!.pct).toBe(98.12)
    expect(r.analista.costoUsd).toBe(0.68)
  })
})

describe('resumen sin IA (fail-open)', () => {
  it('nombra los sitios con problemas y traduce las categorías', () => {
    const r = resumenSinIa(base)
    expect(r.titular).toMatch(/caídas en 1 sitio/)
    expect(r.texto).toContain('toledo (98.12 %)')
    expect(r.texto).toContain('intentaban entrar a cuentas')
  })

  it('una semana limpia lo dice en una frase', () => {
    const r = resumenSinIa({ ...base, uptime: [{ nombre: 'a', pct: 100, caidas: 0 }] })
    expect(r.titular).toMatch(/^Semana tranquila/)
  })

  it('un incidente abierto manda sobre lo demás', () => {
    expect(resumenSinIa({ ...base, incidentes: { total: 1, minutos: 5, abiertos: 1 } }).titular).toMatch(/1 incidente abierto/)
  })
})

describe('partirRespuesta', () => {
  it('toma la primera línea como titular', () => {
    const r = partirRespuesta('Semana sin sobresaltos.\n\n## Qué pasó\n- Todo arriba.', base)
    expect(r.titular).toBe('Semana sin sobresaltos.')
    expect(r.texto).toMatch(/^## Qué pasó/)
  })

  it('si el modelo empieza por un encabezado, el titular sale del armado fijo', () => {
    const r = partirRespuesta('## Qué pasó\n- Todo arriba.', base)
    expect(r.titular).toBe(resumenSinIa(base).titular)
    expect(r.texto).toContain('Todo arriba')
  })
})

describe('historial', () => {
  const r = (desde: string): Resumen => ({ creado: '', desde, hasta: '', titular: '', texto: '', conIa: false, costoUsd: 0, datos: base })
  it('pone el nuevo primero, reemplaza la misma semana y limita el tamaño', () => {
    let h: Resumen[] = []
    for (let i = 0; i < 15; i++) h = agregarAlHistorial(h, r(`2026-0${(i % 9) + 1}-01`))
    expect(h.length).toBeLessThanOrEqual(12)
    const repetido = agregarAlHistorial([r('a'), r('b')], r('a'))
    expect(repetido.map((x) => x.desde)).toEqual(['a', 'b'])
  })

  it('tolera un valor guardado roto', () => {
    expect(parsearHistorial('no es json')).toEqual([])
    expect(parsearHistorial(null)).toEqual([])
    expect(parsearHistorial('{"x":1}')).toEqual([])
  })
})

describe('semanaAnterior', () => {
  it('lunes a domingo de la semana pasada, en hora de Bogotá', () => {
    // Lunes 28 sep 2026, 07:00 Bogotá (12:00 UTC).
    const s = semanaAnterior(new Date('2026-09-28T12:00:00Z'))
    expect(s).toMatchObject({ desde: '2026-09-21', hasta: '2026-09-27' })
    expect(s.inicio.toISOString()).toBe('2026-09-21T05:00:00.000Z')
    expect(s.fin.toISOString()).toBe('2026-09-28T05:00:00.000Z')
  })

  it('el domingo por la noche en Bogotá todavía cuenta como esa semana', () => {
    // Lunes 28 sep 02:00 UTC = domingo 27 sep 21:00 Bogotá.
    expect(semanaAnterior(new Date('2026-09-28T02:00:00Z')).desde).toBe('2026-09-14')
  })
})
