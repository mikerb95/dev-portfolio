import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/pages/api/github/activity'

// /api/github/activity alimenta /log y la portada, que son públicas, pero el
// token ve también los repos privados. Lo privado cuenta para las cifras y
// nunca aparece por nombre ni por mensaje. Antes /log publicaba el historial
// de repos privados, incluidos los de clientes.

const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString()
const commit = (sha: string, message: string, horas: number) => ({
  sha: sha.repeat(40),
  commit: { message, author: { date: hace(horas) } },
})

const GITHUB: Record<string, unknown> = {
  '/user/repos': [
    { name: 'publico', full_name: 'mikerb95/publico', owner: { login: 'mikerb95' }, private: false, pushed_at: hace(1) },
    { name: 'cliente-secreto', full_name: 'mikerb95/cliente-secreto', owner: { login: 'mikerb95' }, private: true, pushed_at: hace(2) },
  ],
  '/repos/mikerb95/publico/commits': [commit('a', 'feat: algo público', 1)],
  '/repos/mikerb95/cliente-secreto/commits': [commit('b', 'fix: el cobro del cliente X', 2)],
  // La búsqueda trae commits de repos ajenos; uno sin visibilidad declarada
  // se trata como privado.
  '/search/commits': {
    total_count: 1,
    items: [{ ...commit('c', 'chore: repo ajeno sin visibilidad', 3), repository: { full_name: 'otra-org/interno' } }],
  },
  '/users/mikerb95/events': [
    {
      type: 'PullRequestEvent',
      public: false,
      repo: { name: 'mikerb95/cliente-secreto' },
      payload: { action: 'closed', pull_request: { title: 'PR secreto', merged: true } },
      created_at: hace(4),
    },
    {
      type: 'PullRequestEvent',
      public: true,
      repo: { name: 'mikerb95/publico' },
      payload: { action: 'closed', pull_request: { title: 'PR público', merged: true } },
      created_at: hace(5),
    },
  ],
}

const fetchGithub = vi.fn(async (input: RequestInfo | URL) => {
  const body = GITHUB[new URL(String(input)).pathname] ?? []
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
})

const llamar = (url: string) =>
  GET({ url: new URL(url) } as unknown as Parameters<typeof GET>[0]) as Promise<Response>

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', 'token-de-prueba')
  vi.stubEnv('GITHUB_USERNAME', 'mikerb95')
  vi.stubGlobal('fetch', fetchGithub)
  fetchGithub.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('/api/github/activity: lo privado cuenta pero no se publica', () => {
  it('la lista solo trae commits y PRs de repos públicos', async () => {
    const res = await llamar('https://codebymike.net/api/github/activity')
    const data = await res.json()
    expect(data.feed.map((f: { message: string }) => f.message)).toEqual(['feat: algo público', 'PR público'])
  })

  it('ningún nombre ni mensaje privado aparece en ninguna parte de la respuesta', async () => {
    const texto = await (await llamar('https://codebymike.net/api/github/activity')).text()
    for (const secreto of ['cliente-secreto', 'el cobro del cliente X', 'PR secreto', 'otra-org', 'sin visibilidad']) {
      expect(texto, secreto).not.toContain(secreto)
    }
  })

  it('las cifras siguen contando el trabajo privado', async () => {
    const data = await (await llamar('https://codebymike.net/api/github/activity')).json()
    // Tres commits (público, privado y el de la búsqueda) y dos PRs.
    expect(data.totalCommits).toBe(3)
    expect(data.sparkline.reduce((a: number, n: number) => a + n, 0)).toBe(5)
    expect(data.streak).toBeGreaterThanOrEqual(1)
  })
})

describe('/api/github/activity: la query no salta la caché', () => {
  it('manda cualquier query a la URL limpia sin tocar GitHub', async () => {
    const res = await llamar('https://codebymike.net/api/github/activity?x=1')
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://codebymike.net/api/github/activity')
    expect(fetchGithub).not.toHaveBeenCalled()
  })
})
