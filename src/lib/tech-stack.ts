// projects.techStack se guarda como JSON.stringify(string[]), pero al menos un
// registro quedó con un string plano ("Astro, Sanity") por un insert que no pasó
// por el formulario del admin (que sí normaliza). Un JSON.parse sin proteger tumba
// la página completa (home, /admin/projects) por un solo dato mal formado.
export function parseTechStack(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
}
