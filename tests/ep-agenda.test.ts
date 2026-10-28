import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CONFIG_POR_DEFECTO as CFG,
  citasLibres,
  citasTeoricas,
  compararLibres,
  cuerpoDisponibilidad,
  desdeLocalBogota,
  duracionAMin,
  enBogota,
  fmtCita,
  fmtDuracion,
  lunesBogota,
  parseConfig,
  parseDisponibilidad,
  resumenSemanas,
  tocaConsultar,
  vistaPublica,
  type Episodio,
  type Tramo,
} from '../src/lib/ep-agenda'

const B = desdeLocalBogota
const MIN = 60_000
const BUSY = 'BOOKINGSAVAILABILITYSTATUS_BUSY'
const OOO = 'BOOKINGSAVAILABILITYSTATUS_OUT_OF_OFFICE'
const tramo = (status: string, a: string, b: string): Tramo => ({ status, inicio: B(a), fin: B(b) })

describe('hora de Bogotá', () => {
  it('lee las horas de la API como UTC-5 sin importar la zona del proceso', () => {
    expect(new Date(B('2026-10-28T08:00:00')).toISOString()).toBe('2026-10-28T13:00:00.000Z')
  })

  it('día de la semana y lunes de la semana', () => {
    expect(enBogota(B('2026-10-28T08:30:00'))).toEqual({ dia: 3, minuto: 510 })
    // Domingo a las 23:00 en Bogotá ya es lunes en UTC: la semana sigue siendo la anterior.
    expect(lunesBogota(B('2026-11-01T23:00:00'))).toBe(B('2026-10-26T00:00:00'))
    expect(lunesBogota(B('2026-11-02T00:00:00'))).toBe(B('2026-11-02T00:00:00'))
  })

  it('formatea la cita en español', () => {
    expect(fmtCita(B('2026-11-10T08:00:00'))).toBe('mar 10 nov, 8:00')
  })
})

describe('lectura de Bookings', () => {
  it('duraciones ISO', () => {
    expect(duracionAMin('P8D')).toBe(8 * 1440)
    expect(duracionAMin('PT12H')).toBe(720)
    expect(duracionAMin('PT30M')).toBe(30)
    expect(duracionAMin('P1DT2H5M')).toBe(1440 + 125)
    expect(duracionAMin('PT')).toBeNull()
    expect(duracionAMin(undefined)).toBeNull()
  })

  // Recorte real de la respuesta de `services` del 28 oct 2026.
  const servicios = {
    services: [{
      defaultDuration: 'PT30M',
      schedulingPolicy: {
        maximumAdvance: 'P8D', minimumLeadTime: 'PT12H', timeSlotInterval: 'PT30M',
        bookingServiceWindows: [{ startDate: '', endDate: '', bookableHours: [
          { day: 'Monday', timeSlots: [] },
          { day: 'Tuesday', timeSlots: [{ start: 480, end: 720 }] },
          { day: 'Wednesday', timeSlots: [{ start: 480, end: 720 }] },
          { day: 'Thursday', timeSlots: [{ start: 480, end: 570 }, { start: 630, end: 720 }] },
          { day: 'Friday', timeSlots: [] },
        ] }],
      },
    }],
  }

  it('saca del JSON real la misma configuración que la conocida', () => {
    expect(parseConfig(servicios)).toEqual(CFG)
  })

  it('sin ventanas o sin anticipación no hay configuración (se conserva la anterior)', () => {
    expect(parseConfig({})).toBeNull()
    expect(parseConfig({ maximumAdvance: 'P8D', minimumLeadTime: 'PT12H', bookingServiceWindows: [] })).toBeNull()
  })

  it('el horario real da 22 citas por semana', () => {
    expect(citasTeoricas(CFG, B('2026-11-02T00:00:00'), B('2026-11-08T23:59:00'))).toHaveLength(22)
  })

  it('una respuesta vacía es un error, no "todo libre"', () => {
    expect(parseDisponibilidad({ staffAvailabilityResponse: [{ availabilityItems: [] }] })).toBeNull()
    expect(parseDisponibilidad({ error: 'x' })).toBeNull()
  })

  it('lee los tramos', () => {
    const t = parseDisponibilidad({ staffAvailabilityResponse: [{ staffId: 'x', availabilityItems: [
      { status: BUSY, startDateTime: { dateTime: '2026-10-28T08:00:00' }, endDateTime: { dateTime: '2026-10-28T08:30:00' } },
    ] }] })
    expect(t).toEqual([tramo(BUSY, '2026-10-28T08:00:00', '2026-10-28T08:30:00')])
  })

  it('el cuerpo del POST usa los días completos en hora de Bogotá', () => {
    const c = JSON.parse(cuerpoDisponibilidad(B('2026-10-28T10:15:00'), B('2026-11-05T10:15:00')))
    expect(c.startDateTime.dateTime).toBe('2026-10-28T00:00:00')
    expect(c.endDateTime.dateTime).toBe('2026-11-06T00:00:00')
    expect(c.startDateTime.timeZone).toBe('SA Pacific Standard Time')
  })
})

