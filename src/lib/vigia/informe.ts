import { z } from 'zod'

// Forma del informe.json que deja el vigía en /mnt/session/outputs/. Módulo
// puro: lo valida el webhook y lo pinta el panel.
//
// El JSON lo escribe un modelo, así que se valida entero antes de guardarlo:
// un informe con otra forma se guarda como "sin informe válido" (el .md sigue
// disponible) en vez de reventar el webhook o pintar campos vacíos.

export const PRIORIDADES = ['alta', 'media', 'baja'] as const
export const ESTADOS = ['verde', 'amarillo', 'rojo'] as const

const Hallazgo = z.object({
  id: z.string().min(1).max(120),
  prioridad: z.enum(PRIORIDADES),
  categoria: z.string().min(1).max(40),
  titulo: z.string().min(1).max(300),
  evidencia: z.string().max(2000),
  arreglo: z.string().max(2000),
})

const Informe = z.object({
  estado: z.enum(ESTADOS),
  resumen: z.string().min(1).max(2000),
  hallazgos: z.array(Hallazgo).max(100),
  revisado: z.array(z.string().max(500)).max(100).default([]),
  no_revisado: z.array(z.string().max(500)).max(100).default([]),
})

export type HallazgoVigia = z.infer<typeof Hallazgo>
export type InformeVigia = z.infer<typeof Informe>
export type EstadoVigia = (typeof ESTADOS)[number]

/** Valida el JSON del informe; null si no tiene la forma acordada. */
export function leerInforme(raw: string | null | undefined): InformeVigia | null {
  if (!raw) return null
  let datos: unknown
  try {
    datos = JSON.parse(raw)
  } catch {
    return null
  }
  const r = Informe.safeParse(datos)
  return r.success ? r.data : null
}

/** Hallazgos ordenados de mayor a menor prioridad, estable dentro de cada nivel. */
export function porPrioridad(hallazgos: readonly HallazgoVigia[]): HallazgoVigia[] {
  const peso = (p: HallazgoVigia['prioridad']) => PRIORIDADES.indexOf(p)
  return hallazgos
    .map((h, i) => ({ h, i }))
    .sort((a, b) => peso(a.h.prioridad) - peso(b.h.prioridad) || a.i - b.i)
    .map(({ h }) => h)
}

/** Título y cuerpo del aviso push: corto, sin evidencia ni rutas. */
export function avisoDeInforme(informe: InformeVigia): { titulo: string; cuerpo: string } {
  const altas = informe.hallazgos.filter((h) => h.prioridad === 'alta').length
  const total = informe.hallazgos.length
  const cuenta = total === 0 ? 'sin hallazgos' : `${total} hallazgo${total === 1 ? '' : 's'}${altas ? `, ${altas} de prioridad alta` : ''}`
  return {
    titulo: `Vigía: ${informe.estado.toUpperCase()} (${cuenta})`,
    cuerpo: informe.resumen.slice(0, 400),
  }
}
