import { describe, expect, it, vi } from 'vitest'
import {
  EXPERIMENTOS,
  cuadroFinal,
  guionDe,
  lecturasUsadas,
  selloDe,
  type Paso,
} from '../src/lib/motion/ensayo'
import { pistaDe } from '../src/lib/motion/pista'
import { ESCALERA, ESCALERA_MOVIL, escalera, leerEscalones, puntosCiclo } from '../src/lib/motion/lab-datos'
import type { LoadStep } from '../src/lib/lab/load-test'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// Lógica pura del motion de /lab: el guion del banco de ensayo (que cada
// experimento se decida con las reglas reales de la pasarela y llegue al mismo
// veredicto que el experimento de producción), la lectura de una corrida de CI
// como pista y la geometría de la escalera de carga.

const deTipo = <T extends Paso['tipo']>(g: { pasos: Paso[] }, tipo: T) =>
  g.pasos.filter((p): p is Extract<Paso, { tipo: T }> => p.tipo === tipo)

describe('guion del banco de ensayo', () => {
  it('los cinco experimentos se superan, gane quien gane la carrera', () => {
    for (const id of EXPERIMENTOS) {
      for (const vuelta of [0, 1]) expect(guionDe(id, vuelta).ok, `${id} vuelta ${vuelta}`).toBe(true)
    }
  })

  it('los pasos van en orden y caben en la duración', () => {
    for (const id of EXPERIMENTOS) {
      const g = guionDe(id)
      g.pasos.forEach((p, i) => i > 0 && expect(p.t).toBeGreaterThanOrEqual(g.pasos[i - 1].t))
      expect(g.duracion).toBeGreaterThan(g.pasos.at(-1)!.t)
      expect(g.pasos.at(-1)!.tipo).toBe('fin')
    }
  })

  it('doble clic: un solo pago y los dos clics vuelven con la misma referencia', () => {
    const g = guionDe('payments:double_click')
    expect(g.final.pagos).toBe(1)
    const vueltas = deTipo(g, 'vuelve')
    expect(vueltas).toHaveLength(2)
    expect(new Set(vueltas.map((v) => v.etiqueta)).size).toBe(1)
    expect(deTipo(g, 'guarda').map((p) => p.veredicto)).toEqual(['pasa', 'frena'])
  })

  it('webhook duplicado: la segunda entrega la frena "evento ya visto"', () => {
    const g = guionDe('payments:duplicate_webhook')
    const frenos = deTipo(g, 'guarda').filter((p) => p.veredicto === 'frena')
    expect(frenos.map((p) => p.guarda)).toEqual(['visto'])
    expect(g.final).toMatchObject({ estado: 'approved', version: 1, aplicados: 1, recibidos: 2 })
  })

  it('webhook tardío: la máquina de estados niega volver de aprobado a pendiente', () => {
    const g = guionDe('payments:out_of_order')
    expect(cuadroFinal(g).arcos).toEqual([
      { de: 'created', a: 'approved', aplicada: true },
      { de: 'approved', a: 'pending', aplicada: false },
    ])
    expect(g.final.estado).toBe('approved')
  })

  it('carrera: el perdedor choca con la versión, relee y la máquina lo frena', () => {
    for (const vuelta of [0, 1]) {
      const g = guionDe('payments:race_condition', vuelta)
      const aplicadas = deTipo(g, 'transicion').filter((p) => p.aplicada)
      expect(aplicadas).toHaveLength(1)
      const perdedor = deTipo(g, 'descarta')[0].token
      const suyas = deTipo(g, 'guarda').filter((p) => p.token === perdedor)
      expect(suyas.map((p) => `${p.guarda}:${p.veredicto}`)).toEqual(['visto:pasa', 'legal:pasa', 'version:aviso', 'legal:frena'])
      // Leyó la versión 0 y encontró la 1: eso es lo que prueba la carrera.
      expect(suyas[2].lectura.vars).toEqual({ leida: 0, actual: 1 })
    }
    expect(guionDe('payments:race_condition', 0).final.estado).toBe('approved')
    expect(guionDe('payments:race_condition', 1).final.estado).toBe('declined')
  })

  it('caída de BD: lo escrito en la transacción se ve tentativo y el ROLLBACK lo deja como estaba', () => {
    const g = guionDe('chaos:db_fail_midtx')
    const registros = deTipo(g, 'registro').map((p) => p.registro)
    expect(registros.some((r) => r.tentativo && r.estado === 'pending' && r.version === 1)).toBe(true)
    expect(g.final).toEqual(g.inicial)
    expect(cuadroFinal(g).arcos).toEqual([])
  })

  it('el veredicto depende de la máquina de estados real: sin ella, el tardío pasaría', async () => {
    vi.resetModules()
    vi.doMock('../src/lib/payments-state', () => ({ canTransition: (a: string, b: string) => a !== b }))
    const { guionDe: guionSinMaquina } = await import('../src/lib/motion/ensayo')
    expect(guionSinMaquina('payments:out_of_order').ok).toBe(false)
    expect(guionSinMaquina('payments:out_of_order').final.estado).toBe('pending')
    vi.doUnmock('../src/lib/payments-state')
    vi.resetModules()
  })

  it('cada lectura del guion existe en los dos diccionarios', () => {
    for (const clave of lecturasUsadas()) {
      expect(es.lab.motion.banco.lecturas, clave).toHaveProperty(clave)
      expect(en.lab.motion.banco.lecturas, clave).toHaveProperty(clave)
    }
    for (const d of [es, en]) {
      expect(d.lab.motion.banco.experimentos).toHaveLength(EXPERIMENTOS.length)
      expect(d.lab.motion.banco.esperado).toHaveLength(EXPERIMENTOS.length)
    }
  })

  it('el sello sale de las corridas reales, no de la reproducción', () => {
    expect(selloDe(undefined)).toBe('sin-corridas')
    expect(selloDe({ runs: 0, ok: 0, lastRunAt: null })).toBe('sin-corridas')
    expect(selloDe({ runs: 13, ok: 13, lastRunAt: 1 })).toBe('superado')
    expect(selloDe({ runs: 13, ok: 12, lastRunAt: 1 })).toBe('parcial')
  })
})

