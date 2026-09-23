import { describe, expect, it } from 'vitest'
import { base, multiplicar, perspectiva, rayoAlSuelo, vista, type Camara } from '../src/lib/motion/camara'
import { fnv1a, paletaDe, semillaDe } from '../src/lib/motion/portadas'
import { estadosEtapas, trazadoHorizontal, trazadoVertical } from '../src/lib/motion/pipeline'
import { HUELLA_NEUTRA, idCorto, parametrosDe } from '../src/lib/motion/huella'

// Lógica pura detrás de las piezas de motion de la portada. Lo que se dibuja
// en WebGL no se puede probar aquí, pero sí todo lo que decide QUÉ se dibuja:
// dónde cae el cursor sobre el terreno, qué mapa le toca a cada proyecto, en
// qué etapa va el pipeline y qué huella sale de un hash.

const camara: Camara = { pos: [0, 2.5, 0], objetivo: [0, 0.1, 10], fov: (44 * Math.PI) / 180, aspecto: 16 / 9 }

// Proyecta un punto del mundo a NDC con las mismas matrices que usa el shader.
function proyectar(c: Camara, p: [number, number, number]) {
  const m = multiplicar(perspectiva(c.fov, c.aspecto, 0.1, 120), vista(c))
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  return { x: x / w, y: y / w, w }
}

describe('cámara del terreno', () => {
  it('la base es ortonormal y la derecha de la pantalla es +x', () => {
    const { frente, derecha, arriba } = base(camara)
    const punto = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(punto(frente, derecha)).toBeCloseTo(0, 6)
    expect(punto(frente, arriba)).toBeCloseTo(0, 6)
    expect(derecha[0]).toBeGreaterThan(0.99)
    expect(arriba[1]).toBeGreaterThan(0)
  })

  it('el rayo del cursor y la proyección del shader son inversos: el pico cae bajo el puntero', () => {
    for (const [nx, ny] of [
      [0, -0.4],
      [0.6, -0.8],
      [-0.7, -0.2],
    ]) {
      const suelo = rayoAlSuelo(camara, nx, ny, 1.05)
      expect(suelo).not.toBeNull()
      const p = proyectar(camara, [suelo!.x, 1.05, suelo!.z])
      expect(p.w).toBeGreaterThan(0)
      expect(p.x).toBeCloseTo(nx, 4)
      expect(p.y).toBeCloseTo(ny, 4)
    }
  })

  it('por encima del horizonte no hay suelo que levantar', () => {
    expect(rayoAlSuelo(camara, 0, 0.95)).toBeNull()
  })
})

describe('portadas generativas', () => {
  it('la semilla es determinista por slug y distinta entre slugs parecidos', () => {
    expect(semillaDe('brixo')).toEqual(semillaDe('brixo'))
    expect(semillaDe('Brixo')).toEqual(semillaDe('brixo'))
    const a = semillaDe('brixo')
    const b = semillaDe('brixo-jdk')
    expect(a.id).not.toBe(b.id)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1)
  })

  it('la escala queda en un rango que siempre produce un mapa legible', () => {
    for (const slug of ['dobleyo', 'SENA-Uptime', 'talento_tech_proyecto_final', 'x', '']) {
      const s = semillaDe(slug)
      expect(s.escala).toBeGreaterThanOrEqual(1.6)
      expect(s.escala).toBeLessThanOrEqual(3)
      expect(s.id).toMatch(/^[0-9a-f]{6}$/)
    }
  })

  it('FNV-1a coincide con los vectores de referencia', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
  })

  it('el color sale de la tecnología principal y cae en la paleta de marca', () => {
    expect(paletaDe(['PHP']).linea).toEqual(paletaDe(['CodeIgniter', 'MySQL']).linea)
    expect(paletaDe(['TypeScript']).linea).not.toEqual(paletaDe(['PHP']).linea)
    expect(paletaDe([]).linea).toEqual([0, 242, 255])
  })
})

describe('pipeline de "Cómo trabajo"', () => {
  const nodos = [100, 400, 700, 1000].map((x) => ({ x, y: 50 }))

  it('las distancias a cada nodo crecen y la total llega al final de la pista', () => {
    const t = trazadoHorizontal(nodos, -24, 1200)
    for (let i = 1; i < t.nodos.length; i++) expect(t.nodos[i]).toBeGreaterThan(t.nodos[i - 1])
    // El escalón alarga el recorrido respecto a la recta.
    expect(t.total).toBeGreaterThan(1224)
    expect(t.d.startsWith('M-24 50')).toBe(true)
    expect(t.d.endsWith('L1200 50')).toBe(true)
  })

  it('el trazado vertical pasa exactamente por los nodos', () => {
    const t = trazadoVertical(
      [0, 150, 300].map((y) => ({ x: 10, y })),
      -24,
      310,
    )
    expect(t.nodos).toEqual([24, 174, 324])
    expect(t.total).toBe(334)
  })

  it('las etapas pasan de en cola a en curso a listas según el recorrido', () => {
    const t = trazadoHorizontal(nodos, -24, 1200)
    expect(estadosEtapas(0, t)).toEqual(['pendiente', 'pendiente', 'pendiente', 'pendiente'])
    expect(estadosEtapas(t.nodos[0], t)).toEqual(['corriendo', 'pendiente', 'pendiente', 'pendiente'])
    expect(estadosEtapas((t.nodos[2] + t.nodos[3]) / 2, t)).toEqual(['listo', 'listo', 'corriendo', 'pendiente'])
    // Al llegar a producción ya no hay nada en curso.
    expect(estadosEtapas(t.total, t)).toEqual(['listo', 'listo', 'listo', 'listo'])
  })
})

describe('huella del visitante', () => {
  const hash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'

  it('el mismo hash da la misma huella y otro hash da otra', () => {
    expect(parametrosDe(hash)).toEqual(parametrosDe(hash))
    expect(parametrosDe(hash)).not.toEqual(parametrosDe('00' + hash.slice(2)))
  })

  it('todos los parámetros caen en rangos que siguen pareciendo una huella', () => {
    for (const h of [hash, '0'.repeat(64), 'f'.repeat(64), 'zz', '']) {
      const p = parametrosDe(h)
      expect(Math.abs(p.cx)).toBeLessThanOrEqual(0.05)
      expect(p.cy).toBeGreaterThanOrEqual(-0.04)
      expect(p.cy).toBeLessThanOrEqual(0.08)
      expect(p.aniso).toBeGreaterThanOrEqual(0.7)
      expect(p.aniso).toBeLessThanOrEqual(0.95)
      // Entero: con vueltas fraccionarias el corte del ángulo dejaría costura.
      expect(Number.isInteger(p.espiral)).toBe(true)
      expect([0, 1, 2]).toContain(p.espiral)
      expect(p.lazo).toBeGreaterThanOrEqual(0)
      expect(p.lazo).toBeLessThanOrEqual(0.9)
    }
  })

  it('la huella neutra no depende de ningún dato del visitante', () => {
    expect(HUELLA_NEUTRA.espiral).toBe(0)
    expect(idCorto(hash)).toBe('b94d27b9')
  })
})