describe('citas libres', () => {
  const ahora = B('2026-10-28T10:15:00')

  // Forma de la respuesta real del 28 oct 2026: todo ocupado o fuera de oficina.
  const real: Tramo[] = [
    tramo(OOO, '2026-10-28T00:00:00', '2026-10-28T08:00:00'),
    tramo(BUSY, '2026-10-28T08:00:00', '2026-10-28T12:00:00'),
    tramo(OOO, '2026-10-28T12:00:00', '2026-10-29T08:00:00'),
    tramo(BUSY, '2026-10-29T08:00:00', '2026-10-30T00:00:00'),
    tramo(OOO, '2026-10-30T00:00:00', '2026-11-03T00:00:00'),
    tramo(BUSY, '2026-11-03T00:00:00', '2026-11-06T00:00:00'),
  ]

  it('la respuesta real del 28 oct no tiene ninguna libre', () => {
    expect(citasLibres(real, CFG, ahora)).toEqual([])
  })

  it('un hueco sin tramo ocupado es una cita libre', () => {
    const conHueco = real.filter((t) => t.inicio !== B('2026-11-03T00:00:00'))
    conHueco.push(tramo(BUSY, '2026-11-03T00:00:00', '2026-11-04T08:30:00'))
    conHueco.push(tramo('BOOKINGSAVAILABILITYSTATUS_AVAILABLE', '2026-11-04T08:30:00', '2026-11-04T09:00:00'))
    conHueco.push(tramo(BUSY, '2026-11-04T09:00:00', '2026-11-06T00:00:00'))
    expect(citasLibres(conHueco, CFG, ahora)).toEqual([B('2026-11-04T08:30:00')])
  })

  it('respeta la anticipación mínima de 12 h y la máxima de 8 días', () => {
    const nada: Tramo[] = [tramo(OOO, '2026-01-01T00:00:00', '2026-01-02T00:00:00')]
    const libres = citasLibres(nada, CFG, ahora)
    // Hoy 10:30 está a menos de 12 h; el jueves 5 nov a las 10:30 ya pasa de 8 días.
    expect(libres).not.toContain(B('2026-10-28T10:30:00'))
    expect(libres[0]).toBe(B('2026-10-29T08:00:00'))
    expect(libres.at(-1)).toBe(B('2026-11-05T09:00:00'))
  })
})

