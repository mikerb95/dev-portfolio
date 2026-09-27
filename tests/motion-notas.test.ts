import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  agruparPorMes,
  claveMapa,
  conteoFamilias,
  enlacesANotas,
  familiasDe,
  hex,
  minutosLectura,
  PALETA_FAMILIA,
  PALABRAS_POR_MINUTO,
  relacionadas,
  type NotaMeta,
} from '../src/lib/notes-meta'
import { circular, minutosRestantes, ritmoFicha } from '../src/lib/motion/notas'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('familiasDe', () => {
  it('ordena por la primera etiqueta conocida y no repite', () => {
    expect(familiasDe(['seguridad', 'observabilidad', 'sre'])).toEqual(['seguridad', 'operacion'])
    expect(familiasDe(['pagos', 'seguridad', 'producto'])).toEqual(['seguridad'])
  })
  it('las etiquetas en inglés caen en la misma familia que su hermana', () => {
    expect(familiasDe(['security', 'observability', 'sre'])).toEqual(familiasDe(['seguridad', 'observabilidad', 'sre']))
    expect(familiasDe(['testing', 'quality', 'ci-cd'])).toEqual(familiasDe(['testing', 'calidad', 'ci-cd']))
  })
  it('sin etiquetas conocidas cae en arquitectura', () => {
    expect(familiasDe([])).toEqual(['arquitectura'])
    expect(familiasDe(['cualquier-cosa'])).toEqual(['arquitectura'])
  })
  it('cada familia tiene un color de la marca', () => {
    for (const p of Object.values(PALETA_FAMILIA)) expect(hex(p.linea)).toMatch(/^#[0-9a-f]{6}$/)
    expect(hex([255, 107, 61])).toBe('#ff6b3d')
  })
})

describe('claveMapa', () => {
  it('la versión inglesa usa el slug español: mismo mapa en los dos idiomas', () => {
    expect(claveMapa({ slug: 'por-que-construi-mi-propio-monitor', lang: 'es' })).toBe('por-que-construi-mi-propio-monitor')
    expect(
      claveMapa({ slug: 'why-i-built-my-own-uptime-monitor', lang: 'en', translationOf: 'por-que-construi-mi-propio-monitor' }),
    ).toBe('por-que-construi-mi-propio-monitor')
    expect(claveMapa({ slug: 'solo-en-ingles', lang: 'en' })).toBe('solo-en-ingles')
  })
})

describe('minutosLectura', () => {
  it('redondea hacia arriba y nunca baja de 1', () => {
    expect(minutosLectura('')).toBe(1)
    expect(minutosLectura('hola')).toBe(1)
    expect(minutosLectura(Array(PALABRAS_POR_MINUTO + 1).fill('palabra').join(' '))).toBe(2)
  })
  it('no cuenta las URLs de los enlaces ni la puntuación suelta', () => {
    const justas = Array(PALABRAS_POR_MINUTO - 1).fill('x').join(' ')
    // 219 palabras + el texto del enlace = 220: un minuto justo, aunque la URL
    // y los guiones sueltos sumarían varias "palabras" más.
    expect(minutosLectura(`${justas} - - - [a](https://ejemplo.com/una/ruta/larga)`)).toBe(1)
  })
})

describe('enlacesANotas', () => {
  it('encuentra enlaces en los dos idiomas, sin repetir', () => {
    const cuerpo = 'ver [esto](/notes/a-b) y [aquello](/en/notes/c-d) y otra vez [esto](/notes/a-b/#seccion) pero no [status](/status)'
    expect(enlacesANotas(cuerpo)).toEqual(['a-b', 'c-d'])
  })
})

describe('relacionadas', () => {
  const nota = (slug: string, tags: string[], fecha: string, enlaces: string[] = []): NotaMeta => ({
    slug,
    tags,
    date: d(fecha),
    enlaces,
  })
  const todas = [
    nota('actual', ['seguridad', 'auth'], '2026-07-20', ['enlazada']),
    nota('enlazada', ['costos'], '2026-01-01'),
    nota('me-enlaza', ['rag'], '2026-01-02', ['actual']),
    nota('dos-tags', ['seguridad', 'auth'], '2026-03-01'),
    nota('un-tag-cerca', ['seguridad'], '2026-07-19'),
    nota('un-tag-lejos', ['seguridad'], '2026-01-01'),
    nota('nada', ['rag'], '2026-07-20'),
  ]

  it('un enlace escrito a mano pesa más que las etiquetas, en cualquier sentido', () => {
    const r = relacionadas(todas[0], todas, 7).map((x) => x.slug)
    // enlazada / me-enlaza: enlace = 4; dos-tags: 2 etiquetas + familia = 3.
    expect(r.slice(0, 2).sort()).toEqual(['enlazada', 'me-enlaza'])
    expect(r[2]).toBe('dos-tags')
  })
  it('a igual puntaje gana la más cercana en fecha', () => {
    const r = relacionadas(todas[0], todas, 7).map((x) => x.slug)
    expect(r.indexOf('un-tag-cerca')).toBeLessThan(r.indexOf('un-tag-lejos'))
  })
  it('nunca se incluye a sí misma ni a una nota sin nada en común', () => {
    const r = relacionadas(todas[0], todas, 7).map((x) => x.slug)
    expect(r).not.toContain('actual')
    expect(r).not.toContain('nada')
  })
})

describe('agruparPorMes y conteoFamilias', () => {
  it('agrupa por mes UTC: el 1 de agosto no cae en julio', () => {
    const g = agruparPorMes([{ date: d('2026-08-01') }, { date: d('2026-07-31') }, { date: d('2026-07-05') }])
    expect(g.map((x) => [x.clave, x.notas.length])).toEqual([
      ['2026-08', 1],
      ['2026-07', 2],
    ])
  })
  it('una nota cuenta en todas sus familias', () => {
    expect(conteoFamilias([{ tags: ['seguridad', 'testing'] }, { tags: ['sre'] }])).toEqual({
      seguridad: 1,
      operacion: 1,
      calidad: 1,
      arquitectura: 0,
    })
  })
})

describe('ritmo de la ficha', () => {
  const corta = { problem: 'Un problema.', rejected: 'Lo obvio', chosen: 'Lo otro' }
  const larga = {
    problem: 'Un prefijo /en le da un segundo nombre a cada ruta, y los guardas comparan nombres.',
    rejected: 'Enseñarle idiomas a cada guarda',
    chosen: 'El clientId sale de la sesión y va en cada WHERE; lo ajeno da 404',
  }

  it('las fases van en orden y el tecleo no pasa de ~3 s', () => {
    for (const f of [corta, larga]) {
      const r = ritmoFicha(f)
      expect(r.problema).toBeLessThan(r.descartado)
      expect(r.descartado).toBeLessThan(r.tachon)
      expect(r.tachon).toBeLessThan(r.decidido)
      expect(r.completa).toBeCloseTo(r.decidido + r.tecleo, 2)
      expect(r.tecleo).toBeLessThanOrEqual(3)
    }
  })
  it('la ficha se queda quieta, completa, al menos lo que tarda en leerse', () => {
    for (const f of [corta, larga]) {
      const r = ritmoFicha(f)
      const palabras = `${f.problem} ${f.rejected} ${f.chosen}`.split(/\s+/).length
      expect(r.total - r.completa).toBeGreaterThanOrEqual(Math.max(4, (palabras / 230) * 60) - 0.01)
    }
    expect(ritmoFicha(larga).total).toBeGreaterThan(ritmoFicha(corta).total)
  })
  it('circular avanza y retrocede sin salirse', () => {
    expect(circular(18, 19)).toBe(0)
    expect(circular(0, 19, -1)).toBe(18)
    expect(circular(3, 0)).toBe(0)
  })
  it('minutosRestantes no dice 0 hasta terminar', () => {
    expect(minutosRestantes(6, 0)).toBe(6)
    expect(minutosRestantes(6, 0.9)).toBe(1)
    expect(minutosRestantes(6, 0.99)).toBe(0)
    expect(minutosRestantes(6, -1)).toBe(6)
  })
})

// El contenido: cada nota publicada trae su decisión, y las dos versiones de
// un artículo la traen las dos. Sin esto, una nota nueva sin `decision`
// quedaría fuera de la ficha sin que nadie lo note.
describe('decisiones en el frontmatter', () => {
  const RAIZ = join(__dirname, '../src/content/notes')
  const leer = (lang: string) =>
    readdirSync(join(RAIZ, lang))
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const fm = readFileSync(join(RAIZ, lang, f), 'utf8').split('\n---')[0]
        const campo = (k: string) => fm.match(new RegExp(`^  ${k}: "(.*)"$`, 'm'))?.[1]
        return {
          slug: f.replace(/\.md$/, ''),
          borrador: /^draft: true$/m.test(fm),
          traduccion: fm.match(/^translationOf: (.+)$/m)?.[1]?.trim(),
          decision: { problem: campo('problem'), rejected: campo('rejected'), chosen: campo('chosen') },
        }
      })
      .filter((n) => !n.borrador)
  const es = leer('es')
  const en = leer('en')

  it('toda nota publicada tiene problema, descartado y decidido', () => {
    expect(es.length).toBeGreaterThan(0)
    for (const n of [...es, ...en]) {
      expect(n.decision.problem, n.slug).toBeTruthy()
      expect(n.decision.rejected, n.slug).toBeTruthy()
      expect(n.decision.chosen, n.slug).toBeTruthy()
    }
  })
  it('las líneas son cortas: caben en la ficha', () => {
    for (const n of [...es, ...en]) {
      expect(n.decision.problem!.length, n.slug).toBeLessThanOrEqual(95)
      expect(n.decision.rejected!.length, n.slug).toBeLessThanOrEqual(52)
      expect(n.decision.chosen!.length, n.slug).toBeLessThanOrEqual(80)
    }
  })
  it('sin rayas largas (regla de estilo del sitio)', () => {
    const rayas = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    for (const n of [...es, ...en]) expect(Object.values(n.decision).join(' '), n.slug).not.toMatch(rayas)
  })
  it('cada nota en inglés apunta a una hermana en español que existe', () => {
    const slugsEs = new Set(es.map((n) => n.slug))
    for (const n of en) if (n.traduccion) expect(slugsEs.has(n.traduccion), n.slug).toBe(true)
  })
})
