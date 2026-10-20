import { describe, expect, it } from 'vitest'
import { rellenar, serviciosHero } from '../src/lib/hero-servicios'
import { crearRotacion } from '../src/lib/motion/rotacion'
import { APP_NATIVA_SEMANAS, CAPACITACION, PAQUETES_WEB, REGLAS, formatearMonto } from '../src/data/tarifario'

// Titular rotativo de la portada (RF-038): los cuadros salen del diccionario
// con las cifras del tarifario, y el reloj que los rota es lógica pura.

describe('cuadros del titular rotativo', () => {
  const es = serviciosHero('es')
  const en = serviciosHero('en')

  it('los dos idiomas tienen los mismos cinco servicios, en el mismo orden', () => {
    expect(es.map((s) => s.id)).toEqual(['software', 'capacitacion', 'asesor', 'web', 'apps'])
    expect(en.map((s) => s.id)).toEqual(es.map((s) => s.id))
  })

  it('no queda ningún {marcador} sin rellenar', () => {
    for (const s of [...es, ...en]) {
      expect(s.dato, s.id).not.toMatch(/[{}]/)
    }
  })

  it('las cifras son las del tarifario, en la moneda de cada idioma', () => {
    const porId = (lista: typeof es, id: string) => lista.find((s) => s.id === id)!.dato
    expect(porId(es, 'software')).toContain(formatearMonto(REGLAS.minimo.COP, 'COP'))
    expect(porId(en, 'software')).toContain(formatearMonto(REGLAS.minimo.USD, 'USD'))
    expect(porId(es, 'web')).toContain(formatearMonto(PAQUETES_WEB[0]!.desde.COP, 'COP'))
    expect(porId(en, 'web')).toContain(formatearMonto(PAQUETES_WEB[0]!.desde.USD, 'USD'))
    // La capacitación va en pesos también en inglés (decisión de Mike).
    for (const lista of [es, en]) {
      const cap = porId(lista, 'capacitacion')
      expect(cap).toContain(formatearMonto(CAPACITACION.sesionCOP, 'COP'))
      expect(cap).toContain(String(CAPACITACION.cupo))
      expect(cap).toContain(String(CAPACITACION.horas))
      expect(porId(lista, 'apps')).toContain(String(APP_NATIVA_SEMANAS[1]))
    }
  })

  it('cada cuadro tiene dos líneas, botón y ejemplo para el cotizador', () => {
    for (const s of [...es, ...en]) {
      expect(s.lineas.every((l) => l.trim().length > 0), s.id).toBe(true)
      expect(s.enlace.trim(), s.id).not.toBe('')
      expect(s.ejemplo.trim(), s.id).not.toBe('')
      expect(s.conClientes || s.prueba.trim().length > 0, s.id).toBe(true)
    }
  })

  it('los destinos localizan las rutas y sin proyectos no apuntan a una sección vacía', () => {
    const L = (r: string) => `/en${r}`
    const conProyectos = serviciosHero('en', L, true)
    expect(conProyectos.find((s) => s.id === 'web')!.destino.href).toBe('/en/paginas-web')
    expect(conProyectos.find((s) => s.id === 'software')!.destino.href).toBe('#proyectos')
    const sinProyectos = serviciosHero('en', L, false)
    expect(sinProyectos.find((s) => s.id === 'software')!.destino.href).toBe('/en/contact')
  })

  it('ningún texto usa raya ni voseo', () => {
    const textos = [...es, ...en].flatMap((s) => [...s.lineas, s.dato, s.prueba, s.enlace, s.ejemplo, s.etiqueta])
    for (const x of textos) expect(x).not.toMatch(/[–—]/)
    const soloEs = es.flatMap((s) => [...s.lineas, s.dato, s.prueba, s.enlace, s.ejemplo]).join(' ')
    expect(soloEs).not.toMatch(/\b(vos|podés|querés|tenés|probala)\b/i)
  })

  it('rellenar deja a la vista un marcador desconocido', () => {
    expect(rellenar('desde {minimo} y {otro}', { minimo: '$1' })).toBe('desde $1 y {otro}')
  })
})

describe('reloj de la rotación', () => {
  it('avanza un cuadro al cumplirse la duración y da la vuelta', () => {
    const r = crearRotacion(3, 1000)
    expect(r.avanzar(999)).toBeNull()
    expect(r.progreso).toBeCloseTo(0.999)
    expect(r.avanzar(1)).toBe(1)
    expect(r.progreso).toBe(0)
    r.avanzar(1000)
    expect(r.avanzar(1000)).toBe(0)
  })

  it('un salto largo avanza un solo cuadro', () => {
    const r = crearRotacion(5, 1000)
    expect(r.avanzar(60_000)).toBe(1)
  })

  it('las pausas se acumulan: quitar el cursor no reanuda una pausa manual', () => {
    const r = crearRotacion(3, 1000)
    r.pausar('usuario')
    r.pausar('cursor')
    r.reanudar('cursor')
    expect(r.pausada).toBe(true)
    expect(r.pausadaPorUsuario).toBe(true)
    expect(r.avanzar(5000)).toBeNull()
    r.reanudar('usuario')
    expect(r.avanzar(1000)).toBe(1)
  })

  it('ir a un cuadro reinicia su tiempo y normaliza el índice', () => {
    const r = crearRotacion(5, 1000)
    r.avanzar(800)
    expect(r.ir(7)).toBe(2)
    expect(r.progreso).toBe(0)
    expect(r.ir(-1)).toBe(4)
  })

  it('con un solo cuadro no rota', () => {
    const r = crearRotacion(1, 1000)
    expect(r.avanzar(5000)).toBeNull()
  })
})
