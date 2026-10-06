import { describe, expect, it } from 'vitest'
import { avanzar, decidir, nuevaEjecucion, type Dependencias, type EventoBucle } from '../src/lib/analista/bucle'
import { buscarEnMenu, mezclar, normalizar, puntuar, terminos } from '../src/lib/asistente/buscar'
import { PREFIJO_CAMBIOS, contarTurnos, turnosDe } from '../src/lib/asistente/turnos'

// textoRechazo vive en motor-api.ts, que importa la base y el SDK: aquí se
// reproduce el contrato que importa (el prefijo y la indicación entre comillas).
const rechazo = (c: string | null) => (c ? `${PREFIJO_CAMBIOS}"${c}". Ajusta.` : 'Mike no aprobó la propuesta.')

const respuesta = (stop_reason: string, content: any[]) => ({ content, stop_reason, usage: { input_tokens: 100, output_tokens: 10 } }) as any
const uso = (id: string, name: string, input: Record<string, unknown> = {}) => ({ type: 'tool_use', id, name, input })
const texto = (t: string) => ({ type: 'text', text: t })

function montar(guion: any[]) {
  const eventos: EventoBucle[] = []
  const ejecutadas: string[] = []
  let i = 0
  const deps: Dependencias = {
    herramientaBloqueo: 'crear_cuenta_cobro',
    herramientasAprobacion: ['crear_cuenta_cobro'],
    llamarModelo: async () => {
      const r = guion[i++]
      if (!r) throw new Error('el guion se acabó')
      return r
    },
    validar: (nombre, entrada) => (nombre === 'crear_cuenta_cobro' && !(entrada as any)?.clienteId ? 'clienteId: requerido' : null),
    ejecutar: async (nombre) => {
      ejecutadas.push(nombre)
      return nombre === 'crear_cuenta_cobro' ? { ok: true, datos: { creada: true, numero: 'CC-2026-010' } } : { ok: true, datos: { nombre } }
    },
    prepararPropuesta: async (_n, entrada) =>
      (entrada as any).clienteId === 99
        ? { ok: false, error: 'No existe ningún cliente con id 99.' }
        : { ok: true, origen: 'Cuenta de cobro para Norte SAS', motivo: 'Hito 2', vista: { tipo: 'cuenta_cobro', total: '$1.200.000' } },
    rechazo,
    guardar: async () => {},
    emitir: (e) => void eventos.push(e),
    presupuestoRestante: async () => 3,
  }
  return { deps, eventos, ejecutadas }
}

describe('bucle con escrituras del asistente', () => {
  it('se detiene antes de crear, con la vista calculada por el servidor', async () => {
    const { deps, eventos, ejecutadas } = montar([
      respuesta('tool_use', [uso('t1', 'clientes'), uso('t2', 'crear_cuenta_cobro', { clienteId: 1 })]),
    ])
    const e = await avanzar(nuevaEjecucion('c1', 'Hazle la cuenta a Norte por el hito 2'), deps)
    expect(e.estado).toBe('esperando_aprobacion')
    expect(ejecutadas).toEqual(['clientes'])
    expect(e.propuesta).toMatchObject({ herramienta: 'crear_cuenta_cobro', vista: { total: '$1.200.000' } })
    expect(eventos).toContainEqual(expect.objectContaining({ tipo: 'aprobacion', herramienta: 'crear_cuenta_cobro', vista: { tipo: 'cuenta_cobro', total: '$1.200.000' } }))
  })

  it('una propuesta que el servidor no puede preparar vuelve al modelo como error, sin pausar', async () => {
    const { deps, ejecutadas } = montar([
      respuesta('tool_use', [uso('t1', 'crear_cuenta_cobro', { clienteId: 99 })]),
      respuesta('end_turn', [texto('No encontré ese cliente.')]),
    ])
    const e = await avanzar(nuevaEjecucion('c1', 'cuenta'), deps)
    expect(e.estado).toBe('terminada')
    expect(ejecutadas).toEqual([])
    const resultado = (e.mensajes[2]!.content as any[])[0]
    expect(resultado).toMatchObject({ is_error: true, content: 'No existe ningún cliente con id 99.' })
  })

  it('al aprobar se ejecuta la escritura y el modelo recibe el resultado', async () => {
    const { deps, ejecutadas } = montar([
      respuesta('tool_use', [uso('t1', 'crear_cuenta_cobro', { clienteId: 1 })]),
      respuesta('end_turn', [texto('Listo: CC-2026-010.')]),
    ])
    const e = await avanzar(nuevaEjecucion('c1', 'cuenta'), deps)
    const final = await decidir(e, true, deps)
    expect(final.estado).toBe('terminada')
    expect(ejecutadas).toEqual(['crear_cuenta_cobro'])
    expect((final.mensajes[2]!.content as any[])[0].content).toContain('CC-2026-010')
  })

  it('pedir cambios rechaza con la indicación, y la pantalla la recupera como un turno', async () => {
    const { deps, ejecutadas } = montar([
      respuesta('tool_use', [texto('Te la dejo lista.'), uso('t1', 'crear_cuenta_cobro', { clienteId: 1 })]),
      respuesta('end_turn', [texto('Ajustada.')]),
    ])
    const e = await avanzar(nuevaEjecucion('c1', 'Cuenta para Norte'), deps)
    const final = await decidir(e, false, deps, 'que venza el 30')
    expect(ejecutadas).toEqual([])
    expect(turnosDe(final.mensajes as never)).toEqual([
      { pregunta: 'Cuenta para Norte', respuesta: 'Te la dejo lista.', pasos: ['crear_cuenta_cobro'] },
      { pregunta: 'que venza el 30', respuesta: 'Ajustada.', pasos: [] },
    ])
  })
})

