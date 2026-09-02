// La costura entre las reglas puras y el almacén.
//
// `debeArrancar`, `parsearEspejo` y `parsearInicio` ya están probados solos.
// Lo que se prueba aquí es lo que ninguno de ellos puede: que el endpoint los
// llame en el orden bueno, escriba en la clave que toca y no se lleve por
// delante lo que escribe otro.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, __setPresentStore } from '../src/lib/present/store'
import { GET, POST } from '../src/pages/api/presentacion'
import { POS_INICIAL } from '../src/lib/presentacion/estado'

const BASE = 'https://codebymike.tech'

beforeEach(() => {
  __setPresentStore(createMemoryStore())
})

afterEach(() => {
  __setPresentStore(null)
})

/** El endpoint recibe el contexto de Astro; aquí solo se usan `request` y `url`. */
const ctx = (u: string, init?: RequestInit) =>
  ({ request: new Request(u, init), url: new URL(u) }) as unknown as Parameters<typeof POST>[0]

const get = async (q = '') => {
  const r = await GET(ctx(`${BASE}/api/presentacion${q}`))
  return { estado: r.status, cuerpo: await r.json() }
}

const post = async (body: unknown) => {
  const r = await POST(
    ctx(`${BASE}/api/presentacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
  return { estado: r.status, cuerpo: await r.json() }
}

/** Lo que publica la pantalla, con lo mínimo para que le acepten la posición. */
const reporte = (over: Record<string, unknown> = {}) => ({
  pos: 1,
  total: 22,
  intro: 2,
  outro: 1,
  origen: 'latido',
  ...over,
})

describe('?q=destino', () => {
  it('trae de gorra todo lo que la sala necesita', () => {
    // Un viaje que ya se hacía dos veces por segundo. Añadir claves aquí es
    // gratis; abrir un sondeo nuevo por cada cosa, no.
    return get('?q=destino').then(({ cuerpo }) => {
      expect(cuerpo).toMatchObject({ destino: POS_INICIAL, scroll: 0, espejo: null, inicio: null })
      expect(typeof cuerpo.ahora).toBe('number')
    })
  })

  it('`ahora` es del reloj del SERVIDOR, que es lo que hace útil a `inicio`', async () => {
    const antes = Date.now()
    const { cuerpo } = await get('?q=destino')
    expect(cuerpo.ahora).toBeGreaterThanOrEqual(antes)
    expect(cuerpo.ahora).toBeLessThanOrEqual(Date.now())
  })
})

describe('el cronómetro', () => {
  it('no arranca hasta que la presentación se mueve de la primera diapositiva', async () => {
    // Abrir la ventana para probar el proyector media hora antes no arranca
    // nada: lo que cuenta es el movimiento, no la carga.
    expect((await get('?q=destino')).cuerpo.inicio).toBeNull()
    await post(reporte())
    expect((await get('?q=destino')).cuerpo.inicio).toBeNull()
  })

  it('arranca con el primer toque que la saca de ahí', async () => {
    const { cuerpo } = await post({ accion: 'siguiente' })
    expect(cuerpo.destino).toBe(POS_INICIAL + 1)
    expect(typeof cuerpo.inicio).toBe('number')
    expect((await get('?q=destino')).cuerpo.inicio).toBe(cuerpo.inicio)
  })

  it('los toques siguientes NO lo reinician', async () => {
    // Es la razón de que `debeArrancar` sea idempotente: esto corre en cada
    // movimiento, y sin la guarda el reloj volvería a cero con cada flecha.
    const primero = (await post({ accion: 'siguiente' })).cuerpo.inicio
    await post({ accion: 'siguiente' })
    const tercero = await post({ accion: 'siguiente' })
    expect(tercero.cuerpo.inicio).toBe(primero)
  })

  it('un salto directo desde la primera diapositiva también lo arranca', async () => {
    const { cuerpo } = await post({ destino: 9 })
    expect(typeof cuerpo.inicio).toBe('number')
  })

  it('un toque que no mueve nada no arranca nada', async () => {
    // La flecha de menos en la primera diapositiva: el destino se queda donde
    // está, así que la charla no ha empezado.
    const { cuerpo } = await post({ accion: 'anterior' })
    expect(cuerpo.destino).toBe(POS_INICIAL)
    expect(cuerpo.inicio).toBeNull()
  })

  it('se reinicia, y vuelve a arrancar solo con el movimiento siguiente', async () => {
    // Con TTL de seis horas, el arranque de un ensayo de la mañana llegaría
    // vivo a la sustentación de la tarde.
    const primero = (await post({ accion: 'siguiente' })).cuerpo.inicio
    expect((await post({ accion: 'reiniciar-cronometro' })).cuerpo.inicio).toBeNull()
    expect((await get('?q=destino')).cuerpo.inicio).toBeNull()

    // Ya no está en la primera diapositiva, así que un toque más no lo
    // rearranca: hay que volver al principio, que es lo que se hace al ensayar.
    await post({ accion: 'siguiente' })
    expect((await get('?q=destino')).cuerpo.inicio).toBeNull()

    await post({ destino: POS_INICIAL })
    const rearranque = await post({ accion: 'siguiente' })
    expect(typeof rearranque.cuerpo.inicio).toBe('number')
    expect(rearranque.cuerpo.inicio).not.toBe(primero)
  })

  it('reiniciar no mueve la presentación', async () => {
    await post({ destino: 7 })
    const { cuerpo } = await post({ accion: 'reiniciar-cronometro' })
    expect(cuerpo.destino).toBe(7)
  })
})

describe('el espejo', () => {
  it('viaja con el reporte de la pantalla y vuelve en el sondeo', async () => {
    await post({ destino: 14 })
    await post(reporte({ pos: 14, espejo: { pos: 14, href: `${BASE}/portal`, seq: 1 } }))
    expect((await get('?q=destino')).cuerpo.espejo).toEqual({
      pos: 14,
      href: `${BASE}/portal`,
      seq: 1,
    })
  })

  it('el de OTRA diapositiva no se sirve', async () => {
    // No es un error: es la vuelta al estado de arranque del beat, y la
    // reinicia cualquier camino que cambie de diapositiva.
    await post({ destino: 14 })
    await post(reporte({ pos: 14, espejo: { pos: 14, href: `${BASE}/portal`, seq: 1 } }))
    await post({ destino: 16 })
    expect((await get('?q=destino')).cuerpo.espejo).toBeNull()
  })

  it('vuelve a aparecer al regresar a su diapositiva', async () => {
    await post({ destino: 14 })
    await post(reporte({ pos: 14, espejo: { pos: 14, href: `${BASE}/portal`, seq: 1 } }))
    await post({ destino: 16 })
    await post({ destino: 14 })
    expect((await get('?q=destino')).cuerpo.espejo?.href).toBe(`${BASE}/portal`)
  })

  it('una URL de fuera del sitio se descarta sin romper el reporte', async () => {
    const { estado } = await post(
      reporte({ espejo: { pos: 1, href: 'https://ejemplo.com/x', seq: 1 } })
    )
    expect(estado).toBe(200)
    expect((await get('?q=destino')).cuerpo.espejo).toBeNull()
  })

  it('un reporte sin espejo no borra el que ya había', async () => {
    // El latido de la pantalla llega cada cinco segundos y no sabe nada de la
    // página de dentro: si lo borrara, la sala volvería sola al arranque del
    // beat en mitad de la demo.
    await post({ destino: 14 })
    await post(reporte({ pos: 14, espejo: { pos: 14, href: `${BASE}/portal`, seq: 3 } }))
    await post(reporte({ pos: 14 }))
    expect((await get('?q=destino')).cuerpo.espejo?.seq).toBe(3)
  })
})

describe('el scroll absoluto de la rueda', () => {
  /** La pantalla publica una página el triple de alta que la ventanilla. */
  const conGeometria = () => post(reporte({ scroll: { y: 0, max: 2400, alto: 900 } }))

  it('escribe la posición entera, sin acumular sobre lo pedido', async () => {
    await conGeometria()
    const { cuerpo } = await post({ accion: 'scroll', y: 742 })
    expect(cuerpo.scroll).toBe(742)
    expect((await get('?q=destino')).cuerpo.scroll).toBe(742)
  })

  it('convive con los saltos del pulgar sobre la misma clave', async () => {
    // Dos escritores de `presentacion:scroll` (§11.5.3). Lo que se comprueba es
    // que el segundo parte de lo que dejó el primero y no de cero.
    await conGeometria()
    await post({ accion: 'scroll', y: 900 })
    const { cuerpo } = await post({ accion: 'bajar' })
    expect(cuerpo.scroll).toBe(1200)
  })

  it('acota contra la geometría publicada, no contra lo que diga el cliente', async () => {
    await conGeometria()
    expect((await post({ accion: 'scroll', y: 99_999 })).cuerpo.scroll).toBe(2400)
  })

  it('sin geometría no escribe nada, y responde con lo que hay', async () => {
    // La diapositiva no trae página viva (o es de otro origen, que es el caso
    // de local). No es un 400: la rueda pudo girar mientras la pantalla
    // cambiaba de beat.
    await post(reporte())
    const { estado, cuerpo } = await post({ accion: 'scroll', y: 600 })
    expect(estado).toBe(200)
    expect(cuerpo.scroll).toBe(0)
  })

  it('un `y` que no es una posición no ensucia lo ya pedido', async () => {
    await conGeometria()
    await post({ accion: 'scroll', y: 600 })
    expect((await post({ accion: 'scroll', y: 'mucho' })).cuerpo.scroll).toBe(600)
  })
})

describe('lo que ya funcionaba sigue funcionando', () => {
  it('el reporte de la pantalla sigue publicando y acotando', async () => {
    await post({ destino: 40 })
    await post(reporte({ pos: 5, total: 22, origen: 'mando' }))
    // El techo real llega con el reporte, así que el destino imposible se acota.
    expect((await get('?q=destino')).cuerpo.destino).toBe(22)
  })

  it('un movimiento ajeno se sigue adoptando como destino', async () => {
    await post({ destino: 3 })
    await post(reporte({ pos: 8, total: 22, origen: 'ajena' }))
    expect((await get('?q=destino')).cuerpo.destino).toBe(8)
  })

  it('una acción desconocida sigue siendo 400', async () => {
    expect((await post({ accion: 'bailar' })).estado).toBe(400)
  })
})
