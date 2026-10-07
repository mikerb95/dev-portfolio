import { describe, expect, it } from 'vitest'
import { PAGINAS, systemPrompt } from '../src/lib/asesor/prompt'
import { validarEntrada } from '../src/lib/asesor/bucle'
import { armarTraspaso, EVENTO_TRASPASO } from '../src/lib/asesor/traspaso'
import es from '../src/i18n/es'
import en from '../src/i18n/en'
import { TRABAJOS_REALES } from '../src/data/trabajos-reales'

// Cotizador del hero de la portada (RF-037): la primera vuelta del asesor se
// hace desde "Cuéntame qué necesitas" y, si la persona sigue, pasa entera a la
// burbuja. Aquí se prueba lo que decide esa vuelta sin modelo ni DOM.

const VOSEO = /(?<!\p{L})(vos|sos|podés|querés|tenés|sentís|sabés|necesitás|mirá|contame|decime|fijate)(?!\p{L})/u

describe('contexto de la portada en el prompt', () => {
  it('"inicio" es una página válida del asesor y pasa la validación del request', () => {
    expect(PAGINAS).toContain('inicio')
    const ok = validarEntrada({ locale: 'es', pagina: 'inicio', mensajes: [{ rol: 'usuario', texto: 'Una app para mi barbería' }] })
    expect(ok).toMatchObject({ pagina: 'inicio' })
  })

  it('pide un estimado directo: sin preguntas, con cálculo y tres frases', () => {
    const p = systemPrompt('es', 'inicio')
    expect(p).toContain('Cuéntame qué necesitas')
    expect(p).toMatch(/NO le hagas preguntas/)
    expect(p).toContain('calcular_precio')
    expect(p).toContain('tres frases')
    // Lo publicado manda sobre lo que el modelo "sabe" del tiempo de entrega.
    expect(p).toContain('según lo publicado')
    // Solo el párrafo nuevo: la regla anti-voseo del prompt nombra "vos" a propósito.
    const parrafo = p.slice(p.indexOf('La persona escribió en la portada'), p.indexOf('<informacion_publica>'))
    expect(parrafo).not.toMatch(VOSEO)
    // El contexto es solo de la portada: las demás páginas no lo heredan.
    expect(systemPrompt('es', 'sitio')).not.toContain('Cuéntame qué necesitas')
    expect(systemPrompt('es')).not.toContain('Cuéntame qué necesitas')
  })
})

describe('traspaso a la burbuja', () => {
  it('arma la conversación con la pregunta y la respuesta, y marca las cifras en la respuesta', () => {
    const e = armarTraspaso('Una tienda en línea', {
      texto: 'Mike te haría una tienda. Entre $4.500.000 y $6.000.000.',
      cifras: ['$4.500.000', '$6.000.000'],
      calculos: [{ tipo: 'a_medida', componentes: [{ id: 'catalogo' }] }],
      whatsapp: 'Hola Mike, necesito una tienda',
      conversacion: 'abc',
    })
    expect(e.mensajes).toEqual([
      { rol: 'usuario', texto: 'Una tienda en línea' },
      { rol: 'asesor', texto: 'Mike te haría una tienda. Entre $4.500.000 y $6.000.000.' },
    ])
    // La burbuja indexa las marcas por posición del mensaje: la respuesta es el 1.
    expect(e.marcas).toEqual({ '1': ['$4.500.000', '$6.000.000'] })
    expect(e.calculos).toHaveLength(1)
    expect(e.whatsapp).toBe('Hola Mike, necesito una tienda')
    expect(e.conversacion).toBe('abc')
    expect(e.contacto).toBe('no')
  })

  it('sin cifras ni conversación el estado queda limpio (sin claves vacías que la burbuja interprete)', () => {
    const e = armarTraspaso('Hola', { texto: 'Cuéntame qué necesitas y te doy un estimado.' })
    expect(e.marcas).toEqual({})
    expect(e.calculos).toEqual([])
    expect(e.whatsapp).toBeNull()
    expect('conversacion' in e).toBe(false)
  })

  it('si el asesor pidió el formulario de contacto, la burbuja lo abre', () => {
    expect(armarTraspaso('x', { texto: 'y', contacto: true }).contacto).toBe('visible')
  })

  it('el nombre del evento es estable (lo escuchan dos scripts distintos)', () => {
    expect(EVENTO_TRASPASO).toBe('asesor:continuar')
  })
})

describe('textos del hero', () => {
  it('el titular habla del cliente, no de la disciplina, en los dos idiomas', () => {
    expect(`${es.home.hero.line1} ${es.home.hero.line2} ${es.home.hero.line3}`).toBe('Tu página, tu app o tu sistema, a la medida.')
    expect(en.home.hero.line1.toLowerCase()).toContain('your')
  })

  it('los ejemplos del cotizador caben en el límite del asesor y no tienen voseo ni rayas', () => {
    for (const d of [es, en]) {
      expect(d.home.cotizador.ejemplos.length).toBeGreaterThanOrEqual(3)
      for (const ej of d.home.cotizador.ejemplos) expect(ej.length).toBeLessThanOrEqual(500)
      const todo = JSON.stringify(d.home.cotizador) + JSON.stringify(d.home.hero)
      expect(todo).not.toMatch(/[—–]/)
      if (d === es) expect(todo).not.toMatch(VOSEO)
    }
  })

  it('la línea "Ya en línea" sale de los mismos clientes que la vitrina de /paginas-web', () => {
    expect(TRABAJOS_REALES).toHaveLength(3)
    for (const c of TRABAJOS_REALES) {
      expect(c.url.startsWith('https://')).toBe(true)
      expect(c.url).toContain(c.dominio)
    }
  })
})

describe('portada: lo que destapó la prueba con el modelo real (6 oct 2026)', () => {
  it('la portada no hereda la regla de "1 a 3 preguntas" y pide no anunciar el cálculo', async () => {
    const { systemPrompt } = await import('../src/lib/asesor/prompt')
    const portada = systemPrompt('es', 'inicio')
    expect(portada).not.toContain('1 a 3 preguntas')
    expect(portada).toContain('NO hagas ninguna pregunta antes del estimado')
    expect(systemPrompt('es', 'paginas-web')).toContain('1 a 3 preguntas')
  })

  it('el voseo que se cuela se pasa a tuteo, sin tocar el inglés ni palabras legítimas', async () => {
    const { sinVoseo } = await import('../src/lib/asesor/bucle')
    expect(sinVoseo('Así le paso a Mike un estimado y él confirma todo con vos.', 'es')).toBe('Así le paso a Mike un estimado y él confirma todo contigo.')
    expect(sinVoseo('¿Querés que te ayude? Contame qué necesitás, vos sabés.', 'es')).toBe('¿Quieres que te ayude? Cuéntame qué necesitas, tú sabes.')
    expect(sinVoseo('Si sos dueño de un negocio, podés escribirle.', 'es')).toBe('Si eres dueño de un negocio, puedes escribirle.')
    expect(sinVoseo('Botón SOS y votos de vosotros', 'es')).toBe('Botón SOS y votos de vosotros')
    expect(sinVoseo('Can vos help?', 'en')).toBe('Can vos help?')
  })
})
