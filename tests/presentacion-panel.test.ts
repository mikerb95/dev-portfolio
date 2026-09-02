import { describe, expect, it } from 'vitest'
import {
  ATAJOS,
  destinoAtajo,
  estimadoHasta,
  estimadoTotal,
  formatearDesvio,
  indice,
  MODOS,
  parsearModo,
  ritmo,
  salud,
  siguienteModo,
  tituloDe,
  TOLERANCIA_MS,
  type Modo,
} from '../src/lib/presentacion/panel'
import { totalGlobal, type Mazo } from '../src/lib/presentacion/mapa'

/** El mazo real de la sustentación: cita + portada, 19 beats, cierre. */
const MAZO: Mazo = { intro: 2, beats: 19, outro: 1 }

describe('el modo del panel', () => {
  it('cicla oculto -> barra -> consola -> oculto', () => {
    expect(siguienteModo('oculto')).toBe('barra')
    expect(siguienteModo('barra')).toBe('consola')
    expect(siguienteModo('consola')).toBe('oculto')
  })

  it('vuelve al principio dando la vuelta entera', () => {
    let m: Modo = 'oculto'
    for (const _ of MODOS) m = siguienteModo(m)
    expect(m).toBe('oculto')
  })

  it('recupera el modo guardado', () => {
    for (const m of MODOS) expect(parsearModo(m)).toBe(m)
  })

  it('cae en consola con cualquier basura, nunca en oculto', () => {
    // Una recarga a mitad de charla no puede dejar al ponente sin guion.
    for (const v of [null, undefined, '', 'CONSOLA', 7, {}, ['barra']]) {
      expect(parsearModo(v)).toBe('consola')
    }
  })
})

describe('el índice del mazo', () => {
  it('cubre el mazo entero, con su número global', () => {
    const lista = indice(MAZO)
    expect(lista).toHaveLength(totalGlobal(MAZO))
    expect(lista.map((e) => e.n)).toEqual(lista.map((_, i) => i + 1))
  })

  it('marca las tres zonas donde el mazo las tiene', () => {
    const zonas = indice(MAZO).map((e) => e.zona)
    expect(zonas.slice(0, 2)).toEqual(['intro', 'intro'])
    expect(zonas.slice(2, 21).every((z) => z === 'beat')).toBe(true)
    expect(zonas.at(-1)).toBe('outro')
  })

  it('sale de la forma descubierta y no de la longitud del guion', () => {
    // Un beat nuevo sin notas escritas tiene que seguir siendo alcanzable.
    const crecido: Mazo = { intro: 2, beats: 40, outro: 1 }
    const lista = indice(crecido)
    expect(lista).toHaveLength(43)
    expect(lista.at(-1)).toMatchObject({ n: 43, zona: 'outro' })
    // Los que se salen del guion aparecen, con el título vacío.
    expect(lista.filter((e) => e.titulo === '').length).toBeGreaterThan(0)
  })

  it('tituloDe coincide con el índice y no revienta fuera de rango', () => {
    const lista = indice(MAZO)
    for (const e of lista) expect(tituloDe(MAZO, e.n)).toBe(e.titulo)
    expect(() => tituloDe(MAZO, 0)).not.toThrow()
    expect(() => tituloDe(MAZO, 999)).not.toThrow()
  })
})