describe('cuándo consultar', () => {
  it('siempre en los múltiplos de 10', () => {
    expect(tocaConsultar(B('2026-10-30T15:40:00'), CFG)).toBe(true)
  })

  it('cada minuto alrededor de la apertura móvil (8 días antes de la cita)', () => {
    // Martes 10 nov 8:00 abre el lunes 2 nov a las 8:00.
    expect(tocaConsultar(B('2026-11-02T08:03:00'), CFG)).toBe(true)
    expect(tocaConsultar(B('2026-11-02T07:31:00'), CFG)).toBe(true)
    // La última cita del martes es a las 11:30: su margen acaba a las 12:00.
    expect(tocaConsultar(B('2026-11-02T11:59:00'), CFG)).toBe(true)
    expect(tocaConsultar(B('2026-11-02T12:03:00'), CFG)).toBe(false)
  })

  it('cada minuto alrededor de la medianoche del día que queda a 8 días', () => {
    expect(tocaConsultar(B('2026-11-01T23:47:00'), CFG)).toBe(true)
    expect(tocaConsultar(B('2026-11-02T00:13:00'), CFG)).toBe(true)
  })

  it('no fuera de las aperturas', () => {
    expect(tocaConsultar(B('2026-11-02T15:03:00'), CFG)).toBe(false)
    // Jueves por la mañana no abre nada: ninguna cita cae en viernes.
    expect(tocaConsultar(B('2026-11-05T09:03:00'), CFG)).toBe(false)
    expect(tocaConsultar(B('2026-11-07T03:03:00'), CFG)).toBe(false)
  })

  it('cuesta unas 2.000 consultas por semana, no 10.000', () => {
    let n = 0
    for (let t = B('2026-11-02T00:00:00'); t < B('2026-11-09T00:00:00'); t += MIN) if (tocaConsultar(t, CFG)) n++
    expect(n).toBeGreaterThan(1500)
    expect(n).toBeLessThan(2500)
  })
})

describe('cambios entre consultas', () => {
  const cita = B('2026-11-10T08:00:00')

  it('primera consulta: lo libre es previa, no apertura', () => {
    const r = compararLibres(null, [cita], B('2026-11-03T10:00:00'), CFG)
    expect(r.abiertas).toEqual([{ cita, como: 'previa' }])
  })

  it('apertura si aparece al entrar en la ventana; liberada si aparece después', () => {
    const previo = { libres: {} }
    expect(compararLibres(previo, [cita], B('2026-11-02T08:01:00'), CFG).abiertas[0].como).toBe('apertura')
    expect(compararLibres(previo, [cita], B('2026-11-02T08:19:00'), CFG).abiertas[0].como).toBe('apertura')
    expect(compararLibres(previo, [cita], B('2026-11-05T14:12:00'), CFG).abiertas[0].como).toBe('liberada')
  })

  it('una cita que sigue libre conserva cuándo se abrió y no vuelve a avisar', () => {
    const desde = B('2026-11-02T08:01:00')
    const r = compararLibres({ libres: { [cita]: desde } }, [cita], B('2026-11-02T08:05:00'), CFG)
    expect(r.abiertas).toEqual([])
    expect(r.libres[String(cita)]).toBe(desde)
  })

  it('ocupada si desaparece antes del cierre; vencida si llega al mínimo de 12 h', () => {
    const previo = { libres: { [cita]: B('2026-11-02T08:01:00') } }
    expect(compararLibres(previo, [], B('2026-11-02T08:04:00'), CFG).cerradas).toEqual([{ cita, cierre: 'ocupada' }])
    expect(compararLibres(previo, [], B('2026-11-09T20:00:00'), CFG).cerradas).toEqual([{ cita, cierre: 'vencio' }])
  })
})

