import type { APIRoute } from 'astro'
import { porDia, racha, redondearMarca, trabajoProfundo, type DeepWork } from '../../../lib/actividad'

// Qué se PUBLICA y qué solo se CUENTA. El token ve también los repos privados y
// los de organizaciones, y este endpoint alimenta páginas públicas (/log y la
// portada). El trabajo privado es trabajo real, así que entra en las cifras
// (horas, racha, total, gráfico), que solo necesitan la hora de cada commit;
// pero su nombre de repo y su mensaje no salen nunca. Antes salían: /log
// publicaba el historial de repos privados, incluidos los de clientes.
//
// De lo privado sí sale la HORA de cada commit, redondeada a 5 minutos
// (`privateCommitTimes`): el reloj de /log dibuja las sesiones con ella, y sin
// ella las horas de trabajo profundo no cuadrarían con lo dibujado. Las cifras
// se calculan con esas mismas horas redondeadas, así el navegador puede
// rehacer la cuenta y llegar al mismo número.

interface GitHubEvent {
  type: string
  // `false` en los eventos de repos privados, que la API solo devuelve porque
  // el token es del propio usuario.
  public?: boolean
  repo: { name: string }
  payload: {
    commits?: Array<{ message: string; sha: string }>
    ref?: string
    action?: string
    pull_request?: { title: string; merged: boolean }
  }
  created_at: string
}

interface CommitSearchItem {
  sha: string
  commit: {
    message: string
    author?: { date?: string }
    committer?: { date?: string }
  }
  repository: { full_name: string; private?: boolean }
}

// Ante la duda, privado: un repo cuya visibilidad no viene en la respuesta no
// se publica. Solo `private: false` explícito abre la puerta.
const esPublico = (repo: { private?: boolean }) => repo.private === false

export interface FeedItem {
  repo: string
  repoFull: string
  message: string
  sha: string
  timestamp: string
  type: 'commit' | 'pr_merged'
}

export type DeepWorkStats = DeepWork

const SKIP_PATTERNS = [
  /^merge/i,
  /^chore\(release\)/i,
  /\[skip ci\]/i,
  /^bump version/i,
  /^wip$/i,
]

function isSkipped(msg: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(msg.trim()))
}

