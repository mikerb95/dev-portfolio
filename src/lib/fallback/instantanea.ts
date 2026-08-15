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

/**
 * Los campos que pinta la tarjeta de proyecto, y solo esos. El tipo es el
 * contrato con la consulta de la portada: si la tarjeta pasa a mostrar un campo
 * nuevo, `astro check` rompe aquí hasta que la instantánea también lo traiga.
 */
export type ProyectoInstantanea = {
  slug: string
  title: string
  description: string | null
  titleEn: string | null
  descriptionEn: string | null
  techStack: string | null
  screenshotUrl: string | null
}

export const proyectosInstantanea: ProyectoInstantanea[] = (
  datos.proyectos as Record<string, unknown>[]
).map((p) => ({
  slug: String(p.slug),
  title: String(p.title),
  description: (p.description as string) ?? null,
  titleEn: (p.titleEn as string) ?? null,
  descriptionEn: (p.descriptionEn as string) ?? null,
  techStack: (p.techStack as string) ?? null,
  screenshotUrl: (p.screenshotUrl as string) ?? null,
}))

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
