import { writeFileSync } from 'node:fs'
import { beforeEach, expect, it } from 'vitest'
import { createMemoryStore, __setPresentStore } from '../src/lib/present/store'
import { GET, POST } from '../src/pages/api/presentacion'
beforeEach(() => __setPresentStore(createMemoryStore()))
const ctx = (u: string, init?: RequestInit) => ({ request: new Request(u, init), url: new URL(u) }) as any
it('dbg', async () => {
  const out: string[] = []
  const p = await POST(ctx('https://codebymike.tech/api/presentacion', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ accion: 'siguiente' }) }))
  out.push('POST ' + p.status + ' ' + (await p.clone().text()))
  const g = await GET(ctx('https://codebymike.tech/api/presentacion?q=destino'))
  out.push('GET ' + g.status + ' ' + (await g.text()))
  writeFileSync('/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/ac5e2e18-9746-4f0b-b8d7-77569a1769e1/scratchpad/dbg.txt', out.join('\n'))
  expect(1).toBe(1)
})