describe('turnos', () => {
  it('cada pregunta abre un turno y junta textos y herramientas hasta la siguiente', () => {
    const mensajes = [
      { role: 'user', content: '¿Quién me debe?' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '…' }, uso('a', 'clientes'), uso('b', 'clientes')] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: '{}' }] },
      { role: 'assistant', content: [texto('Norte te debe $1.700.000 COP.')] },
      { role: 'user', content: '¿Y quién me pagó?' },
      { role: 'assistant', content: [uso('c', 'pagos_recibidos')] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c', content: '{}' }] },
      { role: 'assistant', content: [texto('Nadie este mes.')] },
    ] as never
    expect(turnosDe(mensajes)).toEqual([
      { pregunta: '¿Quién me debe?', respuesta: 'Norte te debe $1.700.000 COP.', pasos: ['clientes'] },
      { pregunta: '¿Y quién me pagó?', respuesta: 'Nadie este mes.', pasos: ['pagos_recibidos'] },
    ])
    expect(contarTurnos(mensajes)).toBe(2)
  })

  it('un rechazo sin indicación no abre turno', () => {
    const mensajes = [
      { role: 'user', content: 'cuenta' },
      { role: 'assistant', content: [uso('a', 'crear_cuenta_cobro')] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: rechazo(null), is_error: true }] },
      { role: 'assistant', content: [texto('¿Qué le cambio?')] },
    ] as never
    expect(turnosDe(mensajes)).toHaveLength(1)
  })
})

describe('búsqueda del panel', () => {
  it('normaliza tildes y quita palabras vacías', () => {
    expect(normalizar('¿Dónde  está la Barbería?')).toBe('donde esta la barberia')
    expect(terminos('¿Dónde están los dominios que me vencen?')).toEqual(['dominios', 'vencen'])
  })

  it('pesa más la etiqueta que las palabras clave y exige la mitad de los términos', () => {
    expect(puntuar(['dominios'], 'Dominios')).toBeGreaterThan(puntuar(['dominios'], 'Costos', 'dominios'))
    expect(puntuar(['dominios', 'pizza', 'nevera'], 'Dominios')).toBe(0)
  })

  it('las preguntas en lenguaje normal llevan a la página correcta', () => {
    expect(buscarEnMenu('quién me debe')[0]!.href).toBe('/admin/clients')
    expect(buscarEnMenu('qué dominios vencen')[0]!.href).toBe('/admin/domains')
    expect(buscarEnMenu('cuentas de cobro')[0]!.href).toBe('/admin/cuentas-cobro')
    expect(buscarEnMenu('respaldo')[0]!.href).toBe('/admin/backup')
    expect(buscarEnMenu('el')).toEqual([])
  })

  it('mezclar no repite un mismo enlace con el mismo título', () => {
    const r = { tipo: 'pagina' as const, titulo: 'Dominios', detalle: null, href: '/admin/domains', puntaje: 3 }
    expect(mezclar([[r], [{ ...r, puntaje: 5 }]])).toHaveLength(1)
  })
})
