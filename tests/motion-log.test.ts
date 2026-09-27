import { describe, it, expect } from 'vitest'
import {
  DIA_MS,
  MINUTO_MS,
  agruparSesiones,
  diaBogota,
  horaBogota,
  inicioDiaBogota,
  leerCommit,
  minutosSesion,
  porDia,
  racha,
  redondearMarca,
  trabajoProfundo,
} from '../src/lib/actividad'
import { construirReloj, fechaDeDia, leerEn, medidasReloj, reloj24, xDeHora, yDeFila, cabezal, faseFila, duracionEscaneo } from '../src/lib/motion/reloj'
import { CLAVE_PRIVADOS, conteoTipos, enlaceCommit, filtrar, filtroDeUrl, mezclaRepos, type ItemFeed } from '../src/lib/motion/log-datos'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// /log dibuja las sesiones de trabajo con las MISMAS reglas con que el
// endpoint calcula las cifras. Estas pruebas fijan esas reglas y, sobre todo,
// que lo dibujado suma lo publicado.

/** Instante UTC de una hora de Bogotá (UTC-5) en una fecha dada. */
const bogota = (fecha: string, hora: string) => Date.parse(`${fecha}T${hora}:00-05:00`)

describe('reglas de la actividad', () => {
  it('90 minutos exactos siguen en la sesión; 95 la cortan', () => {
    const t0 = bogota('2026-09-10', '10:00')
    expect(agruparSesiones([t0, t0 + 90 * MINUTO_MS])).toHaveLength(1)
    expect(agruparSesiones([t0, t0 + 95 * MINUTO_MS])).toHaveLength(2)
  })

  it('una sesión suma sus minutos más los 30 previos, y un commit solo vale 30', () => {
    const t0 = bogota('2026-09-10', '10:00')
    const [larga] = agruparSesiones([t0, t0 + 60 * MINUTO_MS, t0 + 120 * MINUTO_MS])
    expect(larga.commits).toBe(3)
    expect(minutosSesion(larga)).toBe(150)
    expect(minutosSesion(agruparSesiones([t0])[0])).toBe(30)
  })

  it('agrupa aunque las marcas lleguen desordenadas', () => {
    const t0 = bogota('2026-09-10', '10:00')
    const s = agruparSesiones([t0 + 40 * MINUTO_MS, t0, t0 + 20 * MINUTO_MS])
    expect(s).toEqual([{ inicio: t0, fin: t0 + 40 * MINUTO_MS, commits: 3 }])
  })

  it('las ventanas cuentan las sesiones que terminaron dentro', () => {
    const ahora = bogota('2026-09-27', '15:00')
    const vieja = ahora - 10 * DIA_MS
    const reciente = ahora - 2 * DIA_MS
    const dw = trabajoProfundo([vieja, vieja + 60 * MINUTO_MS, reciente], ahora)
    expect(dw).toEqual({ weekHours: 0.5, monthHours: 2, sessions: 2 })
  })

  it('el día es el de Bogotá: las 8 p. m. no caen en el día siguiente', () => {
    const noche = bogota('2026-09-26', '20:00') // 01:00 UTC del 27
    const manana = bogota('2026-09-26', '08:00')
    expect(diaBogota(noche)).toBe(diaBogota(manana))
    expect(horaBogota(noche)).toBe(20)
    expect(fechaDeDia(diaBogota(noche)).getUTCDate()).toBe(26)
    expect(inicioDiaBogota(diaBogota(noche))).toBe(bogota('2026-09-26', '00:00'))
    const ahora = bogota('2026-09-27', '10:00')
    expect(porDia([noche, manana], ahora, 3)).toEqual([0, 2, 0])
  })

  it('la racha no se corta porque hoy aún no haya commits', () => {
    const ahora = bogota('2026-09-27', '09:00')
    const ayer = bogota('2026-09-26', '22:00')
    const antier = bogota('2026-09-25', '10:00')
    expect(racha([ayer, antier], ahora)).toEqual({ dias: 2, desde: diaBogota(antier) })
    expect(racha([antier], ahora).dias).toBe(0)
    expect(racha([], ahora)).toEqual({ dias: 0, desde: null })
  })

  it('redondea a 5 minutos', () => {
    const t = bogota('2026-09-10', '10:02') + 29_000
    expect(redondearMarca(t)).toBe(bogota('2026-09-10', '10:00'))
    expect(redondearMarca(bogota('2026-09-10', '10:03'))).toBe(bogota('2026-09-10', '10:05'))
  })

  it('lee el tipo de un Conventional Commit y deja lo demás como "otro"', () => {
    expect(leerCommit('feat(lab): add pipeline')).toEqual({ tipo: 'feat', alcance: 'lab', texto: 'add pipeline', rompe: false })
    expect(leerCommit('fix!: cambio que rompe')).toMatchObject({ tipo: 'fix', rompe: true, alcance: null })
    expect(leerCommit('ci: cache de npm').tipo).toBe('chore')
    expect(leerCommit('Add decision-making framework')).toEqual({ tipo: 'otro', alcance: null, texto: 'Add decision-making framework', rompe: false })
    // Un prefijo desconocido no inventa un tipo.
    expect(leerCommit('wip: algo').tipo).toBe('otro')
  })
})

