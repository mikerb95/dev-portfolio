import { describe, expect, it } from 'vitest'
import { computeHitos, hitosPorAvisar, mesesDePrograma } from '../src/lib/sena-ep'

describe('mesesDePrograma', () => {
  // El diseño curricular vigente da 864 horas de etapa productiva a los dos
  // niveles: la práctica dura lo mismo, lo que cambia es la etapa lectiva.
  it('son 6 meses tanto en técnico como en tecnólogo', () => {
    expect(mesesDePrograma('tecnico')).toBe(6)
    expect(mesesDePrograma('tecnologo')).toBe(6)
  })
})

describe('computeHitos', () => {
  it('genera inicio + concertación + una bitácora por mes + parcial + cierre, en orden', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    // 2 (inicio + concertación) + 6 bitácoras + 1 parcial + 1 cierre
    expect(hitos).toHaveLength(10)
    expect(hitos.filter((h) => h.categoria === 'bitacora')).toHaveLength(6)
    for (let i = 1; i < hitos.length; i++) {
      expect(hitos[i].fecha.getTime()).toBeGreaterThanOrEqual(hitos[i - 1].fecha.getTime())
    }
  })

  it('la visita de concertación cae 15 días después del inicio', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    const concertacion = hitos.find((h) => h.titulo === 'Visita de concertación')!
    expect(concertacion.fecha.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('tecnólogo produce el mismo cronograma que técnico', () => {
    const tecnico = computeHitos('tecnico', '2026-09-09')
    const tecnologo = computeHitos('tecnologo', '2026-09-09')
    expect(tecnologo.map((h) => [h.titulo, h.fecha.toISOString()])).toEqual(
      tecnico.map((h) => [h.titulo, h.fecha.toISOString()])
    )
  })

  it('la visita parcial cae a mitad de la etapa (mes 3 de 6)', () => {
    const hitos = computeHitos('tecnologo', '2026-09-09')
    const parcial = hitos.find((h) => h.titulo === 'Visita parcial de seguimiento')!
    expect(parcial.fecha.toISOString().slice(0, 10)).toBe('2026-12-09')
  })

  it('el cierre cae 5 días después del fin nominal del programa', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    const cierre = hitos[hitos.length - 1]
    expect(cierre.titulo).toBe('Visita final y cierre')
    expect(cierre.fecha.toISOString().slice(0, 10)).toBe('2027-03-14')
  })

  it('rechaza una fecha de inicio inválida', () => {
    expect(() => computeHitos('tecnico', 'no-es-fecha')).toThrow()
  })
})

describe('hitosPorAvisar', () => {
  it('incluye hoy y hasta N días adelante, excluye lo pasado y lo lejano', () => {
    const hoy = new Date('2026-09-09T00:00:00')
    const hitos = computeHitos('tecnico', '2026-09-01')
    const proximos = hitosPorAvisar(hitos, hoy, 3)
    for (const h of proximos) {
      const dias = Math.round((h.fecha.getTime() - hoy.getTime()) / 86400000)
      expect(dias).toBeGreaterThanOrEqual(0)
      expect(dias).toBeLessThanOrEqual(3)
    }
    // El inicio (01-sep) ya pasó y no debe aparecer.
    expect(proximos.some((h) => h.titulo === 'Inicio de etapa productiva')).toBe(false)
  })
})

// ── Independencia de zona horaria ───────────────────────────────────────────
// Los hitos son días de calendario, no instantes. Antes se anclaban a
// medianoche LOCAL del proceso, así que el cronograma dependía de dónde
// corriera el código: estos tres tests fallaban bajo cualquier zona con
// desfase positivo (Asia/Tokyo, Pacific/Auckland). Ahora el ancla es el
// mediodía UTC, que deja 12 h de margen a cada lado.

describe('anclaje de las fechas', () => {
  it('ancla al mediodía UTC, no a medianoche', () => {
    const [inicio] = computeHitos('tecnico', '2026-09-09')
    expect(inicio.fecha.toISOString()).toBe('2026-09-09T12:00:00.000Z')
  })

  it('el día es el mismo leído en UTC y con accesores locales', () => {
    // /ep pinta estas fechas en el navegador con getDate() y
    // toLocaleDateString(), que son locales. Si el ancla estuviera en un
    // extremo del día, las dos lecturas discreparían.
    //
    // El margen del mediodía es de 12 h, así que la propiedad se garantiza
    // hasta UTC±11. NO es universal, y no puede serlo: una fecha de calendario
    // representada como un instante siempre se ve corrida en algún meridiano
    // (Auckland en UTC+12 es el primero que se sale). El público de /ep está en
    // Colombia (UTC-5), muy dentro del margen; la comprobación se salta en las
    // zonas extremas en vez de fingir una garantía que no existe.
    const offsetHoras = Math.abs(new Date('2026-09-09T12:00:00Z').getTimezoneOffset()) / 60
    if (offsetHoras > 11) return

    for (const h of computeHitos('tecnico', '2026-09-09')) {
      expect(h.fecha.getDate()).toBe(h.fecha.getUTCDate())
      expect(h.fecha.getMonth()).toBe(h.fecha.getUTCMonth())
    }
  })

  it('en Colombia, que es el público real, el día local coincide siempre', () => {
    // Independiente de la zona del proceso: se comprueba con un formateador
    // fijado a Bogotá, no con los accesores locales.
    const enBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', dateStyle: 'short' })
    for (const h of computeHitos('tecnico', '2026-09-09')) {
      expect(enBogota.format(h.fecha)).toBe(h.fecha.toISOString().slice(0, 10))
    }
  })

  it('rechaza un día que no existe en vez de correr el cronograma entero', () => {
    // '2026-02-30' no lanza en JS: se desborda al 2 de marzo, y los diez hitos
    // saldrían desplazados sin que nadie lo note.
    expect(() => computeHitos('tecnico', '2026-02-30')).toThrow()
    expect(() => computeHitos('tecnico', '2026-13-01')).toThrow()
    expect(() => computeHitos('tecnico', '09-09-2026')).toThrow()
    expect(() => computeHitos('tecnico', '2028-02-29')).not.toThrow() // bisiesto
  })
})

describe('hitosPorAvisar por día colombiano', () => {
  it('no adelanta el aviso en la franja en que UTC ya cambió de día', () => {
    // 23:00 en Bogotá del 8 de septiembre = 04:00 UTC del 9. Comparando por día
    // UTC, un hito del 9 se avisaría cuando en Colombia todavía es el 8.
    const nocheDel8 = new Date('2026-09-09T04:00:00Z')
    const hitos = computeHitos('tecnico', '2026-09-08')

    const hoy = hitosPorAvisar(hitos, nocheDel8, 0)
    expect(hoy.map((h) => h.titulo)).toEqual(['Inicio de etapa productiva'])
  })

  it('incluye el propio día y el rango pedido', () => {
    const hitos = computeHitos('tecnico', '2026-09-01')
    // La concertación cae el 16 (inicio + 15 días).
    const enPunto = hitosPorAvisar(hitos, new Date('2026-09-16T17:00:00Z'), 0)
    expect(enPunto.map((h) => h.titulo)).toEqual(['Visita de concertación'])

    const conMargen = hitosPorAvisar(hitos, new Date('2026-09-14T17:00:00Z'), 2)
    expect(conMargen.map((h) => h.titulo)).toEqual(['Visita de concertación'])

    const justoAntes = hitosPorAvisar(hitos, new Date('2026-09-14T17:00:00Z'), 1)
    expect(justoAntes).toEqual([])
  })
})
