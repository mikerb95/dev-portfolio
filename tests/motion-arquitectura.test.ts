import { describe, expect, it } from 'vitest'
import es from '../src/i18n/es'
import en from '../src/i18n/en'
import { HONEYPOT_PATHS, classify } from '../src/lib/security/classify'
import {
  CASOS,
  CASO_DE_DECISION,
  COMBINACIONES,
  EXTERNOS,
  NODOS_POR_CAPA,
  PETICIONES,
  claveFallos,
  guion,
  todosLosGuiones,
  type Pasada,
} from '../src/lib/motion/trazado'
import { pasadasHtml, rotuloStatus, tonoStatus, type TextosTrazado } from '../src/lib/motion/trazado-html'

// El trazador de /architecture promete que su recorrido sale de las funciones
// del middleware. Estos tests fijan que cada caso termina donde el texto dice,
// y que el guion no publica nada que sirva de manual de ataque.

const OK = { sensor: false, turso: false }
const SENSOR = { sensor: true, turso: false }
const TURSO = { sensor: false, turso: true }
const ultimo = (p: Pasada) => p.pasos[p.pasos.length - 1]

describe('identidades del diagrama', () => {
  it('NODOS_POR_CAPA cuadra con las capas de los dos diccionarios', () => {
    for (const d of [es, en]) {
      expect(d.architecture.layers.map((l) => l.nodes.length)).toEqual(NODOS_POR_CAPA.map((c) => c.length))
    }
  })

  it('EXTERNOS cuadra con los servicios externos y CASO_DE_DECISION con las decisiones', () => {
    expect(es.architecture.externals.length).toBe(EXTERNOS.length)
    expect(es.architecture.decisions.length).toBe(CASO_DE_DECISION.length)
    expect(en.architecture.decisions.length).toBe(CASO_DE_DECISION.length)
  })

  it('cada nota, final y etiqueta del guion tiene texto en los dos idiomas', () => {
    const g = todosLosGuiones()
    for (const d of [es, en]) {
      const tz = d.architecture.trazador
      for (const caso of CASOS) {
        expect(tz.casos[caso].titulo).toBeTruthy()
        for (const pasadas of Object.values(g[caso])) {
          for (const p of pasadas) {
            expect(tz.finales[p.final]).toBeTruthy()
            if (p.etiqueta) expect(tz.pasadas[p.etiqueta]).toBeTruthy()
            for (const paso of p.pasos) expect(tz.notas[paso.nota]).toBeTruthy()
          }
        }
      }
    }
  })
})

