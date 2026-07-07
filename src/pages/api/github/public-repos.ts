import type { APIRoute } from 'astro'

export const GET: APIRoute = async () => {
  const token = import.meta.env.GITHUB_TOKEN
  const username = import.meta.env.GITHUB_USERNAME ?? 'mikerb95'

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=12&sort=updated`,
    { headers }
  )

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'GitHub API error', status: res.status }), { status: 502 })
  }

  const repos = await res.json()

  return new Response(JSON.stringify(repos), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  })
}
