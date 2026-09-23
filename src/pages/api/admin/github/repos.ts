import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { projects } from '../../../../db/schema'

// Vive bajo /api/admin/ para heredar el gate del middleware. Antes estaba en
// /api/github/, fuera de él, y respondía a cualquiera: `user/repos` con el
// GITHUB_TOKEN devuelve también los repos PRIVADOS, así que el endpoint
// publicaba su nombre y descripción (y dejaba a cualquiera gastar la cuota del
// token). Lo público del perfil es /api/github/public-repos.
export const GET: APIRoute = async () => {
  const token = import.meta.env.GITHUB_TOKEN
  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'GitHub API error' }), { status: 502 })
  }

  const repos = await res.json()

  const visibleProjects = await db.select({
    slug: projects.slug,
    visible: projects.visible,
  }).from(projects)

  const visibleMap = Object.fromEntries(visibleProjects.map((p) => [p.slug, p.visible]))

  const mapped = repos.map((r: any) => ({
    id: r.id,
    slug: r.name,
    name: r.name,
    description: r.description,
    url: r.html_url,
    homepage: r.homepage,
    language: r.language,
    stars: r.stargazers_count ?? 0,
    topics: r.topics ?? [],
    updatedAt: r.updated_at,
    visible: visibleMap[r.name] ?? false,
  }))

  return new Response(JSON.stringify(mapped), { status: 200 })
}
