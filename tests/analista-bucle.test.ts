import { describe, expect, it } from 'vitest'
import {
  avanzar,
  decidir,
  MAX_ITERACIONES,
  nuevaEjecucion,
  type Dependencias,
  type Ejecucion,
  type EventoBucle,
} from '../src/lib/analista/bucle'
import type { Seudonimos } from '../src/lib/analista/seudonimos'

// Respuestas falsas de la API con la forma mínima que usa el bucle.
type Bloque =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
const respuesta = (stop_reason: string, content: Bloque[]) =>
  ({ content, stop_reason, usage: { input_tokens: 1000, output_tokens: 100 } }) as any

const texto = (t: string): Bloque => ({ type: 'text', text: t })
const uso = (id: string, name: string, input: Record<string, unknown> = {}): Bloque => ({ type: 'tool_use', id, name, input })

function montar(guion: any[], opciones: { presupuesto?: () => Promise<number> } = {}) {
  const eventos: EventoBucle[] = []
  const guardadas: Ejecucion[] = []
  const ejecutadas: { nombre: string; entrada: unknown }[] = []
  const llamadas: unknown[][] = []
  let i = 0
  const deps: Dependencias = {
    herramientaBloqueo: 'bloquear_origen',
    llamarModelo: async (mensajes) => {
      llamadas.push(structuredClone(mensajes))
      const r = guion[i++]
      if (!r) throw new Error('el guion se acabó')
      return r
    },
    validar: (nombre, entrada) =>
      nombre === 'bloquear_origen' && !(entrada as any)?.motivo ? 'falta el motivo' : null,
    ejecutar: async (nombre, entrada, s: Seudonimos) => {
      ejecutadas.push({ nombre, entrada })
      if (nombre === 'top_origenes') return { ok: true, datos: [{ origen: s.alias('203.0.113.7'), hits: 63 }] }
      if (nombre === 'bloquear_origen') return { ok: true, datos: { bloqueado: true } }
      return { ok: true, datos: { nombre } }
    },
    guardar: async (e) => void guardadas.push(structuredClone(e)),
    emitir: (e) => void eventos.push(e),
    presupuestoRestante: opciones.presupuesto ?? (async () => 3),
  }
  return { deps, eventos, guardadas, ejecutadas, llamadas }
}

const ultimoMensaje = (e: Ejecucion) => e.mensajes[e.mensajes.length - 1]!