describe('el ritmo contra el guion', () => {
  it('no cuenta la diapositiva actual: su reloj está corriendo', () => {
    const uno = estimadoHasta(MAZO, 1)
    expect(uno).toBe(0)
    // De la 3 a la 4 se suma exactamente lo que dura la 3.
    const paso = estimadoHasta(MAZO, 4) - estimadoHasta(MAZO, 3)
    expect(paso).toBe(indice(MAZO)[2]?.dur)
  })

  it('el estimado total es la suma de todas', () => {
    expect(estimadoTotal(MAZO)).toBe(
      indice(MAZO).reduce((s, e) => s + e.dur, 0)
    )
    expect(estimadoTotal(MAZO)).toBeGreaterThan(0)
  })

  it('sin reloj arrancado no inventa un desvío', () => {
    const r = ritmo(MAZO, 10, null)
    expect(r.senal).toBe('sin-reloj')
    expect(r.desvioMs).toBeNull()
    // Pero lo que queda por delante sí se sabe, y es útil antes de empezar.
    expect(r.restanteMs).toBeGreaterThan(0)
  })

  it('sin tramo estimado tampoco: diría "vas largo" en una charla perfecta', () => {
    // La posición 1 no tiene nada por detrás que estimar.
    const r = ritmo(MAZO, 1, 8 * 60_000)
    expect(r.senal).toBe('sin-guion')
    expect(r.desvioMs).toBeNull()
  })

  it('avisa de largo y de corto solo pasada la tolerancia', () => {
    const esperado = estimadoHasta(MAZO, 8) * 1000
    expect(ritmo(MAZO, 8, esperado).senal).toBe('a-tiempo')
    expect(ritmo(MAZO, 8, esperado + TOLERANCIA_MS).senal).toBe('a-tiempo')
    expect(ritmo(MAZO, 8, esperado + TOLERANCIA_MS + 1).senal).toBe('largo')
    expect(ritmo(MAZO, 8, esperado - TOLERANCIA_MS - 1).senal).toBe('corto')
  })

  it('el desvío es real menos estimado, con su signo', () => {
    const esperado = estimadoHasta(MAZO, 12) * 1000
    expect(ritmo(MAZO, 12, esperado + 90_000).desvioMs).toBe(90_000)
    expect(ritmo(MAZO, 12, esperado - 90_000).desvioMs).toBe(-90_000)
  })

  it('lo que queda se agota al llegar al final', () => {
    expect(ritmo(MAZO, totalGlobal(MAZO) + 5, 0).restanteMs).toBe(0)
  })

  it('formatea el desvío con el signo delante', () => {
    expect(formatearDesvio(80_000)).toBe('+1:20')
    expect(formatearDesvio(-45_000)).toBe('-0:45')
    expect(formatearDesvio(0)).toBe('+0:00')
    expect(formatearDesvio(null)).toBe('')
    expect(formatearDesvio(Number.NaN)).toBe('')
  })
})

describe('la salud del enlace', () => {
  const base = { hayMazo: true, hayRed: true, aplicando: false, pos: 5, destino: 5 }

  it('el mazo sin montar manda sobre la red', () => {
    // Culpar a la red mandaría a mirar el WiFi cuando hay que recargar el lienzo.
    expect(salud({ ...base, hayMazo: false, hayRed: false }).estado).toBe('sin-mazo')
  })

  it('sin red lo dice, y dice que el mazo sigue', () => {
    const s = salud({ ...base, hayRed: false })
    expect(s.estado).toBe('sin-red')
    expect(s.texto).toContain('sigue')
  })

  it('en viaje dice hacia dónde y en qué sentido', () => {
    expect(salud({ ...base, destino: 9 }).texto).toBe('avanzando a 9')
    expect(salud({ ...base, destino: 2 }).texto).toBe('volviendo a 2')
  })

  it('reconciliando cuenta como movimiento aunque el número ya coincida', () => {
    expect(salud({ ...base, aplicando: true }).estado).toBe('moviendo')
  })

  it('en reposo, en línea', () => {
    expect(salud(base).estado).toBe('en-linea')
  })
})

describe('los atajos de las páginas vivas', () => {
  it('resuelve contra la URL viva, no contra el origen de esta ventana', () => {
    // En local el mazo enmarca producción: un atajo relativo a localhost
    // llevaría a una página que no existe.
    expect(destinoAtajo('https://codebymike.tech/portal/facturas', '/status')).toBe(
      'https://codebymike.tech/status'
    )
  })

  it('sin URL viva no hay a dónde ir', () => {
    expect(destinoAtajo(null, '/status')).toBeNull()
  })

  it('todos los atajos resuelven y ninguno es absoluto a un dominio ajeno', () => {
    for (const a of ATAJOS) {
      const url = destinoAtajo('https://codebymike.tech/portal/login', a.href)
      expect(url).not.toBeNull()
      expect(new URL(url as string).origin).toBe('https://codebymike.tech')
    }
  })

  it('la demo del portal es el primer atajo: es la puerta del runbook', () => {
    expect(ATAJOS[0]?.href).toBe('/api/portal/demo')
  })
})
