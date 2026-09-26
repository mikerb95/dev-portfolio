import { describe, expect, it } from 'vitest'
import {
  CASO_DE,
  ENDEREZAR,
  ESCENARIOS,
  NODOS,
  cables,
  conector,
  lecturasUsadas,
  lineasDe,
  lineasHasta,
  mmss,
  rutaRedondeada,
  type Caja,
  type Punto,
} from '../src/lib/motion/circuito'
import { alterarCifrado, datosAnomalia, datosPnl, datosSlo, SONDEOS_30D } from '../src/lib/motion/tools-datos'
import { encryptWith, decryptWith } from '../src/lib/crypto'
import { randomBytes } from 'node:crypto'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// Lógica pura del motion de /tools: el guion del circuito del hero (que cada
// escenario sea coherente y cuadre con el diccionario), la geometría de los
// cables y los datos de las escenas, que salen de las funciones reales del panel.

describe('guion del circuito', () => {
  it('cada paso nombra nodos que existen y ocurre dentro de su escenario', () => {
    for (const esc of ESCENARIOS) {
      let anterior = 0
      for (const p of esc.pasos) {
        expect(p.t, `${esc.id}: pasos en orden`).toBeGreaterThanOrEqual(anterior)
        anterior = p.t
        expect(p.t).toBeLessThanOrEqual(esc.duracion)
        const ids = p.tipo === 'viaje' ? [p.de, p.a] : [p.nodo]
        for (const id of ids) expect(NODOS).toContain(id)
        if (p.tipo === 'viaje') expect(p.t + (p.dur ?? 0.8)).toBeLessThanOrEqual(esc.duracion)
      }
    }
  })

  it('cada escenario termina con todo en reposo (el siguiente arranca limpio)', () => {
    for (const esc of ESCENARIOS) {
      const ultimo = new Map<string, string>()
      for (const p of esc.pasos) if (p.tipo === 'estado') ultimo.set(p.nodo, p.estado)
      for (const [nodo, estado] of ultimo) expect(estado, `${esc.id}: ${nodo}`).toBe('reposo')
    }
  })

  it('cada escenario pasa por las estaciones de sus casos', () => {
    for (const esc of ESCENARIOS) {
      const tocados = new Set<string>()
      for (const p of esc.pasos) {
        if (p.tipo === 'viaje') tocados.add(p.de).add(p.a)
        else tocados.add(p.nodo)
      }
      const casos = [...tocados].map((id) => CASO_DE[id as keyof typeof CASO_DE]).filter(Boolean)
      for (const c of esc.casos) expect(casos, `${esc.id} sin la estación del caso ${c}`).toContain(c)
    }
  })

  it('ninguna petición hostil llega a las rutas: en el sondeo, lo que se frena no sigue', () => {
    const sondeo = ESCENARIOS.find((e) => e.id === 'sondeo')!
    const frenados = sondeo.pasos.filter((p) => p.tipo === 'viaje' && p.frena)
    expect(frenados.length).toBeGreaterThan(0)
    for (const p of frenados) if (p.tipo === 'viaje') expect(p.a).toBe('siem')
  })

  it('el diccionario trae exactamente las líneas y lecturas que usa el guion, en los dos idiomas', () => {
    for (const dic of [es, en]) {
      const c = dic.tools.motion.circuito
      expect(c.escenarios).toHaveLength(ESCENARIOS.length)
      ESCENARIOS.forEach((esc, i) => expect(c.escenarios[i].lineas).toHaveLength(lineasDe(esc)))
      for (const k of lecturasUsadas()) expect(Object.keys(c.lecturas)).toContain(k)
      for (const id of Object.keys(CASO_DE)) expect(Object.keys(c.nodos)).toContain(id)
    }
  })

  it('la bitácora hasta un instante lista solo lo ya escrito', () => {
    const caos = ESCENARIOS[0]
    expect(lineasHasta(caos, -1)).toEqual([])
    expect(lineasHasta(caos, Infinity).map((l) => l.linea)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('los cables son la unión sin dirección de los viajes, sin duplicados', () => {
    const cs = cables()
    const claves = cs.map(([a, b]) => `${a}|${b}`)
    expect(new Set(claves).size).toBe(claves.length)
    for (const [a, b] of cs) expect(a < b).toBe(true)
    // ida y vuelta del health check: un solo cable
    expect(claves.filter((k) => k === 'ci|rutas')).toHaveLength(1)
  })

  it('mmss formatea el TTL máximo del caos', () => {
    expect(mmss(15 * 60)).toBe('15:00')
    expect(mmss(62.4)).toBe('01:02')
    expect(mmss(-3)).toBe('00:00')
  })
})

const ortogonal = (ps: Punto[]) => {
  for (let i = 1; i < ps.length; i++) {
    const h = Math.abs(ps[i].y - ps[i - 1].y) < 1e-9
    const v = Math.abs(ps[i].x - ps[i - 1].x) < 1e-9
    if (!h && !v) return false
  }
  return true
}
const enBorde = (p: Punto, c: Caja) =>
  (Math.abs(p.x - c.x) < 1e-6 || Math.abs(p.x - (c.x + c.w)) < 1e-6) && p.y >= c.y && p.y <= c.y + c.h
    ? true
    : (Math.abs(p.y - c.y) < 1e-6 || Math.abs(p.y - (c.y + c.h)) < 1e-6) && p.x >= c.x && p.x <= c.x + c.w

describe('conector ortogonal', () => {
  const izq: Caja = { x: 0, y: 100, w: 120, h: 50 }
  const der: Caja = { x: 300, y: 20, w: 100, h: 40 }
  const abajo: Caja = { x: 40, y: 400, w: 100, h: 40 }

  it('sale y entra por los lados enfrentados, solo con tramos rectos', () => {
    for (const [a, b] of [
      [izq, der],
      [der, izq],
      [izq, abajo],
      [abajo, der],
    ] as [Caja, Caja][]) {
      const ps = conector(a, b)
      expect(ortogonal(ps)).toBe(true)
      expect(enBorde(ps[0], a)).toBe(true)
      expect(enBorde(ps.at(-1)!, b)).toBe(true)
    }
  })

  it('elige el eje por la distancia dominante (mismo mapa en columnas o en filas)', () => {
    const h = conector(izq, der)
    expect(h[0].x).toBe(120)
    expect(h.at(-1)!.x).toBe(300)
    const v = conector({ x: 0, y: 0, w: 100, h: 40 }, { x: 60, y: 300, w: 100, h: 40 })
    expect(v[0].y).toBe(40)
    expect(v.at(-1)!.y).toBe(300)
  })

  it('cajas en la misma fila cruzan en horizontal aunque la distancia vertical domine', () => {
    const ps = conector({ x: 0, y: 0, w: 50, h: 200 }, { x: 60, y: 10, w: 50, h: 20 })
    expect(ps[0].x).toBe(50)
    expect(ps.at(-1)!.x).toBe(60)
  })

  it('endereza un desfase de pocos píxeles en vez de dibujar un codo', () => {
    const a: Caja = { x: 0, y: 100, w: 100, h: 46 }
    const b: Caja = { x: 200, y: 100 + ENDEREZAR - 4, w: 100, h: 40 }
    const ps = conector(a, b)
    expect(ps).toHaveLength(2)
    expect(ps[0].y).toBe(ps[1].y)
  })

  it('rutaRedondeada redondea los codos y no dibuja rizos en tramos cortos', () => {
    const d = rutaRedondeada([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 4 },
      { x: 200, y: 4 },
    ])
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d).toContain('Q100 0')
    // el radio se recorta a la mitad del tramo de 4 px
    expect(d).toContain('L98 0')
    expect(d.endsWith('L200 4')).toBe(true)
    expect(rutaRedondeada([])).toBe('')
  })
})

describe('datos de las escenas', () => {
  it('el P&L normaliza ciclos y monedas con las funciones del panel', () => {
    const { filas, antes, despues, partes } = datosPnl()
    expect(filas.map((f) => Math.round(f.mensualUSD * 100) / 100)).toEqual([10, 1.67, 0, 6])
    expect(antes.costoMensualUSD).toBeCloseTo(17.67, 2)
    // un proyecto nuevo cuenta un mes de costos
    expect(antes.margenEstimado).toBeCloseTo(1800 - 17.67, 2)
    expect(despues.margenEstimado - antes.margenEstimado).toBeCloseTo(600, 6)
    expect(partes.cobrado + partes.pendiente + partes.proyectado).toBeCloseTo(1, 9)
  })

  it('el SLO baja con el incidente exactamente lo que calcula el panel', () => {
    const { antes, despues } = datosSlo()
    expect(antes.totalChecks).toBe(SONDEOS_30D)
    expect(antes.budgetMinutes).toBe(43)
    expect(despues.spentMinutes - antes.spentMinutes).toBe(6)
    expect(despues.budgetRemainingPct!).toBeLessThan(antes.budgetRemainingPct!)
    expect(despues.burnRate!).toBeGreaterThan(antes.burnRate!)
  })

  it('un byte alterado en el cifrado real hace fallar el descifrado', () => {
    const clave = randomBytes(32)
    const guardado = encryptWith(clave, 'RESEND_API_KEY = "ejemplo-no-real"')
    expect(decryptWith(clave, guardado)).toBe('RESEND_API_KEY = "ejemplo-no-real"')
    const { alterado, indice } = alterarCifrado(guardado)
    expect(alterado).toHaveLength(guardado.length)
    expect(alterado[indice]).not.toBe(guardado[indice])
    expect([...alterado].filter((ch, i) => ch !== guardado[i])).toHaveLength(1)
    // la posición cae en la tercera parte (el texto cifrado), no en el iv ni el tag
    expect(indice).toBeGreaterThan(24 + 1 + 32)
    expect(() => decryptWith(clave, alterado)).toThrow()
  })
})

describe('anomalía de la escena de seguridad', () => {
  it('solo la última hora supera la banda y el detector real la marca', () => {
    const d = datosAnomalia()
    expect(d.anomalia).toBe(true)
    expect(d.z).toBeGreaterThan(3)
    expect(d.horas.slice(0, -1).every((h) => h <= d.techo)).toBe(true)
    expect(d.horas.at(-1)!).toBeGreaterThan(d.techo)
  })
})
