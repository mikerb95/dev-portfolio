// Instantánea de datos públicos reales, para servir las páginas de marca
// mientras la base de datos no responde.
//
// Se importa como JSON, así que queda EMBEBIDA en el bundle en tiempo de build:
// leerla no toca disco, no toca red y no puede fallar en runtime. Un respaldo
// que depende de una lectura es un respaldo que se cae junto con lo que
// respalda.
//
// La genera `scripts/capturar-instantanea.mjs` desde la base, desde el backup
// de Vercel Blob, o desde la API de GitHub (que es la fuente original de la
// tabla `projects`, ver scripts/seed-projects.mjs). Nunca contiene datos
// privados: solo lo que ya se sirve sin autenticar.
//
// Cuando la base vuelve a responder, nada de esto se usa. No hay que revertir
// ningún cambio ni desactivar ninguna bandera: `crearRastreador().q()` devuelve
// los datos vivos y la instantánea queda inerte.

import datos from '../../data/instantanea.json'

export type ProyectoInstantanea = {
  id: number
  slug: string
  title: string
  description: string | null
  titleEn: string | null
  descriptionEn: string | null
  techStack: string | null
  repoUrl: string | null
  previewUrl: string | null
  screenshotUrl: string | null
  status: string | null
  createdAt: string | null
}

export const proyectosInstantanea = datos.proyectos as ProyectoInstantanea[]

/** Fecha de captura, para que la página pueda decir de cuándo son los datos. */
export function capturadaEn(): Date | null {
  const raw = datos.meta?.capturadaEn
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/** Días transcurridos desde la captura. Útil para decidir si vale la pena mostrarla. */
export function antiguedadEnDias(ahora: number = Date.now()): number | null {
  const d = capturadaEn()
  return d ? Math.floor((ahora - d.getTime()) / 86_400_000) : null
}