describe('reloj de sesiones', () => {
  const ahora = bogota('2026-09-27', '15:00')
  const publicos = [
    // Sesión que cruza la medianoche del 20 al 21.
    { t: bogota('2026-09-20', '23:10'), ref: 0 },
    { t: bogota('2026-09-21', '00:20'), ref: 1 },
    // Sesión de un commit.
    { t: bogota('2026-09-25', '14:00'), ref: 2 },
  ]
  const privados = [bogota('2026-09-25', '15:00'), bogota('2026-09-26', '09:00'), bogota('2026-09-27', '08:00')]
  const modelo = construirReloj({ publicos, privados, ahora })

  it('tiene 31 filas, de hace 30 días a hoy, y la primera empieza donde empieza la ventana', () => {
    expect(modelo.dias).toHaveLength(31)
    expect(modelo.dias.at(-1)).toBe(diaBogota(ahora))
    expect(modelo.hInicioVentana).toBe(15)
    expect(modelo.hAhora).toBe(15)
  })

  it('lo dibujado suma exactamente las horas que publica la cifra', () => {
    const marcas = [...publicos.map((p) => redondearMarca(p.t)), ...privados]
    const dw = trabajoProfundo(marcas, ahora)
    const suma = modelo.horasFila.reduce((a, b) => a + b, 0)
    expect(Math.round(suma * 10) / 10).toBe(dw.monthHours)
    expect(modelo.puntos).toHaveLength(6)
    expect(modelo.commitsFila.reduce((a, b) => a + b, 0)).toBe(6)
  })

  it('una sesión que cruza la medianoche se parte en dos filas, con sus 30 min previos', () => {
    const fila20 = diaBogota(bogota('2026-09-20', '12:00')) - modelo.dias[0]
    const sesion = modelo.puntos[0].sesion
    const tramos = modelo.tramos.filter((t) => t.sesion === sesion)
    const esperado: [number, number, number, boolean][] = [
      [fila20, 22 + 40 / 60, 23 + 10 / 60, true],
      [fila20, 23 + 10 / 60, 24, false],
      [fila20 + 1, 0, 20 / 60, false],
    ]
    expect(tramos).toHaveLength(3)
    tramos.forEach((t, i) => {
      const [fila, h0, h1, previo] = esperado[i]
      expect(t.fila).toBe(fila)
      expect(t.h0).toBeCloseTo(h0, 6)
      expect(t.h1).toBeCloseTo(h1, 6)
      expect(t.previo).toBe(previo)
    })
  })

  it('cada punto pertenece a la sesión que lo contiene', () => {
    for (const p of modelo.puntos) {
      const s = modelo.sesiones[p.sesion]
      expect(p.t).toBeGreaterThanOrEqual(s.inicio)
      expect(p.t).toBeLessThanOrEqual(s.fin)
    }
    expect(modelo.puntos.filter((p) => p.publico).map((p) => p.ref)).toEqual([0, 1, 2])
    expect(modelo.puntos.filter((p) => !p.publico).every((p) => p.ref === -1)).toBe(true)
  })

  it('marca la semana y la racha', () => {
    expect(modelo.sesiones.find((s) => s.inicio === bogota('2026-09-20', '23:10'))?.enSemana).toBe(true)
    // 25, 26 y 27 seguidos.
    expect(modelo.rachaDias).toBe(3)
    expect([...modelo.filasRacha].sort((a, b) => a - b)).toEqual([28, 29, 30])
  })

  it('bajo el cursor lee el commit, luego la sesión, luego la fila', () => {
    const m = medidasReloj(1076, 31)
    const p = modelo.puntos.find((q) => q.ref === 2)!
    const y = yDeFila(m, p.fila) + m.altoFila / 2
    expect(leerEn(modelo, m, xDeHora(m, p.h) + 3, y)).toMatchObject({ tipo: 'punto', punto: { ref: 2 } })
    // En los 30 min previos no hay commit, pero sí sesión.
    expect(leerEn(modelo, m, xDeHora(m, p.h - 0.35), y)).toMatchObject({ tipo: 'sesion' })
    expect(leerEn(modelo, m, xDeHora(m, 4), y)).toMatchObject({ tipo: 'fila', fila: p.fila })
    expect(leerEn(modelo, m, 5, y)).toBeNull()
    expect(leerEn(modelo, m, xDeHora(m, 4), 2)).toBeNull()
  })

  it('las medidas reservadas en el CSS son las del lienzo', () => {
    expect(medidasReloj(360, 31).alto).toBe(396)
    expect(medidasReloj(800, 31).alto).toBe(515)
    expect(medidasReloj(1076, 31).alto).toBe(577)
    // En el móvil más estrecho la rejilla conserva ancho útil.
    const m = medidasReloj(296, 31)
    expect(m.ancho - m.izq - m.der).toBeGreaterThan(200)
  })

  it('el escaneo avanza, termina pasada la última fila y funde después de mostrar', () => {
    const d = duracionEscaneo(31)
    expect(cabezal(0, 31)).toBe(0)
    expect(cabezal(d, 31)).toBeGreaterThan(31)
    expect(cabezal(d / 2, 31)).toBeGreaterThan(cabezal(d / 4, 31))
    const f = faseFila(10.4, 10)
    expect(f.puntos).toBeGreaterThan(0)
    expect(f.fusion).toBe(0)
    expect(faseFila(40, 10)).toEqual({ puntos: 1, fusion: 1 })
  })

  it('formatea horas', () => {
    expect(reloj24(9.5)).toBe('09:30')
    expect(reloj24(23 + 59.9 / 60)).toBe('00:00')
  })
})

