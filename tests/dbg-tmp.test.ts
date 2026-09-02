import { beforeEach, expect, it } from 'vitest'
import { createMemoryStore, __setPresentStore } from '../src/lib/present/store'
import { GET, POST } from '../src/pages/api/presentacion'
beforeEach(() => __setPresentStore(createMemoryStore()))
const ctx = (u: string, init?: RequestInit) => ({ request: new Request(u, init), url: new URL(u) }) as any
it('dbg', async () => {
  const p = await POST(ctx('https://codebymike.tech/api/presentacion', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ accion: 'siguiente' }) }))
  console.log('POST', p.status, await p.clone().text())
  const g = await GET(ctx('https://codebymike.tech/api/presentacion?q=destino'))
  console.log('GET', g.status, await g.text())
  expect(1).toBe(1)
})
