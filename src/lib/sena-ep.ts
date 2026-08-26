// Proyección de hitos de la etapa productiva SENA (visita de concertación a
// los 15 días, una bitácora por mes, visita parcial en el mes 3/4 según el
// programa, cierre 5 días después del fin nominal). Módulo puro e isomorfo:
// lo usa tanto el script cliente de /ep (calculadora) como el cron de
// recordatorios en el servidor, así que no puede importar `node:crypto` ni
// `../db`.

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

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export function mesesDePrograma(tipo: TipoPrograma): number {
  return tipo === 'tecnologo' ? 9 : 6
}

/** `inicioIso` en formato `YYYY-MM-DD`. Lanza si la fecha es inválida. */
export function computeHitos(tipo: TipoPrograma, inicioIso: string): Hito[] {
  const inicio = new Date(`${inicioIso}T00:00:00`)
  if (Number.isNaN(inicio.getTime())) throw new Error('fecha de inicio inválida')

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
    fecha: addMonths(inicio, tipo === 'tecnologo' ? 4 : 3),
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
  const inicioHoy = new Date(hoy)
  inicioHoy.setHours(0, 0, 0, 0)
  const limite = addDays(inicioHoy, diasAntes)
  return hitos.filter((h) => {
    const f = new Date(h.fecha)
    f.setHours(0, 0, 0, 0)
    return f.getTime() >= inicioHoy.getTime() && f.getTime() <= limite.getTime()
  })
}