describe('pista del pipeline', () => {
  it('toda corrida registrada pasó calidad (ci.yml solo reporta tras needs: quality)', () => {
    for (const conclusion of ['success', 'failure', 'rolled_back']) {
      expect(pistaDe({ conclusion, healthOk: null }).calidad).toBe('ok')
    }
  })

  it('un rollback falla en el health check y vuelve por el desvío', () => {
    expect(pistaDe({ conclusion: 'rolled_back', healthOk: false })).toEqual({
      calidad: 'ok',
      deploy: 'ok',
      health: 'fallo',
      desenlace: 'rollback',
      vuelve: true,
    })
  })

  it('un fallo sin rollback no afirma que el deploy llegó', () => {
    expect(pistaDe({ conclusion: 'failure', healthOk: false })).toMatchObject({ deploy: 'sin-dato', health: 'fallo', vuelve: false })
  })

  it('sin dato del health check no se pinta verde por descarte', () => {
    expect(pistaDe({ conclusion: 'success', healthOk: null }).health).toBe('sin-dato')
    expect(pistaDe({ conclusion: 'success', healthOk: true }).health).toBe('ok')
  })
})

describe('ciclo de hallazgos', () => {
  it('un punto por hallazgo mientras quepan', () => {
    expect(puntosCiclo({ open: 1, resolved: 4, accepted: 1 })).toEqual({ porPunto: 1, puntos: { open: 1, resolved: 4, accepted: 1 } })
  })

  it('con muchos, cada punto vale varios y ninguna categoría desaparece', () => {
    const r = puntosCiclo({ open: 0, resolved: 300, accepted: 2 }, 60)
    expect(r.porPunto).toBe(6)
    expect(r.puntos).toEqual({ open: 0, resolved: 50, accepted: 1 })
  })
})

describe('escalera de carga', () => {
  // Los escalones reales de la corrida de estrés del 27 de agosto (lab/k6/resultados).
  const pasos: LoadStep[] = [
    { carga: 50, unidad: 'rps', n: 1498, exitosasRps: 49.9, p50: 34.3, p95: 1282, p99: null, errorPct: 0, cpuPct: 14, heapMb: 308.2, estado: 'ok' },
    { carga: 100, unidad: 'rps', n: 2136, exitosasRps: 69.8, p50: 2154.5, p95: 7938.9, p99: null, errorPct: 1.9, cpuPct: 14.8, heapMb: 354.3, estado: 'degradado' },
    { carga: 200, unidad: 'rps', n: 3425, exitosasRps: 27.1, p50: 10000.2, p95: 10001, p99: null, errorPct: 76.3, cpuPct: 16.4, heapMb: 355.1, estado: 'roto' },
    { carga: 300, unidad: 'rps', n: 6353, exitosasRps: 0, p50: 5883.5, p95: 10000.8, p99: null, errorPct: 100, cpuPct: null, heapMb: null, estado: 'roto' },
  ]

  it('marca el quiebre en el primer escalón roto y lo sostenido antes de él', () => {
    const e = escalera(pasos)
    expect(e.quiebre).toBe(2)
    expect(e.sostenido).toBe(0)
  })

  it('todo cae dentro del lienzo, en escritorio y en móvil', () => {
    for (const l of [ESCALERA, ESCALERA_MOVIL]) {
      const e = escalera(pasos, l)
      for (const s of e.escalones) {
        expect(s.x).toBeGreaterThanOrEqual(l.izq)
        expect(s.x + s.ancho).toBeLessThanOrEqual(l.ancho - l.der)
        expect(s.yOfrecido).toBeGreaterThanOrEqual(l.arriba)
        expect(s.yServido!).toBeGreaterThanOrEqual(s.yOfrecido)
        expect(s.yP95!).toBeGreaterThanOrEqual(l.arriba)
        expect(s.yP95!).toBeLessThanOrEqual(e.base)
      }
      expect(e.xRecuperacion).toBeLessThan(l.ancho - l.der)
    }
  })

  it('el p95 sube con la carga (eje logarítmico)', () => {
    const ys = escalera(pasos).escalones.map((s) => s.yP95!)
    expect(ys[0]).toBeGreaterThan(ys[1])
    expect(ys[1]).toBeGreaterThan(ys[2])
  })

  it('sin quiebre no se marca ninguno', () => {
    expect(escalera(pasos.slice(0, 1)).quiebre).toBeNull()
  })

  it('lee steps_json sin confiar en su forma', () => {
    expect(leerEscalones(null)).toEqual([])
    expect(leerEscalones('{roto')).toEqual([])
    expect(leerEscalones('{"a":1}')).toEqual([])
    expect(leerEscalones(JSON.stringify([...pasos, { carga: 'x' }]))).toHaveLength(pasos.length)
  })
})
