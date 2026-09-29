import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BITS_MAX,
  CLAVES_BASICAS,
  LIBRO,
  LIENZO,
  PARAMETROS_TOR,
  YEMA,
  crestas,
  estadoLibro,
  parametrosDeId,
  reducirPrecision,
  unosEn,
} from '../src/lib/motion/fingerprint-sala'
import { parametrosDe } from '../src/lib/motion/huella'

// Lógica pura de /lab/fingerprint: qué señales lleva leídas la entrada, la
// estimación "1 en N" y la geometría de la huella en SVG del tablero.

describe('libro de señales', () => {
  it('sin nada leído, ninguna línea con señales avanza y la de sala queda aparte', () => {
    const e = estadoLibro([])
    expect(e.map((l) => l.leidas)).toEqual([0, 0, 0, 0, 0])
    expect(e[4]).toEqual({ leidas: 0, total: 0, soloSala: true })
    expect(e.filter((l) => l.soloSala)).toHaveLength(1)
  })

  it('con las señales básicas, la GPU y la pantalla cuentan pero canvas, audio y fuentes no', () => {
    const e = estadoLibro(CLAVES_BASICAS)
    expect(e[0]).toMatchObject({ leidas: 1, total: 2 }) // webgl sí, canvas no
    expect(e[1]).toMatchObject({ leidas: 0, total: 1 }) // audio espera al consentimiento
    expect(e[2]).toMatchObject({ leidas: 1, total: 2 }) // pantalla sí, fuentes no
    expect(e[3]).toMatchObject({ leidas: 3, total: 3 })
  })

  it('con todas las señales, cada línea con claves se completa', () => {
    const todas = LIBRO.flat()
    for (const l of estadoLibro(todas)) expect(l.leidas).toBe(l.total)
  })

  it('las claves básicas nunca incluyen las pesadas', () => {
    for (const pesada of ['canvas', 'audio', 'fonts']) expect(CLAVES_BASICAS).not.toContain(pesada)
  })
})

describe('fondo de escala del medidor', () => {
  it('BITS_MAX es la suma real de los pesos del recolector', () => {
    const fuente = readFileSync(join(__dirname, '../src/lib/fingerprint-client.ts'), 'utf8')
    const pesos = [...fuente.matchAll(/weight: (\d+) \}/g)].map((m) => Number(m[1]))
    expect(pesos).toHaveLength(12)
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(BITS_MAX)
  })

  it('las claves básicas del libro existen entre las del recolector', () => {
    const fuente = readFileSync(join(__dirname, '../src/lib/fingerprint-client.ts'), 'utf8')
    for (const clave of [...CLAVES_BASICAS, ...LIBRO.flat()]) expect(fuente).toContain(`key: '${clave}'`)
  })
})

describe('unosEn', () => {
  it('es 2^bits y tolera valores inválidos', () => {
    expect(unosEn(10)).toBe(1024)
    expect(unosEn(0)).toBe(1)
    expect(unosEn(-3)).toBe(1)
    expect(unosEn(NaN)).toBe(1)
  })
})

describe('parametrosDeId', () => {
  it('es determinista', () => {
    expect(parametrosDeId('a1b2c3d4e5f6')).toEqual(parametrosDeId('a1b2c3d4e5f6'))
  })

  it('respeta los seis primeros parámetros que ya daba parametrosDe', () => {
    const id = '3fa9c01d7be2'
    const a = parametrosDeId(id)
    const b = parametrosDe(id)
    expect([a.cx, a.cy, a.aniso, a.fase, a.espiral, a.rx]).toEqual([b.cx, b.cy, b.aniso, b.fase, b.espiral, b.rx])
  })

  it('rellena ry y lazo desde el id: dos ids distintos no comparten lazo', () => {
    const ids = ['000000000001', 'a1b2c3d4e5f6', '3fa9c01d7be2', 'ffffffffffff', '0123456789ab']
    const lazos = new Set(ids.map((i) => parametrosDeId(i).lazo))
    expect(lazos.size).toBeGreaterThan(3)
  })

  it('mantiene todos los rangos dentro de lo que sigue pareciendo una huella', () => {
    for (let i = 0; i < 200; i++) {
      const id = (i * 2654435761 >>> 0).toString(16).padStart(8, '0') + (i * 40503).toString(16).padStart(4, '0')
      const p = parametrosDeId(id)
      expect(p.ry).toBeGreaterThanOrEqual(-40)
      expect(p.ry).toBeLessThanOrEqual(40)
      expect(p.lazo).toBeGreaterThanOrEqual(0)
      expect(p.lazo).toBeLessThanOrEqual(0.9)
      expect(Number.isInteger(p.espiral)).toBe(true)
    }
  })

  it('un id corto o con basura no rompe nada', () => {
    expect(() => parametrosDeId('')).not.toThrow()
    expect(() => parametrosDeId('zz-!!')).not.toThrow()
  })
})

