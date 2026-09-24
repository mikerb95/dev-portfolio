// URL apta para un href: solo http(s).
//
// Astro escapa el valor del atributo, pero no mira el esquema: un
// `javascript:` guardado en la base (el repo o la preview de un proyecto) se
// pinta tal cual en el enlace y se ejecuta al hacer clic. Los datos de
// proyectos se podían escribir sin sesión hasta la auditoría del 22 sep 2026,
// así que el filtro va al pintar, que cubre también lo que ya esté guardado.
//
// Módulo puro: lo usan páginas públicas, el panel y el portal.

export function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const { protocol } = new URL(url.trim())
    return protocol === 'https:' || protocol === 'http:' ? url.trim() : null
  } catch {
    return null
  }
}
