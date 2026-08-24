import { describe, expect, it } from 'vitest'
import { REDES } from '../src/data/red'
import { findLayoutIssues, layout } from '../src/lib/red-layout'

describe.each(REDES)('red "$id"', (modelo) => {
  it('no tiene defectos de dibujo ni de notación', () => {
    expect(findLayoutIssues(modelo).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
  })

  // ── Notación: lo que un repaso visual no atrapa.

  it('declara protocolo en todos los flujos', () => {
    for (const f of modelo.flujos) expect(f.protocolo.trim().length).toBeGreaterThan(0)
  })

  it('declara puerto y al menos un control en todo flujo que cruza una zona', () => {
    const zonaDe = new Map(modelo.hosts.map((h) => [h.id, h.zona]))
    for (const f of modelo.flujos) {
      if (zonaDe.get(f.from) === zonaDe.get(f.to)) continue
      expect(f.puerto?.trim(), `${f.from}→${f.to} sin puerto`).toBeTruthy()
      expect(f.controles?.length ?? 0, `${f.from}→${f.to} sin controles`).toBeGreaterThan(0)
    }
  })

  it('nunca deja entrar tráfico a una zona más confiable saltándose un nivel', () => {
    const zonaDe = new Map(modelo.hosts.map((h) => [h.id, h.zona]))
    const nivelDe = new Map(modelo.zonas.map((z) => [z.id, z.nivel]))
    for (const f of modelo.flujos) {
      const a = nivelDe.get(zonaDe.get(f.from)!)!
      const b = nivelDe.get(zonaDe.get(f.to)!)!
      expect(b, `${f.from}→${f.to}`).toBeLessThanOrEqual(a + 1)
      if (f.bidireccional) expect(a, `${f.to}→${f.from}`).toBeLessThanOrEqual(b + 1)
    }
  })

  it('no expone la zona de datos a ningún origen que no sea el cómputo', () => {
    const zonaDe = new Map(modelo.hosts.map((h) => [h.id, h.zona]))
    const nivelDe = new Map(modelo.zonas.map((z) => [z.id, z.nivel]))
    const maxNivel = Math.max(...modelo.zonas.map((z) => z.nivel))
    const privadas = modelo.zonas.filter((z) => z.nivel === maxNivel).map((z) => z.id)
    for (const f of modelo.flujos) {
      const destino = zonaDe.get(f.to)!
      if (!privadas.includes(destino)) continue
      // El único origen legítimo es la zona inmediatamente inferior.
      expect(nivelDe.get(zonaDe.get(f.from)!), `${f.from}→${f.to}`).toBe(maxNivel - 1)
    }
  })

  it('hace pasar todo request externo por el perímetro antes del cómputo', () => {
    const zonaDe = new Map(modelo.hosts.map((h) => [h.id, h.zona]))
    const nivelDe = new Map(modelo.zonas.map((z) => [z.id, z.nivel]))
    const externos = modelo.hosts.filter((h) => nivelDe.get(h.zona) === 0).map((h) => h.id)
    for (const f of modelo.flujos) {
      if (!externos.includes(f.from)) continue
      expect(nivelDe.get(zonaDe.get(f.to)!), `${f.from} alcanza ${f.to} sin pasar por el perímetro`).toBeLessThanOrEqual(1)
    }
  })

  // ── Geometría

  it('coloca cada host dentro de su zona', () => {
    const l = layout(modelo)
    const zonas = new Map(l.zonas.map((z) => [z.id, z]))
    for (const h of l.hosts) {
      const z = zonas.get(h.zona)!
      expect(h.x).toBeGreaterThanOrEqual(z.x)
      expect(h.x + h.w).toBeLessThanOrEqual(z.x + z.w)
      expect(h.y).toBeGreaterThanOrEqual(z.y)
      expect(h.y + h.h).toBeLessThanOrEqual(z.y + z.h)
    }
  })

  it('numera los flujos de forma correlativa para la tabla de controles', () => {
    const nums = layout(modelo).flujos.map((f) => f.num)
    expect(nums).toEqual(modelo.flujos.map((_, i) => i + 1))
  })

  it('conecta el grafo entero: ningún host queda aislado', () => {
    const vecinos = new Map<string, string[]>()
    for (const f of modelo.flujos) {
      vecinos.set(f.from, [...(vecinos.get(f.from) ?? []), f.to])
      vecinos.set(f.to, [...(vecinos.get(f.to) ?? []), f.from])
    }
    const vistos = new Set([modelo.hosts[0].id])
    const pila = [modelo.hosts[0].id]
    while (pila.length) {
      for (const v of vecinos.get(pila.pop()!) ?? []) {
        if (vistos.has(v)) continue
        vistos.add(v)
        pila.push(v)
      }
    }
    expect(vistos.size).toBe(modelo.hosts.length)
  })
})

describe('verificación del motor', () => {
  const base = REDES[0]

  it('detecta un flujo que se salta el perímetro', () => {
    const roto = { ...base, flujos: [...base.flujos, { from: 'visitante', to: 'turso', protocolo: 'libSQL', puerto: '443/tcp', controles: ['ninguno real'] }] }
    expect(findLayoutIssues(roto).some((i) => i.kind === 'confianza')).toBe(true)
  })

  it('detecta un cruce de frontera sin control declarado', () => {
    const roto = { ...base, flujos: [...base.flujos, { from: 'cache', to: 'app', protocolo: 'HTTPS', puerto: '443/tcp' }] }
    expect(findLayoutIssues(roto).some((i) => i.detail.includes('sin declarar ningún control'))).toBe(true)
  })

  it('detecta un host que no participa en ningún flujo', () => {
    const roto = { ...base, hosts: [...base.hosts, { id: 'huerfano', zona: 'datos', label: 'X', rol: 'datos', col: 9 }] }
    expect(findLayoutIssues(roto).some((i) => i.detail.includes('huerfano'))).toBe(true)
  })
})
