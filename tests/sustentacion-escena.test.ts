// La mecánica del escenario. Lo que se prueba es lo que no se ve hasta que
// estás proyectando: que el grafo entero quepa, que la cámara no meta un nodo
// debajo del titular, y que la coreografía escalonada no arranque con un salto.

import { describe, expect, it, vi } from 'vitest'
import {
  ALTO,
  CURVAS,
  Motor,
  aEscena,
  aPantalla,
  acotar,
  disponerNodos,
  encuadre,
  mezclar,
  recortarTitular,
  rgb,
  type NodoVivo,
} from '../src/lib/sustentacion/escena'
import {
  ARISTAS,
  ESCENA,
  LIBS,
  NODOS,
  NODOS_MATRIZ,
  TODOS,
  ESCALERA,
  RECUPERACION,
} from '../src/data/sustentacion-escena'

const nodos = disponerNodos()

describe('datos de la escena', () => {
  it('toda arista conecta dos nodos que existen', () => {
    // Una arista huérfana no rompe nada visible: simplemente no se dibuja, y el
    // beat que existía para mostrar ese camino se queda mudo sin avisar.
    const ids = new Set(TODOS)
    for (const a of ARISTAS) {
      const [origen, destino] = a.split('->')
      expect(ids.has(origen), `${a}: origen desconocido`).toBe(true)
      expect(ids.has(destino), `${a}: destino desconocido`).toBe(true)
    }
  })

  it('cada beat referencia nodos y aristas que existen', () => {
    const ids = new Set(TODOS)
    const claves = new Set(ARISTAS)
    for (const b of ESCENA) {
      for (const id of [...b.encendidos, ...b.destacados]) {
        expect(ids.has(id), `beat ${b.beat}: nodo ${id}`).toBe(true)
      }
      for (const k of b.activas) {
        expect(claves.has(k), `beat ${b.beat}: arista ${k}`).toBe(true)
      }
    }
  })

  it('un nodo destacado está siempre encendido', () => {
    // Destacar un nodo apagado lo deja invisible: el atenuado se aplica sobre
    // el resto y el "protagonista" del beat sería el único que no se ve.
    for (const b of ESCENA) {
      const encendidos = new Set(b.encendidos)
      for (const id of b.destacados) {
        expect(encendidos.has(id), `beat ${b.beat}: ${id} destacado pero apagado`).toBe(true)
      }
    }
  })

  it('la escena cubre los doce beats del guion, en orden', () => {
    expect(ESCENA.map((b) => b.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('los nodos que vuelan a la matriz existen y son diez', () => {
    const ids = new Set(TODOS)
    expect(NODOS_MATRIZ).toHaveLength(10)
    for (const id of NODOS_MATRIZ) expect(ids.has(id)).toBe(true)
  })

  it('las cifras de estrés salen de la medición, no de la escena', () => {
    // Si alguien vuelve a correr k6 y sustituye el JSON, esto sigue pasando; si
    // alguien teclea un número a mano en la diapositiva, no.
    expect(ESCALERA.length).toBeGreaterThan(0)
    expect(RECUPERACION.length).toBeGreaterThan(0)
    const quiebre = ESCALERA.find((e) => e.err > 1)
    expect(quiebre, 'la escalera debe contener el escalón del quiebre').toBeDefined()
    expect(quiebre!.rps).toBe(100)
  })
})

describe('disposición', () => {
  it('coloca todos los nodos y ninguno se solapa con otro de su capa', () => {
    expect(Object.keys(nodos)).toHaveLength(NODOS.length)
    const porCapa = new Map<number, number[]>()
    for (const n of Object.values(nodos)) {
      porCapa.set(n.capa, [...(porCapa.get(n.capa) ?? []), n.x])
    }
    for (const [capa, xs] of porCapa) {
      const unicos = new Set(xs.map((x) => Math.round(x)))
      expect(unicos.size, `capa ${capa}`).toBe(xs.length)
    }
  })

  it('las capas van de arriba abajo sin cruzarse', () => {
    const yPorCapa = new Map<number, number>()
    for (const n of Object.values(nodos)) yPorCapa.set(n.capa, n.y)
    const capas = [...yPorCapa.keys()].sort((a, b) => a - b)
    for (let i = 1; i < capas.length; i++) {
      expect(yPorCapa.get(capas[i])!).toBeGreaterThan(yPorCapa.get(capas[i - 1])!)
    }
  })
})

describe('cámara', () => {
  const dentroDeLaBanda = (cam: ReturnType<typeof encuadre>, ids: readonly string[], abajo: number) => {
    for (const id of ids) {
      const n = nodos[id]
      const [, py] = aPantalla(cam, n.x, n.y)
      expect(py, `${id} fuera de la banda`).toBeGreaterThan(0)
      expect(py, `${id} tapado por el titular`).toBeLessThan(abajo)
    }
  }

  it('el grafo entero cabe sin invadir la banda del titular', () => {
    // Este es el test que importa del beat 3: 32 nodos, con titular abajo.
    const cam = encuadre(TODOS, nodos, { conTexto: true })
    dentroDeLaBanda(cam, TODOS, 812)
  })

  it('sin titular puede usar la pantalla completa', () => {
    const conTexto = encuadre(TODOS, nodos, { conTexto: true })
    const limpio = encuadre(TODOS, nodos, { conTexto: false })
    // Sin texto abajo hay más alto disponible, así que el mismo grupo se ve
    // igual o más grande. Nunca más pequeño.
    expect(limpio.s).toBeGreaterThanOrEqual(conTexto.s)
  })

  it('acerca más un grupo pequeño que el grafo entero', () => {
    const uno = encuadre(['middleware'], nodos, { conTexto: true })
    const todo = encuadre(TODOS, nodos, { conTexto: true })
    expect(uno.s).toBeGreaterThan(todo.s)
  })

  it('respeta el tope de acercamiento', () => {
    const cam = encuadre(['middleware'], nodos, { conTexto: true, escalaMaxima: 1 })
    expect(cam.s).toBeLessThanOrEqual(1)
  })

  it('una lista vacía encuadra el grafo entero en vez de romperse', () => {
    // El beat 1 abre con el grafo apagado y sin nodos que encuadrar. Si esto
    // devolviera NaN, la primera pantalla de la sustentación saldría en negro.
    const cam = encuadre([], nodos, { conTexto: false })
    expect(Number.isFinite(cam.fx)).toBe(true)
    expect(Number.isFinite(cam.fy)).toBe(true)
    expect(cam.s).toBeGreaterThan(0)
  })

  it('aEscena deshace aPantalla', () => {
    const cam = encuadre(LIBS, nodos, { conTexto: true })
    const [px, py] = aPantalla(cam, 640, 480)
    const [x, y] = aEscena(cam, px, py)
    expect(x).toBeCloseTo(640, 6)
    expect(y).toBeCloseTo(480, 6)
  })

  it('centra verticalmente el grupo dentro de su banda', () => {
    const cam = encuadre(TODOS, nodos, { conTexto: false })
    const ys = TODOS.map((id) => aPantalla(cam, 0, nodos[id].y)[1])
    const medio = (Math.min(...ys) + Math.max(...ys)) / 2
    // Sin titular, la banda va de 96 a 968: su centro es 532, no 540.
    expect(medio).toBeCloseTo((96 + 968) / 2, 0)
    expect(medio).toBeLessThan(ALTO)
  })
})

describe('motor de interpolación', () => {
  const objeto = (): NodoVivo => ({ ...nodos['middleware'] })

  it('lleva una propiedad de su valor actual al destino', () => {
    const m = new Motor()
    const o = objeto()
    o.on = 0
    m.a(o, { on: 1 }, 1, 'lin')
    m.avanzar(0.5)
    expect(o.on).toBeCloseTo(0.5, 5)
    m.avanzar(0.5)
    expect(o.on).toBe(1)
    expect(m.pendientes).toBe(0)
  })

  it('captura el punto de partida cuando ARRANCA, no cuando se programa', () => {
    // Un tween escalonado que capturase el valor al programarse volvería atrás
    // de un salto al empezar: es lo que pasa en el beat 3, donde 32 nodos
    // entran con retardos distintos sobre el mismo estado inicial.
    const m = new Motor()
    const o = objeto()
    o.on = 0
    m.a(o, { on: 1 }, 1, 'lin', 1) // espera un segundo
    o.on = 0.5 // algo lo movió mientras esperaba
    m.avanzar(1)
    m.avanzar(0.5)
    expect(o.on).toBeCloseTo(0.75, 5)
  })

  it('un temporizador que programa más temporizadores no se come el siguiente', () => {
    // La escalera del beat 8 encadena pasos desde dentro de un temporizador.
    const m = new Motor()
    const orden: string[] = []
    m.tras(0.1, () => {
      orden.push('a')
      m.tras(0.1, () => orden.push('b'))
    })
    m.avanzar(0.15)
    expect(orden).toEqual(['a'])
    m.avanzar(0.15)
    expect(orden).toEqual(['a', 'b'])
  })

  it('limpiar cancela lo pendiente: volver atrás no arrastra el beat anterior', () => {
    const m = new Motor()
    const o = objeto()
    const fn = vi.fn()
    m.a(o, { on: 1 }, 1, 'lin')
    m.tras(0.5, fn)
    m.limpiar()
    m.avanzar(2)
    expect(o.on).toBe(0)
    expect(fn).not.toHaveBeenCalled()
  })

  it('una duración cero salta directo al destino sin dividir por cero', () => {
    const m = new Motor()
    const o = objeto()
    m.a(o, { hl: 0.28 }, 0, 'lin')
    m.avanzar(0.016)
    expect(o.hl).toBe(0.28)
  })

  it('todas las curvas van de 0 a 1 y no se salen por el camino', () => {
    for (const [nombre, f] of Object.entries(CURVAS)) {
      expect(f(0), nombre).toBeCloseTo(0, 3)
      expect(f(1), nombre).toBeCloseTo(1, 3)
      for (let t = 0; t <= 1; t += 0.05) {
        // `back` sobrepasa a propósito; el resto no debe irse lejos.
        const v = f(t)
        expect(Number.isFinite(v), `${nombre} en ${t}`).toBe(true)
        expect(v, `${nombre} en ${t}`).toBeGreaterThan(-0.3)
        expect(v, `${nombre} en ${t}`).toBeLessThan(1.3)
      }
    }
  })
})

describe('color y texto', () => {
  it('mezclar respeta los extremos', () => {
    expect(mezclar('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mezclar('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mezclar('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('mezclar acota fuera de rango en vez de generar un color inválido', () => {
    expect(mezclar('#000000', '#ffffff', 2)).toBe('#ffffff')
    expect(mezclar('#000000', '#ffffff', -1)).toBe('#000000')
  })

  it('rgb devuelve lo que comen rgba() y los gradientes', () => {
    expect(rgb('#7dd3fc')).toBe('125,211,252')
  })

  it('el titular se recorta a siete palabras', () => {
    expect(recortarTitular('Un monolito modular, no microservicios')).toBe(
      'Un monolito modular, no microservicios'
    )
    expect(recortarTitular('una dos tres cuatro cinco seis siete ocho nueve')).toBe(
      'una dos tres cuatro cinco seis siete'
    )
  })

  it('los titulares de la escena caben sin recorte', () => {
    // Si un titular nuevo se pasa de largo, se entera aquí y no proyectado.
    for (const b of ESCENA) {
      expect(recortarTitular(b.titular), `beat ${b.beat}`).toBe(b.titular)
    }
  })

  it('acotar hace lo que dice', () => {
    expect(acotar(5, 0, 1)).toBe(1)
    expect(acotar(-5, 0, 1)).toBe(0)
    expect(acotar(0.5, 0, 1)).toBe(0.5)
  })
})