describe('bucle del analista', () => {
  it('termina con la respuesta cuando el modelo no pide herramientas', async () => {
    const { deps, eventos } = montar([respuesta('end_turn', [texto('Todo tranquilo.')])])
    const e = await avanzar(nuevaEjecucion('e1', '¿Qué pasó?'), deps)
    expect(e.estado).toBe('terminada')
    expect(e.respuesta).toBe('Todo tranquilo.')
    expect(e.costoUsd).toBeGreaterThan(0)
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fin', estado: 'terminada' })
  })

  it('ejecuta herramientas, devuelve los resultados en orden y guarda el historial por anexión', async () => {
    const { deps, llamadas, ejecutadas } = montar([
      respuesta('tool_use', [texto('Miro.'), uso('t1', 'resumen_actividad'), uso('t2', 'anomalias')]),
      respuesta('end_turn', [texto('Listo.')]),
    ])
    const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    expect(e.estado).toBe('terminada')
    expect(ejecutadas.map((x) => x.nombre)).toEqual(['resumen_actividad', 'anomalias'])
    const resultados = (llamadas[1]!.at(-1) as any).content
    expect(resultados.map((r: any) => r.tool_use_id)).toEqual(['t1', 't2'])
    // El historial de la segunda llamada empieza exactamente como la primera.
    expect(llamadas[1]!.slice(0, llamadas[0]!.length)).toEqual(llamadas[0])
  })

  it('se pausa ante un bloqueo sin ejecutarlo, y el rechazo vuelve al modelo como error', async () => {
    const { deps, eventos, ejecutadas, llamadas } = montar([
      respuesta('tool_use', [uso('t1', 'top_origenes')]),
      respuesta('tool_use', [uso('t2', 'bloquear_origen', { origen: 'origen-01', motivo: 'fuerza bruta persistente' })]),
      respuesta('end_turn', [texto('Entendido, no lo bloqueo.')]),
    ])
    let e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    expect(e.estado).toBe('esperando_aprobacion')
    expect(e.propuesta).toMatchObject({ origen: 'origen-01', motivo: 'fuerza bruta persistente' })
    expect(ejecutadas.some((x) => x.nombre === 'bloquear_origen')).toBe(false)
    expect(eventos).toContainEqual({ tipo: 'aprobacion', origen: 'origen-01', motivo: 'fuerza bruta persistente' })
    // Los seudónimos sobreviven a la pausa (la decisión llega en otra petición).
    expect(e.seudonimos).toEqual({ 'origen-01': '203.0.113.7' })

    e = await decidir(structuredClone(e), false, deps)
    expect(e.estado).toBe('terminada')
    expect(ejecutadas.some((x) => x.nombre === 'bloquear_origen')).toBe(false)
    const resultado = (llamadas[2]!.at(-1) as any).content[0]
    expect(resultado).toMatchObject({ tool_use_id: 't2', is_error: true })
    expect(eventos).toContainEqual({ tipo: 'decision', origen: 'origen-01', aprobado: false })
  })

  it('al aprobar, ejecuta el bloqueo y sigue', async () => {
    const { deps, ejecutadas } = montar([
      respuesta('tool_use', [uso('t1', 'top_origenes')]),
      respuesta('tool_use', [uso('t2', 'bloquear_origen', { origen: 'origen-01', motivo: 'fuerza bruta persistente' })]),
      respuesta('end_turn', [texto('Bloqueado.')]),
    ])
    const pausada = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    const e = await decidir(pausada, true, deps)
    expect(e.estado).toBe('terminada')
    expect(ejecutadas.filter((x) => x.nombre === 'bloquear_origen')).toHaveLength(1)
  })

  it('conserva los resultados de las otras herramientas del turno en que se pausó', async () => {
    const { deps, llamadas } = montar([
      respuesta('tool_use', [uso('t1', 'top_origenes')]),
      respuesta('tool_use', [
        uso('t2', 'eventos_de_origen', { origen: 'origen-01' }),
        uso('t3', 'bloquear_origen', { origen: 'origen-01', motivo: 'fuerza bruta persistente' }),
      ]),
      respuesta('end_turn', [texto('Ok.')]),
    ])
    const pausada = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    await decidir(pausada, false, deps)
    const ids = (llamadas[2]!.at(-1) as any).content.map((r: any) => r.tool_use_id)
    expect(ids).toEqual(['t2', 't3'])
  })

  it('no molesta al humano con propuestas inválidas: alias inventado, entrada mal formada o un segundo bloqueo', async () => {
    const { deps, llamadas } = montar([
      respuesta('tool_use', [uso('t1', 'top_origenes')]),
      respuesta('tool_use', [
        uso('t2', 'bloquear_origen', { origen: 'origen-99', motivo: 'inventado por el modelo' }),
        uso('t3', 'bloquear_origen', { origen: 'origen-01' }),
      ]),
      respuesta('end_turn', [texto('Ok.')]),
    ])
    const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    expect(e.estado).toBe('terminada')
    const resultados = (llamadas[2]!.at(-1) as any).content
    expect(resultados.every((r: any) => r.is_error)).toBe(true)

    const doble = montar([
      respuesta('tool_use', [uso('t1', 'top_origenes')]),
      respuesta('tool_use', [
        uso('t2', 'bloquear_origen', { origen: 'origen-01', motivo: 'fuerza bruta persistente' }),
        uso('t3', 'bloquear_origen', { origen: 'origen-01', motivo: 'otra vez el mismo' }),
      ]),
    ])
    const pausada = await avanzar(nuevaEjecucion('e2', 'Analiza'), doble.deps)
    expect(pausada.propuesta?.toolUseId).toBe('t2')
    expect(pausada.propuesta?.resultadosPrevios).toEqual([
      expect.objectContaining({ tool_use_id: 't3', is_error: true }),
    ])
  })

  it('no ejecuta herramientas de un turno cortado ni de una negativa', async () => {
    for (const stop of ['max_tokens', 'refusal']) {
      const { deps, ejecutadas } = montar([respuesta(stop, [uso('t1', 'resumen_actividad')])])
      const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
      expect(e.estado).toBe('fallida')
      expect(ejecutadas).toHaveLength(0)
    }
  })

  it('no gasta si se alcanzó el tope diario o si no se puede saber el gasto', async () => {
    for (const presupuesto of [async () => 0, async (): Promise<number> => { throw new Error('turso caído') }]) {
      const { deps, llamadas } = montar([respuesta('end_turn', [texto('x')])], { presupuesto })
      const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
      expect(e.estado).toBe('fallida')
      expect(llamadas).toHaveLength(0)
    }
  })

  it('corta al llegar al máximo de pasos', async () => {
    const guion = Array.from({ length: MAX_ITERACIONES + 2 }, (_, i) => respuesta('tool_use', [uso(`t${i}`, 'anomalias')]))
    const { deps, llamadas } = montar(guion)
    const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    expect(e.estado).toBe('fallida')
    expect(llamadas).toHaveLength(MAX_ITERACIONES)
    expect(ultimoMensaje(e).role).toBe('user')
  })

  it('un error de la API termina el análisis como fallido, sin lanzar', async () => {
    const { deps } = montar([])
    const e = await avanzar(nuevaEjecucion('e1', 'Analiza'), deps)
    expect(e.estado).toBe('fallida')
    expect(e.error).toContain('La API de Claude falló')
  })
})