describe('bitácora', () => {
  const item = (repo: string, message: string, type: ItemFeed['type'] = 'commit'): ItemFeed => ({
    repo,
    repoFull: `mikerb95/${repo}`,
    message,
    sha: type === 'commit' ? 'abc1234' : '',
    timestamp: '2026-09-26T12:00:00Z',
    type,
  })
  const feed = [
    item('portfolio', 'feat: a'),
    item('portfolio', 'fix(x): b'),
    item('antidoto', 'feat: c'),
    item('portfolio', 'PR fusionado', 'pr_merged'),
  ]

  it('reparte el mes por proyecto con lo privado como un solo segmento sin nombre', () => {
    const segs = mezclaRepos(feed, 5)
    expect(segs.map((s) => [s.clave, s.n])).toEqual([
      ['portfolio', 2],
      ['antidoto', 1],
      [CLAVE_PRIVADOS, 2],
    ])
    expect(segs.reduce((a, s) => a + s.frac, 0)).toBeCloseTo(1)
    expect(mezclaRepos([], 0)).toEqual([])
  })

  it('filtra por proyecto y por tipo, y cuenta tipos sin los PR', () => {
    expect(filtrar(feed, { repo: 'portfolio', tipo: null })).toHaveLength(3)
    expect(filtrar(feed, { repo: 'portfolio', tipo: 'fix' }).map((f) => f.message)).toEqual(['fix(x): b'])
    expect(conteoTipos(feed, null)).toEqual([
      { tipo: 'feat', n: 2 },
      { tipo: 'fix', n: 1 },
    ])
  })

  it('no se fía de la URL', () => {
    const p = new URLSearchParams('repo=cliente-secreto&tipo=<script>')
    expect(filtroDeUrl(p, ['portfolio'])).toEqual({ repo: null, tipo: null })
    expect(filtroDeUrl(new URLSearchParams('repo=portfolio&tipo=fix'), ['portfolio'])).toEqual({ repo: 'portfolio', tipo: 'fix' })
  })

  it('enlaza el commit en GitHub', () => {
    expect(enlaceCommit(feed[0])).toBe('https://github.com/mikerb95/portfolio/commit/abc1234')
    expect(enlaceCommit(feed[3])).toBe('https://github.com/mikerb95/portfolio')
  })
})

describe('textos del reloj y la bitácora', () => {
  const forma = (o: unknown): unknown =>
    o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, forma(v)])) : typeof o

  it('mismas claves en español e inglés', () => {
    expect(forma(en.log.motion)).toEqual(forma(es.log.motion))
  })

  it('sin rayas largas', () => {
    const texto = JSON.stringify([es.log, en.log])
    for (const raya of [0x2014, 0x2013]) expect(texto).not.toContain(String.fromCharCode(raya))
  })
})