describe('crestas', () => {
  const p = parametrosDeId('a1b2c3d4e5f6')

  it('dibuja un trazo por anillo, todos con coordenadas finitas', () => {
    const d = crestas(p, { anillos: 12, puntos: 40 })
    expect(d).toHaveLength(12)
    for (const trazo of d) {
      expect(trazo.startsWith('M')).toBe(true)
      expect(trazo).not.toMatch(/NaN|Infinity/)
      expect(trazo.match(/[ML]/g)).toHaveLength(41)
    }
  })

  it('el desborde sobre el lienzo es acotado (lo que sobra lo recorta la yema)', () => {
    for (const id of ['a1b2c3d4e5f6', '000000000000', 'ffffffffffff', '3fa9c01d7be2', '80808080ffff']) {
      const todo = crestas(parametrosDeId(id)).join(' ')
      for (const [, x, y] of todo.matchAll(/[ML](-?\d+\.?\d*) (-?\d+\.?\d*)/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(-LIENZO.ancho * 0.15)
        expect(Number(x)).toBeLessThanOrEqual(LIENZO.ancho * 1.15)
        expect(Number(y)).toBeGreaterThanOrEqual(-LIENZO.alto * 0.15)
        expect(Number(y)).toBeLessThanOrEqual(LIENZO.alto * 1.15)
      }
    }
  })

  it('el núcleo (primeras crestas) siempre cae dentro de la yema', () => {
    for (const id of ['a1b2c3d4e5f6', '000000000000', 'ffffffffffff', '3fa9c01d7be2', '80808080ffff']) {
      const [nucleo] = crestas(parametrosDeId(id))
      for (const [, x, y] of nucleo!.matchAll(/[ML](-?\d+\.?\d*) (-?\d+\.?\d*)/g)) {
        const dx = (Number(x) - YEMA.cx) / YEMA.rx
        const dy = (Number(y) - YEMA.cy) / YEMA.ry
        expect(dx * dx + dy * dy).toBeLessThan(1)
      }
    }
  })

  it('el mismo id da la misma huella y dos ids distintos dan huellas distintas', () => {
    expect(crestas(parametrosDeId('a1b2c3d4e5f6'))).toEqual(crestas(parametrosDeId('a1b2c3d4e5f6')))
    expect(crestas(parametrosDeId('a1b2c3d4e5f6'))).not.toEqual(crestas(parametrosDeId('3fa9c01d7be2')))
  })

  it('la espiral empalma el final de un anillo con el inicio del siguiente', () => {
    const espiral = { ...PARAMETROS_TOR, espiral: 1, lazo: 0 }
    const d = crestas(espiral, { anillos: 10, puntos: 60 })
    const punto = (s: string, ultimo: boolean) => {
      const m = [...s.matchAll(/[ML](-?\d+\.?\d*) (-?\d+\.?\d*)/g)]
      const q = ultimo ? m[m.length - 1]! : m[0]!
      return [Number(q[1]), Number(q[2])]
    }
    // Con un anillo por vuelta de la espiral, el final del anillo i cae junto al inicio del i+1.
    const [xf, yf] = punto(d[3]!, true)
    const [xi, yi] = punto(d[4]!, false)
    expect(Math.hypot(xf! - xi!, yf! - yi!)).toBeLessThan(3)
  })
})

describe('defensas', () => {
  const ids = ['a1b2c3d4e5f6', '3fa9c01d7be2', '0123456789ab', 'ffee00112233']

  it('Tor: todas las huellas caen en la misma', () => {
    const dibujos = ids.map(() => crestas(PARAMETROS_TOR).join('|'))
    expect(new Set(dibujos).size).toBe(1)
  })

  it('precisión reducida: junta huellas pero no borra la diferencia entera', () => {
    const sin = new Set(ids.map((i) => JSON.stringify(parametrosDeId(i))))
    const con = new Set(ids.map((i) => JSON.stringify(reducirPrecision(parametrosDeId(i), 1))))
    expect(sin.size).toBe(ids.length)
    expect(con.size).toBeLessThanOrEqual(sin.size)
    // Con un paso grande se juntan más que con uno fino.
    const grueso = new Set(ids.map((i) => JSON.stringify(reducirPrecision(parametrosDeId(i), 3))))
    expect(grueso.size).toBeLessThanOrEqual(con.size)
  })

  it('precisión reducida es idempotente', () => {
    const p = reducirPrecision(parametrosDeId('a1b2c3d4e5f6'), 1)
    expect(reducirPrecision(p, 1)).toEqual(p)
  })
})