export const GET: APIRoute = async ({ url }) => {
  // La respuesta no depende de la query, pero la CDN cachea por URL completa:
  // `?x=1`, `?x=2`… eran cada uno un MISS que rehacía el rastreo entero contra
  // GitHub (cinco segundos y decenas de llamadas con el token). Cualquier query
  // se manda a la URL limpia, que es la única que llega a cachearse.
  if (url.search) return Response.redirect(new URL(url.pathname, url), 308)

  const token = import.meta.env.GITHUB_TOKEN
  const username = import.meta.env.GITHUB_USERNAME

  if (!token || !username) {
    return new Response(JSON.stringify({ error: 'GitHub not configured' }), { status: 503 })
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000
  const sinceIso = new Date(thirtyDaysAgo).toISOString()
  const sinceDate = sinceIso.split('T')[0]

  // The Search API (`search/commits`) is convenient but caps at 1000 results
  // total (10 pages of 100). For an active author that silently drops the
  // oldest commits of the month. To show *everything*, we enumerate the repos
  // the user can push to and list each repo's commits directly via
  // `/repos/{owner}/{repo}/commits`, which paginates without the 1000 cap.
  // The Search API is still run afterwards as a supplement to catch commits
  // authored in external repos the user doesn't own; results merge by SHA.

  // 1) Discover repos touched within the window. Sorting by `pushed` descending
  //    lets us stop as soon as we reach a repo that hasn't been pushed since
  //    `thirtyDaysAgo` - everything after it is older too.
  const activeRepos: Array<{ owner: string; name: string; full: string; private?: boolean }> = []
  let repoPage = 1
  discover: while (repoPage <= 20) {
    const rr = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member&page=${repoPage}`,
      { headers }
    )
    if (!rr.ok) break
    const list = await rr.json()
    if (!Array.isArray(list) || list.length === 0) break
    for (const repo of list) {
      if (new Date(repo.pushed_at).getTime() < thirtyDaysAgo) break discover
      activeRepos.push({
        owner: repo.owner?.login ?? repo.full_name.split('/')[0],
        name: repo.name,
        full: repo.full_name,
        private: repo.private,
      })
    }
    if (list.length < 100) break
    repoPage++
  }

  // 2) List every commit authored by the user in each active repo, since the
  //    window start. Runs with bounded concurrency to stay well within the
  //    authenticated rate limit while avoiding a slow fully-sequential crawl.
  async function fetchRepoCommits(repo: {
    owner: string
    name: string
    full: string
    private?: boolean
  }): Promise<CommitSearchItem[]> {
    const out: CommitSearchItem[] = []
    let cp = 1
    while (cp <= 20) {
      const cr = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?author=${encodeURIComponent(
          username
        )}&since=${sinceIso}&per_page=100&page=${cp}`,
        { headers }
      )
      if (!cr.ok) break
      const cl = await cr.json()
      if (!Array.isArray(cl) || cl.length === 0) break
      for (const c of cl) {
        out.push({
          sha: c.sha,
          commit: c.commit,
          repository: { full_name: repo.full, private: repo.private },
        })
      }
      if (cl.length < 100) break
      cp++
    }
    return out
  }

  const searchItems: CommitSearchItem[] = []
  const CONCURRENCY = 8
  let repoIdx = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, activeRepos.length) }, async () => {
      while (repoIdx < activeRepos.length) {
        const repo = activeRepos[repoIdx++]
        const commits = await fetchRepoCommits(repo)
        searchItems.push(...commits)
      }
    })
  )

  // 3) Supplement with the Search API for commits in external repos not covered
  //    above (capped at 1000, but only used to fill gaps - dedup is by SHA).
  let page = 1
  let totalCount = Infinity
  while (searchItems.length < totalCount && page <= 10) {
    const searchUrl =
      `https://api.github.com/search/commits?q=${encodeURIComponent(
        `author:${username} author-date:>=${sinceDate}`
      )}&sort=author-date&order=desc&per_page=100&page=${page}`
    const r = await fetch(searchUrl, { headers })
    if (!r.ok) break
    const data = await r.json()
    totalCount = data.total_count ?? searchItems.length
    const items: CommitSearchItem[] = data.items ?? []
    searchItems.push(...items)
    if (items.length < 100) break
    page++
  }

  const eventsRes = await fetch(
    `https://api.github.com/users/${username}/events?per_page=100`,
    { headers }
  )

  if (!eventsRes.ok) {
    return new Response(JSON.stringify({ error: 'GitHub API error', status: eventsRes.status }), { status: 502 })
  }

  const events: GitHubEvent[] = await eventsRes.json()
  const recentEvents = events.filter(
    (e) => new Date(e.created_at).getTime() >= thirtyDaysAgo
  )

  // Build feed. Todo cuenta para las cifras; solo lo público entra en `feed`.
  const seen = new Set<string>()
  const feed: FeedItem[] = []
  const commitTimes: number[] = []
  const privateCommitTimes: number[] = []
  // Hora de cada commit y PR fusionado, públicos o no, para el gráfico.
  const activityTimes: string[] = []
  let totalCommits = 0

  for (const c of searchItems) {
    const firstLine = c.commit.message.split('\n')[0].trim()
    if (isSkipped(firstLine) || seen.has(c.sha)) continue
    seen.add(c.sha)
    totalCommits++
    const timestamp = c.commit.author?.date ?? c.commit.committer?.date ?? ''
    const marca = timestamp ? redondearMarca(new Date(timestamp).getTime()) : NaN
    if (Number.isFinite(marca)) commitTimes.push(marca)
    activityTimes.push(timestamp)
    if (!esPublico(c.repository)) {
      if (Number.isFinite(marca)) privateCommitTimes.push(marca)
      continue
    }
    feed.push({
      repo: c.repository.full_name.split('/')[1] ?? c.repository.full_name,
      repoFull: c.repository.full_name,
      message: firstLine,
      sha: c.sha.slice(0, 7),
      timestamp,
      type: 'commit',
    })
  }

  for (const event of recentEvents) {
    if (
      event.type === 'PullRequestEvent' &&
      event.payload.action === 'closed' &&
      event.payload.pull_request?.merged
    ) {
      const key = `pr-${event.repo.name}-${event.created_at}`
      if (!seen.has(key)) {
        seen.add(key)
        activityTimes.push(event.created_at)
        if (event.public !== true) continue
        feed.push({
          repo: event.repo.name.split('/')[1] ?? event.repo.name,
          repoFull: event.repo.name,
          message: event.payload.pull_request.title,
          sha: '',
          timestamp: event.created_at,
          type: 'pr_merged',
        })
      }
    }
  }

  feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Un solo "ahora" para todas las cifras, y se publica: la respuesta vive
  // media hora en la CDN, y el navegador rehace la cuenta con este instante,
  // no con el suyo.
  const generatedAt = Date.now()
  const deepWork = trabajoProfundo(commitTimes, generatedAt)
  const streak = racha(commitTimes, generatedAt).dias

  // Actividad por día (commits y PRs, públicos o no) de los últimos 14 días.
  const sparkline = porDia(
    activityTimes.filter(Boolean).map((t) => new Date(t).getTime()),
    generatedAt,
  )

  return new Response(
    JSON.stringify({
      feed,
      deepWork,
      streak,
      totalCommits,
      sparkline,
      generatedAt,
      privateCommitTimes: privateCommitTimes.sort((a, b) => a - b),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    }
  )
}