describe('resumen semanal', () => {
  const inicio = B('2026-10-28T10:00:00')
  const ahora = B('2026-11-06T12:00:00')

  it('solo cuenta citas que entraron en la ventana con el monitor ya corriendo', () => {
    const semanas = resumenSemanas([], CFG, inicio, ahora)
    // Semana del 2 nov: martes 3 y miércoles 4 abrieron el 26 y el 27, antes del
    // arranque; del jueves 5 solo cuentan las de las 10:30 en adelante (las de
    // la mañana abrieron el 28 antes de las 10).
    const s2 = semanas.find((s) => s.lunes === B('2026-11-02T00:00:00'))!
    expect(s2.delHorario).toBe(3)
    expect(s2.sinAbrirse).toBe(3)
    expect(s2.medianaLibreMin).toBeNull()
    // La semana siguiente ya entró entera en la ventana con el monitor corriendo.
    expect(semanas.find((s) => s.lunes === B('2026-11-09T00:00:00'))!.delHorario).toBe(22)
  })

  it('cuenta las abiertas una vez aunque se hayan liberado dos veces, y la mediana de lo cerrado', () => {
    const c = B('2026-11-10T08:00:00')
    const ep: Episodio[] = [
      { cita: c, abiertaEn: B('2026-11-02T08:00:00'), como: 'apertura', cerradaEn: B('2026-11-02T08:04:00'), cierre: 'ocupada' },
      { cita: c, abiertaEn: B('2026-11-05T14:00:00'), como: 'liberada', cerradaEn: B('2026-11-05T14:30:00'), cierre: 'ocupada' },
      { cita: B('2026-11-10T08:30:00'), abiertaEn: B('2026-11-02T08:30:00'), como: 'apertura', cerradaEn: null, cierre: null },
    ]
    const s = resumenSemanas(ep, CFG, inicio, ahora).find((x) => x.lunes === B('2026-11-09T00:00:00'))!
    expect(s.seAbrieron).toBe(2)
    expect(s.medianaLibreMin).toBe(17)
  })

  it('más reciente primero', () => {
    const s = resumenSemanas([], CFG, inicio, ahora)
    expect(s[0].lunes).toBeGreaterThan(s.at(-1)!.lunes)
  })
})

describe('vista pública con retraso', () => {
  const ahora = B('2026-11-02T08:30:00')
  const ep = (abierta: string): Episodio => ({ cita: B('2026-11-10T08:00:00'), abiertaEn: B(abierta), como: 'apertura', cerradaEn: null, cierre: null })

  // Si /ep enseñara la cita al minuto, mirar la página ganaría a los avisos de pago (5) y gratis (20).
  it('no muestra una cita abierta hace menos de 20 min, ni en filas ni en libres', () => {
    const v = vistaPublica([ep('2026-11-02T08:20:00')], { [B('2026-11-10T08:00:00')]: B('2026-11-02T08:20:00') }, ahora)
    expect(v.episodios).toEqual([])
    expect(v.libres).toEqual([])
  })

  it('la muestra cumplidos los 20 min', () => {
    const v = vistaPublica([ep('2026-11-02T08:10:00')], { [B('2026-11-10T08:00:00')]: B('2026-11-02T08:10:00') }, ahora)
    expect(v.episodios).toHaveLength(1)
    expect(v.libres).toEqual([B('2026-11-10T08:00:00')])
  })

  it('el conteo semanal tampoco delata una apertura reciente', () => {
    const inicio = B('2026-10-28T10:00:00')
    const visible = vistaPublica([ep('2026-11-02T08:20:00')], {}, ahora).episodios
    const s = resumenSemanas(visible, CFG, inicio, ahora).find((x) => x.lunes === B('2026-11-09T00:00:00'))!
    expect(s.seAbrieron).toBe(0)
  })
})

describe('duraciones legibles', () => {
  it.each([[0.4, '< 1 min'], [4, '4 min'], [125, '2 h 5 min'], [120, '2 h'], [1440 * 3 + 120, '3 d 2 h']])('%s → %s', (m, s) => {
    expect(fmtDuracion(m)).toBe(s)
  })
})

describe('el endpoint del cron', () => {
  const src = readFileSync('src/pages/api/cron/ep-agenda.ts', 'utf8')

  it('valida el secreto con cronSecretOk', () => {
    expect(src).toMatch(/cronSecretOk\(/)
  })

  // cron-job.org deshabilita el job tras 25 fallos seguidos: un 5xx por cada
  // minuto de Bookings caído lo apagaría en media hora.
  it('no responde 5xx por un fallo de Bookings', () => {
    expect(src).not.toMatch(/status:\s*5\d\d|,\s*5\d\d\)/)
  })
})
