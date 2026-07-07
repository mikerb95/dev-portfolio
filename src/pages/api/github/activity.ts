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

  // NOTE: The Events API only returns the most recent ~100 events, which for an
  // active user skews toward the last day or two and can silently drop entire
  // repos/days from the 30-day window. Discover commits via the Search API
  // instead, which queries the full history directly and isn't truncated the
  // same way.
  const searchItems: CommitSearchItem[] = []
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

  const deepWork = calcDeepWork(recentEvents)
  const streak = calcStreak(recentEvents)

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
      feed: feed.slice(0, 25),
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
