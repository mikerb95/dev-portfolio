import type { APIRoute } from 'astro'

interface GitHubEvent {
  type: string
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
  repository: { full_name: string }
}

export interface FeedItem {
  repo: string
  repoFull: string
  message: string
  sha: string
  timestamp: string
  type: 'commit' | 'pr_merged'
}

export interface DeepWorkStats {
  weekHours: number
  monthHours: number
  sessions: number
}

// Merge commit timestamps within 90-min gaps into sessions, +30 min per commit minimum
function calcDeepWork(commitTimes: number[]): DeepWorkStats {
  const pushTimes = [...commitTimes].sort((a, b) => a - b)

  if (!pushTimes.length) return { weekHours: 0, monthHours: 0, sessions: 0 }

  type Session = { start: number; end: number }
  const sessions: Session[] = []
  let start = pushTimes[0]
  let end = pushTimes[0]

  for (let i = 1; i < pushTimes.length; i++) {
    const gapMin = (pushTimes[i] - end) / 60_000
    if (gapMin <= 90) {
      end = pushTimes[i]
    } else {
      sessions.push({ start, end })
      start = pushTimes[i]
      end = pushTimes[i]
    }
  }
  sessions.push({ start, end })

  const durationMin = (s: Session) =>
    Math.max((s.end - s.start) / 60_000 + 30, 30)

  const now = Date.now()
  const weekMs = 7 * 86_400_000
  const monthMs = 30 * 86_400_000

  const weekHours = sessions
    .filter((s) => s.end >= now - weekMs)
    .reduce((acc, s) => acc + durationMin(s) / 60, 0)

  const monthHours = sessions
    .filter((s) => s.end >= now - monthMs)
    .reduce((acc, s) => acc + durationMin(s) / 60, 0)

  return {
    weekHours: Math.round(weekHours * 10) / 10,
    monthHours: Math.round(monthHours * 10) / 10,
    sessions: sessions.length,
  }
}

function calcStreak(commitTimes: number[]): number {
  const activeDays = new Set(
    commitTimes.map((t) => {
      const d = new Date(t)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  let streak = 0
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (activeDays.has(key)) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

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

export const GET: APIRoute = async () => {
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
  //    `thirtyDaysAgo` — everything after it is older too.
  const activeRepos: Array<{ owner: string; name: string; full: string }> = []
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
          repository: { full_name: repo.full },
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
  //    above (capped at 1000, but only used to fill gaps — dedup is by SHA).
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

  // Build feed
  const seen = new Set<string>()
  const feed: FeedItem[] = []
  const commitTimes: number[] = []

  for (const c of searchItems) {
    const firstLine = c.commit.message.split('\n')[0].trim()
    if (isSkipped(firstLine) || seen.has(c.sha)) continue
    seen.add(c.sha)
    const timestamp = c.commit.author?.date ?? c.commit.committer?.date ?? ''
    if (timestamp) commitTimes.push(new Date(timestamp).getTime())
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

  const deepWork = calcDeepWork(commitTimes)
  const streak = calcStreak(commitTimes)

  // Commits per day for sparkline (last 14 days)
  const commitsByDay: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    commitsByDay[d.toISOString().split('T')[0]] = 0
  }
  for (const item of feed) {
    const day = item.timestamp.split('T')[0]
    if (day in commitsByDay) commitsByDay[day]++
  }

  return new Response(
    JSON.stringify({
      feed,
      deepWork,
      streak,
      totalCommits: feed.filter((f) => f.type === 'commit').length,
      sparkline: Object.values(commitsByDay),
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
