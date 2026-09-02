// Proyección de hitos de la etapa productiva SENA (visita de concertación a
// los 15 días, una bitácora por mes, visita parcial a mitad de etapa, cierre
// 5 días después del fin nominal). Módulo puro e isomorfo:
// lo usa tanto el script cliente de /ep (calculadora) como el cron de
// recordatorios en el servidor, así que no puede importar `node:crypto` ni
// `../db`.

import { fechaISOEnColombia } from './fecha-co'

export type TipoPrograma = 'tecnico' | 'tecnologo'
export type Categoria = 'inicio' | 'visita' | 'bitacora'
export type DocKey = 'f165' | 'f023_1' | 'f023_2' | 'f023_3' | 'f147'

export interface Hito {
  titulo: string
  fecha: Date
  detalle: string
  categoria: Categoria
  docKey: DocKey
}

// ── Anclaje de las fechas ───────────────────────────────────────────────────
//
// Los hitos son DÍAS DE CALENDARIO ("la visita es el 24 de septiembre"), no
// instantes. Un `Date` siempre es un instante, así que hay que elegir a qué
// hora del día se ancla, y esa elección decide en qué zonas horarias el
// cronograma se ve bien.
//
// Se ancla al MEDIODÍA UTC, y no a medianoche de Colombia como hace
// lib/fecha-co.ts, porque el consumidor es distinto: /ep pinta estas fechas en
// el NAVEGADOR con accesores locales (`getDate`, `toLocaleDateString`, y el
// `DTSTART;VALUE=DATE` del .ics). Con medianoche, cualquier desfase mueve el
// día: anclado a las 00:00 de Colombia, un usuario en UTC-6 vería el día
// anterior. El mediodía deja 12 horas de margen a cada lado, así que el día
// sale correcto desde UTC-11 hasta UTC+11.
//
// En fecha-co.ts la situación es la contraria (se formatea en el servidor con
// `timeZone: 'America/Bogota'` explícito), y por eso allí el anclaje correcto
// es la medianoche colombiana. No es una incoherencia: es que el criterio lo
// fija quién lee la fecha, no quién la escribe.
const HORA_ANCLA_UTC = 12

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

// La aritmética va en UTC (`setUTCDate`/`setUTCMonth`) y no en local: sumar
// meses en la zona del proceso puede cruzar un cambio de horario de verano y
// correr el ancla una hora, que con márgenes menores acabaría cambiando el día.
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x
}

// La duración es la misma en los dos niveles: el diseño curricular vigente
// asigna 864 horas de etapa productiva tanto al técnico como al tecnólogo (en
// ADSO, código 228118: 3.120 h lectivas + 864 h productivas = 3.984 h / 27
// meses). Lo que cambia entre niveles es la etapa LECTIVA, no la práctica.
// Se deja como tabla y no como constante porque es el único punto a tocar si
// alguna ficha llega con un diseño curricular de distinta duración.
const MESES_POR_NIVEL: Record<TipoPrograma, number> = {
  tecnico: 6,
  tecnologo: 6,
}

export function mesesDePrograma(tipo: TipoPrograma): number {
  return MESES_POR_NIVEL[tipo]
}

/** `inicioIso` en formato `YYYY-MM-DD`. Lanza si la fecha es inválida. */
export function computeHitos(tipo: TipoPrograma, inicioIso: string): Hito[] {
  if (!SOLO_FECHA.test(inicioIso)) throw new Error('fecha de inicio inválida')
  const inicio = new Date(`${inicioIso}T${String(HORA_ANCLA_UTC).padStart(2, '0')}:00:00Z`)
  // Un día inexistente no lanza: JS desborda '2026-02-30' al 2 de marzo en
  // silencio, y el cronograma entero saldría corrido sin que nadie lo note.
  if (Number.isNaN(inicio.getTime()) || inicio.toISOString().slice(0, 10) !== inicioIso) {
    throw new Error('fecha de inicio inválida')
  }

  const meses = mesesDePrograma(tipo)

  const hitos: Hito[] = [
    {
      titulo: 'Inicio de etapa productiva',
      fecha: inicio,
      detalle: 'Primer día. Verifica afiliación a ARL y entrega el F-165 de selección de alternativa.',
      categoria: 'inicio',
      docKey: 'f165',
    },
    {
      titulo: 'Visita de concertación',
      fecha: addDays(inicio, 15),
      detalle: 'El instructor valida el plan de trabajo con la empresa.',
      categoria: 'visita',
      docKey: 'f023_1',
    },
  ]

  for (let i = 1; i <= meses; i++) {
    hitos.push({
      titulo: `Bitácora - mes ${i}`,
      fecha: addMonths(inicio, i),
      detalle: `Registro mensual ${i} de ${meses}, firmado por el jefe inmediato.`,
      categoria: 'bitacora',
      docKey: 'f147',
    })
  }

  hitos.push({
    titulo: 'Visita parcial de seguimiento',
    fecha: addMonths(inicio, Math.floor(meses / 2)),
    detalle: 'Evaluación de medio término: avances y competencias.',
    categoria: 'visita',
    docKey: 'f023_2',
  })

  hitos.push({
    titulo: 'Visita final y cierre',
    fecha: addDays(addMonths(inicio, meses), 5),
    detalle: 'Evaluación final, paz y salvo y cierre de la etapa productiva.',
    categoria: 'inicio',
    docKey: 'f023_3',
  })

  hitos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  return hitos
}

/** Hitos cuya fecha cae dentro de los próximos `diasAntes` días (inclusive), sin contar los ya pasados. */
export function hitosPorAvisar(hitos: Hito[], hoy: Date, diasAntes: number): Hito[] {
  // La comparación va por DÍA COLOMBIANO y no por el día local del proceso: el
  // cron corre en Vercel (UTC), y entre las 00:00 y las 05:00 UTC allí ya es el
  // día siguiente mientras en Colombia todavía no. Sin esto, un hito se avisaría
  // con un día de adelanto durante esa franja.
  const diaDe = (d: Date) => fechaISOEnColombia(d)

  const hoyISO = diaDe(hoy)
  const limiteISO = diaDe(addDays(hoy, diasAntes))

  return hitos.filter((h) => {
    const f = diaDe(h.fecha)
    return f >= hoyISO && f <= limiteISO
  })
}
