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

function calcStreak(events: GitHubEvent[]): number {
  const activeDays = new Set(
    events
      .filter((e) => e.type === 'PushEvent')
      .map((e) => {
        const d = new Date(e.created_at)
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

  const res = await fetch(
    `https://api.github.com/users/${username}/events?per_page=100`,
    { headers }
  )

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'GitHub API error', status: res.status }), { status: 502 })
  }

  const events: GitHubEvent[] = await res.json()

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000
  const sinceIso = new Date(thirtyDaysAgo).toISOString()
  const recentEvents = events.filter(
    (e) => new Date(e.created_at).getTime() >= thirtyDaysAgo
  )

  // Build feed
  const seen = new Set<string>()
  const feed: FeedItem[] = []

  // NOTE: GitHub's Events API no longer includes `payload.commits` in PushEvents
  // (only ref/head/before), so the feed is rebuilt from the per-repo Commits API.
  // Collect the repos the user pushed to recently, then fetch their commits.
  const activeRepos = Array.from(
    new Set(
      recentEvents
        .filter((e) => e.type === 'PushEvent')
        .map((e) => e.repo.name)
    )
  )

  const commitResults = await Promise.all(
    activeRepos.map(async (repoFull) => {
      const url =
        `https://api.github.com/repos/${repoFull}/commits` +
        `?author=${encodeURIComponent(username)}&since=${sinceIso}&per_page=100`
      const r = await fetch(url, { headers })
      if (!r.ok) return { repoFull, commits: [] as CommitApiItem[] }
      return { repoFull, commits: (await r.json()) as CommitApiItem[] }
    })
  )

  for (const { repoFull, commits } of commitResults) {
    for (const c of commits) {
      const firstLine = c.commit.message.split('\n')[0].trim()
      if (isSkipped(firstLine) || seen.has(c.sha)) continue
      seen.add(c.sha)
      feed.push({
        repo: repoFull.split('/')[1] ?? repoFull,
        repoFull,
        message: firstLine,
        sha: c.sha.slice(0, 7),
        timestamp: c.commit.author?.date ?? c.commit.committer?.date ?? '',
        type: 'commit',
      })
    }
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