describe('recorridos', () => {
  it('el visitante: la primera visita llega a la base, la segunda muere en la CDN con un HIT', () => {
    const [primera, segunda] = guion('visitante', OK)
    expect(primera.cache).toBe('MISS')
    expect(ultimo(primera).nodo).toBe('lecturas')
    expect(segunda.cache).toBe('HIT')
    expect(ultimo(segunda)).toMatchObject({ nodo: 'cdn', estado: 'responde' })
    expect(segunda.pasos.some((p) => p.nodo === 'funciones')).toBe(false)
    expect(segunda.externos).toEqual(['vercel'])
  })

  it('con Turso caído, /status sigue dando 200 (modo respaldo) y el HIT ni se entera', () => {
    const [primera, segunda] = guion('visitante', TURSO)
    expect(primera.status).toBe(200)
    expect(ultimo(primera)).toMatchObject({ nodo: 'lecturas', estado: 'falla' })
    expect(segunda.final).toBe('hitConTursoCaido')
  })

  it('el escáner: la herramienta muere en el WAF; el sondeo queda anotado por el sensor', () => {
    const [herramienta, sondeo] = guion('escaner', OK)
    expect(herramienta.pasos).toEqual([{ nodo: 'waf', estado: 'corta', nota: 'wafHerramienta' }])
    expect(herramienta.status).toBe(403)
    expect(sondeo.pasos.find((p) => p.nodo === 'siem')?.estado).toBe('registra')
    expect(classify({ method: 'GET', path: PETICIONES.sondeo.ruta })?.category).toBe('secrets_probing')
    expect(sondeo.status).toBe(404)
  })

  it('fail-open: con el sensor caído, el sondeo sigue su curso y obtiene la misma respuesta', () => {
    const [, conSensor] = guion('escaner', OK)
    const [, sinSensor] = guion('escaner', SENSOR)
    expect(sinSensor.pasos.find((p) => p.nodo === 'siem')?.estado).toBe('falla')
    expect(sinSensor.status).toBe(conSensor.status)
    expect(ultimo(sinSensor).nodo).toBe(ultimo(conSensor).nodo)
  })

  it('el atajo /en/admin se corta en la normalización de idioma, antes del sensor', () => {
    const [p] = guion('atajo', OK)
    expect(ultimo(p)).toMatchObject({ nodo: 'idioma', estado: 'corta' })
    expect(p.pasos.some((x) => x.nodo === 'siem')).toBe(false)
    expect(p.status).toBe(404)
  })

  it('el orden del middleware: idioma antes que sensor, sensor antes que sesión', () => {
    for (const caso of CASOS) {
      for (const f of COMBINACIONES) {
        for (const p of guion(caso, f)) {
          const i = p.pasos.findIndex((x) => x.nodo === 'idioma')
          const s = p.pasos.findIndex((x) => x.nodo === 'siem')
          const a = p.pasos.findIndex((x) => x.nodo === 'auth' || x.nodo === 'portal')
          if (s >= 0) expect(i).toBeLessThan(s)
          if (a >= 0 && s >= 0) expect(s).toBeLessThan(a)
        }
      }
    }
  })

  it('fail-closed: con Turso caído, el panel responde 503 en la sesión y no llega a pintarse', () => {
    const [p] = guion('panel', TURSO)
    expect(p.status).toBe(503)
    expect(ultimo(p)).toMatchObject({ nodo: 'auth', estado: 'corta', nota: 'revocacionCerrada' })
    expect(p.pasos.some((x) => x.nodo === 'panel')).toBe(false)
  })

  it('con el sensor caído el panel entra igual: solo la autorización falla cerrada', () => {
    expect(guion('panel', SENSOR)[0].status).toBe(200)
  })

  it('el cliente llega a la base con su sesión; sin Turso, vuelve al login', () => {
    expect(guion('cliente', OK)[0]).toMatchObject({ status: 200 })
    expect(ultimo(guion('cliente', OK)[0]).nota).toBe('clientIdDeSesion')
    expect(guion('cliente', TURSO)[0]).toMatchObject({ status: 302, final: 'portalAlLogin' })
  })

  it('la demo lee de su base y tiene la bóveda vetada aunque sea GET', () => {
    const [lectura, boveda] = guion('demo', OK)
    expect(ultimo(lectura).nota).toBe('baseDemo')
    expect(boveda.metodo).toBe('GET')
    expect(boveda).toMatchObject({ status: 403, final: 'aunqueSeaGet' })
    expect(guion('demo', TURSO)[0].status).toBeNull()
  })

  it('todas las combinaciones de fallos tienen guion para cada caso', () => {
    const g = todosLosGuiones()
    for (const caso of CASOS) {
      expect(Object.keys(g[caso]).sort()).toEqual(COMBINACIONES.map(claveFallos).sort())
    }
  })
})

describe('OPSEC', () => {
  it('ninguna ruta del guion es un señuelo', () => {
    const g = todosLosGuiones()
    for (const caso of CASOS) {
      for (const pasadas of Object.values(g[caso])) {
        for (const p of pasadas) expect(HONEYPOT_PATHS.has(p.ruta)).toBe(false)
      }
    }
  })

  it('lo que viaja al navegador no lleva identificadores de reglas ni nombres de categorías', () => {
    const json = JSON.stringify(todosLosGuiones())
    expect(json).not.toMatch(/ruleId|secrets_probing|bad_bot|recon_cms|honeypot/)
  })
})

describe('marcado de las pasadas', () => {
  const t: TextosTrazado = {
    notas: es.architecture.trazador.notas,
    finales: es.architecture.trazador.finales,
    pasadas: es.architecture.trazador.pasadas,
    nombres: Object.fromEntries(
      NODOS_POR_CAPA.flatMap((ids, c) => ids.map((id, n) => [id, es.architecture.layers[c].nodes[n].name]))
    ) as TextosTrazado['nombres'],
    sinCodigo: 'error',
  }

  it('un paso por <li>, con su estado, y el código con caché', () => {
    const pasadas = guion('visitante', OK)
    const html = pasadasHtml(pasadas, t)
    expect(html.match(/<li /g)?.length).toBe(pasadas.reduce((n, p) => n + p.pasos.length, 0))
    expect(html).toContain('200 · HIT')
    expect(html).toContain('data-estado="responde"')
  })

  it('escapa el texto', () => {
    const html = pasadasHtml(guion('atajo', OK), { ...t, nombres: { ...t.nombres, idioma: '<b>x</b>' } })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('rótulo y tono del código', () => {
    expect(rotuloStatus({ status: null, cache: null }, 'error')).toBe('error')
    expect(tonoStatus(200)).toBe('ok')
    expect(tonoStatus(302)).toBe('desvio')
    expect(tonoStatus(503)).toBe('corte')
    expect(tonoStatus(null)).toBe('corte')
  })
})
