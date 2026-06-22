// Seed the `projects` table from the GitHub API.
//
// Reads all config from the environment — never hardcode secrets here.
// Run with Node's native env loading (Node 20.6+):
//
//   node --env-file=.env scripts/seed-projects.mjs
//
// Required env vars (already present in .env):
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, GITHUB_TOKEN, GITHUB_USERNAME

import { createClient } from '@libsql/client'

const {
  TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN,
  GITHUB_TOKEN,
  GITHUB_USERNAME,
} = process.env

const missing = Object.entries({
  TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN,
  GITHUB_TOKEN,
  GITHUB_USERNAME,
})
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}`)
  console.error('Ejecuta con: node --env-file=.env scripts/seed-projects.mjs')
  process.exit(1)
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
})

async function fetchRepos() {
  const repos = []
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&page=${page}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    }
    const batch = await res.json()
    repos.push(...batch)
    if (batch.length < 100) break
  }
  return repos.filter((r) => !r.fork && !r.archived)
}

function toProject(repo) {
  const techStack = [repo.language, ...(repo.topics ?? [])]
    .filter(Boolean)
    .join(', ')
  return {
    slug: repo.name,
    title: repo.name,
    description: repo.description ?? null,
    techStack: techStack || null,
    repoUrl: repo.html_url,
    previewUrl: repo.homepage || null,
    status: 'activo',
    visible: 0, // queda oculto hasta curarlo desde /admin
    createdAt: Math.floor(new Date(repo.created_at).getTime() / 1000),
  }
}

async function upsert(p) {
  await db.execute({
    sql: `
      INSERT INTO projects (slug, title, description, tech_stack, repo_url, preview_url, status, visible, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        tech_stack = excluded.tech_stack,
        repo_url = excluded.repo_url,
        preview_url = excluded.preview_url
    `,
    args: [
      p.slug,
      p.title,
      p.description,
      p.techStack,
      p.repoUrl,
      p.previewUrl,
      p.status,
      p.visible,
      p.createdAt,
    ],
  })
}

const repos = await fetchRepos()
console.log(`Encontrados ${repos.length} repos. Sembrando…`)

for (const repo of repos) {
  const p = toProject(repo)
  await upsert(p)
  console.log(`  ✓ ${p.slug}`)
}

console.log(`Listo: ${repos.length} proyectos en la base de datos.`)
