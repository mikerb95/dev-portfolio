import { describe, expect, it } from 'vitest'
import {
  mapRunEstado,
  normalizeJob,
  esRunVivo,
  estadoOperacion,
  estadoGlobal,
  type GhJob,
} from '../src/lib/lab/pipeline-live'

describe('mapRunEstado', () => {
  it('mapea queued/in_progress antes de completarse', () => {
    expect(mapRunEstado('queued', null)).toBe('pending')
    expect(mapRunEstado('in_progress', null)).toBe('in_progress')
  })

  it('mapea conclusiones de un run completado', () => {
    expect(mapRunEstado('completed', 'success')).toBe('ok')
    expect(mapRunEstado('completed', 'failure')).toBe('fail')
    expect(mapRunEstado('completed', 'timed_out')).toBe('fail')
    expect(mapRunEstado('completed', 'skipped')).toBe('skip')
    expect(mapRunEstado('completed', 'cancelled')).toBe('skip')
  })
})

describe('normalizeJob', () => {
  const job: GhJob = {
    name: 'quality',
    status: 'in_progress',
    conclusion: null,
    html_url: 'https://github.com/x',
    steps: [
      { name: 'Set up job', status: 'completed', conclusion: 'success', number: 1 },
      { name: 'Tests con cobertura', status: 'in_progress', conclusion: null, number: 4 },
      { name: 'Build', status: 'queued', conclusion: null, number: 5 },
    ],
  }

  it('normaliza el job y filtra pasos aún no arrancados', () => {
    const r = normalizeJob(job)
    expect(r.nombre).toBe('quality')
    expect(r.estado).toBe('in_progress')
    // "Build" en queued se descarta: todavía no hay nada que contar de él.
    expect(r.pasos.map((p) => p.nombre)).toEqual(['Set up job', 'Tests con cobertura'])
    expect(r.pasos[1].estado).toBe('in_progress')
  })
})

describe('esRunVivo', () => {
  const ahora = Date.parse('2026-07-24T12:00:00Z')

  it('un run no completado siempre está vivo', () => {
    expect(esRunVivo({ status: 'in_progress', updatedAt: null }, ahora)).toBe(true)
  })

  it('un run completado reciente sigue vivo dentro de la ventana', () => {
    expect(esRunVivo({ status: 'completed', updatedAt: '2026-07-24T11:55:00Z' }, ahora)).toBe(true)
  })

  it('un run completado viejo ya no está vivo', () => {
    expect(esRunVivo({ status: 'completed', updatedAt: '2026-07-24T10:00:00Z' }, ahora)).toBe(false)
  })

  it('sin run, no está vivo', () => {
    expect(esRunVivo(null, ahora)).toBe(false)
  })
})

describe('estadoOperacion', () => {
  it('todos sanos → ok; ninguno → fail; parcial → skip', () => {
    expect(estadoOperacion({ ok: 8, total: 8 })).toBe('ok')
    expect(estadoOperacion({ ok: 0, total: 8 })).toBe('fail')
    expect(estadoOperacion({ ok: 5, total: 8 })).toBe('skip')
    expect(estadoOperacion({ ok: 0, total: 0 })).toBe('pending')
  })
})

describe('estadoGlobal', () => {
  const base = {
    push: { estado: 'ok' as const, ts: null },
    workflows: [{ id: 'ci', nombre: 'CI', estado: 'ok' as const, url: null, jobs: [] }],
    deploy: { estado: 'ok' as const, detalle: null, url: null },
    verify: { estado: 'ok' as const, healthOk: true },
  }

  it('todo ok → ok', () => {
    expect(estadoGlobal(base)).toBe('ok')
  })

  it('cualquier in_progress domina', () => {
    expect(estadoGlobal({ ...base, deploy: { ...base.deploy, estado: 'in_progress' } })).toBe('in_progress')
  })

  it('un fail sin in_progress se propaga', () => {
    expect(estadoGlobal({ ...base, verify: { ...base.verify, estado: 'fail' } })).toBe('fail')
  })
})
