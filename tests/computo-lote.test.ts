import { describe, it, expect } from 'vitest'
import { fusionarPorHora, validarLote, MAX_MUESTRAS, TOPES, type MuestraHora } from '../src/lib/computo/lote'
import { firmarLote, verificarLote, nuevoSecretoIngest, VENTANA_MS } from '../src/lib/computo/firma'

const HORA_MS = 3_600_000
const AHORA = Date.parse('2026-09-07T12:30:00Z')

const muestra = (extra: Record<string, unknown> = {}) => ({
  hora: Date.parse('2026-09-07T11:00:00Z'),
  cpuMs: 1000,
  gbMs: 2000,
  invocaciones: 10,
  transferBytes: 4096,
  originTransferBytes: 4096,
  edgeRequests: 15,
  ...extra,
})

const lote = (extra: Record<string, unknown> = {}) => ({
  batchId: 'lote-abc12345',
  muestras: [muestra()],
  ...extra,
})

describe('validación de lotes', () => {
  it('acepta un lote bien formado', () => {
    const r = validarLote(lote(), AHORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lote.batchId).toBe('lote-abc12345')
    expect(r.lote.muestras).toHaveLength(1)
    expect(r.lote.muestras[0].cpuMs).toBe(1000)
  })

  it('trunca la hora al inicio de la hora UTC', () => {
    // El truncado vive aquí y no en el instrumentador porque el UPSERT acumula
    // sobre (project_id, hour): dos versiones del agente con otro criterio de
    // redondeo crearían dos filas para la misma hora.
    const r = validarLote(lote({ muestras: [muestra({ hora: Date.parse('2026-09-07T11:47:33.123Z') })] }), AHORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(new Date(r.lote.muestras[0].hora).toISOString()).toBe('2026-09-07T11:00:00.000Z')
  })

  it('acepta la hora como ISO además de epoch', () => {
    const r = validarLote(lote({ muestras: [muestra({ hora: '2026-09-07T11:00:00Z' })] }), AHORA)
    expect(r.ok).toBe(true)
  })

  it.each([
    ['json_invalido', null],
    ['json_invalido', 'texto'],
  ])('rechaza cuerpos que no son objeto (%s)', (motivo, body) => {
    const r = validarLote(body, AHORA)
    expect(r).toEqual({ ok: false, motivo })
  })

  it('exige un batchId con forma de identificador', () => {
    expect(validarLote(lote({ batchId: '' }), AHORA)).toEqual({ ok: false, motivo: 'batch_id_invalido' })
    expect(validarLote(lote({ batchId: 'x' }), AHORA)).toEqual({ ok: false, motivo: 'batch_id_invalido' })
    expect(validarLote(lote({ batchId: 'con espacios!' }), AHORA)).toEqual({ ok: false, motivo: 'batch_id_invalido' })
  })

  it('rechaza lotes vacíos o desmesurados', () => {
    expect(validarLote(lote({ muestras: [] }), AHORA)).toEqual({ ok: false, motivo: 'muestras_vacias' })
    const muchas = Array.from({ length: MAX_MUESTRAS + 1 }, () => muestra())
    expect(validarLote(lote({ muestras: muchas }), AHORA)).toEqual({ ok: false, motivo: 'demasiadas_muestras' })
  })

  it('rechaza horas fuera de la ventana temporal', () => {
    const futuro = muestra({ hora: AHORA + 5 * HORA_MS })
    expect(validarLote(lote({ muestras: [futuro] }), AHORA)).toEqual({ ok: false, motivo: 'hora_futura' })
    const viejo = muestra({ hora: AHORA - 60 * 24 * HORA_MS })
    expect(validarLote(lote({ muestras: [viejo] }), AHORA)).toEqual({ ok: false, motivo: 'hora_antigua' })
  })

  it('tolera un desfase de reloj pequeño hacia el futuro', () => {
    const r = validarLote(lote({ muestras: [muestra({ hora: AHORA + 60_000 })] }), AHORA)
    expect(r.ok).toBe(true)
  })

  // Lo que se defiende aquí no es un pico de tráfico, es un valor corrupto o
  // inyectado: lo que entra por esta puerta acaba en la factura de una empresa.
  it('rechaza valores negativos, no numéricos o por encima del tope', () => {
    expect(validarLote(lote({ muestras: [muestra({ cpuMs: -1 })] }), AHORA))
      .toEqual({ ok: false, motivo: 'valor_fuera_de_rango' })
    expect(validarLote(lote({ muestras: [muestra({ cpuMs: 'mucho' })] }), AHORA))
      .toEqual({ ok: false, motivo: 'valor_fuera_de_rango' })
    expect(validarLote(lote({ muestras: [muestra({ cpuMs: Number.NaN })] }), AHORA))
      .toEqual({ ok: false, motivo: 'valor_fuera_de_rango' })
    expect(validarLote(lote({ muestras: [muestra({ cpuMs: TOPES.cpuMs + 1 })] }), AHORA))
      .toEqual({ ok: false, motivo: 'valor_fuera_de_rango' })
  })

  it('exige que estén todas las dimensiones, sin asumir cero', () => {
    const incompleta = muestra()
    delete (incompleta as Record<string, unknown>).gbMs
    expect(validarLote(lote({ muestras: [incompleta] }), AHORA))
      .toEqual({ ok: false, motivo: 'valor_fuera_de_rango' })
  })
})

describe('fusión de muestras de la misma hora', () => {
  it('suma las que caen en la misma hora y las deja ordenadas', () => {
    const base: MuestraHora = {
      hora: Date.parse('2026-09-07T11:00:00Z'),
      cpuMs: 100, gbMs: 200, invocaciones: 1,
      transferBytes: 10, originTransferBytes: 20, edgeRequests: 2,
    }
    const otra: MuestraHora = { ...base, hora: Date.parse('2026-09-07T10:00:00Z') }
    const fusion = fusionarPorHora([base, { ...base }, otra])
    expect(fusion).toHaveLength(2)
    expect(fusion[0].hora).toBe(otra.hora)
    expect(fusion[1].cpuMs).toBe(200)
    expect(fusion[1].invocaciones).toBe(2)
  })

  it('el validador fusiona antes de devolver', () => {
    const r = validarLote(lote({ muestras: [muestra(), muestra()] }), AHORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lote.muestras).toHaveLength(1)
    expect(r.lote.muestras[0].cpuMs).toBe(2000)
  })
})

describe('firma de lotes', () => {
  const secreto = nuevoSecretoIngest()
  const cuerpo = JSON.stringify(lote())
  const ts = AHORA

  it('valida una firma correcta y fresca', () => {
    const firma = firmarLote(ts, cuerpo, secreto)
    expect(verificarLote(String(ts), firma, cuerpo, secreto, AHORA)).toBe('ok')
  })

  it('rechaza el lote si el cuerpo cambió por el camino', () => {
    const firma = firmarLote(ts, cuerpo, secreto)
    const alterado = cuerpo.replace('"cpuMs":1000', '"cpuMs":999000')
    expect(verificarLote(String(ts), firma, alterado, secreto, AHORA)).toBe('firma_invalida')
  })

  it('rechaza la firma de otro proyecto', () => {
    const firma = firmarLote(ts, cuerpo, nuevoSecretoIngest())
    expect(verificarLote(String(ts), firma, cuerpo, secreto, AHORA)).toBe('firma_invalida')
  })

  it('rechaza un replay fuera de la ventana, en ambos sentidos', () => {
    const firma = firmarLote(ts, cuerpo, secreto)
    expect(verificarLote(String(ts), firma, cuerpo, secreto, AHORA + VENTANA_MS + 1_000)).toBe('timestamp_fuera_de_ventana')
    expect(verificarLote(String(ts), firma, cuerpo, secreto, AHORA - VENTANA_MS - 1_000)).toBe('timestamp_fuera_de_ventana')
  })

  it('rechaza timestamp y firma ausentes o basura', () => {
    expect(verificarLote(null, 'abc', cuerpo, secreto, AHORA)).toBe('timestamp_invalido')
    expect(verificarLote('no-es-numero', 'abc', cuerpo, secreto, AHORA)).toBe('timestamp_invalido')
    expect(verificarLote(String(ts), null, cuerpo, secreto, AHORA)).toBe('firma_invalida')
    expect(verificarLote(String(ts), '', cuerpo, secreto, AHORA)).toBe('firma_invalida')
  })

  it('no revienta si la firma recibida tiene otra longitud', () => {
    // timingSafeEqual lanza con buffers de distinto tamaño; la longitud se
    // filtra antes justamente para que un atacante no provoque un 500.
    expect(verificarLote(String(ts), 'corta', cuerpo, secreto, AHORA)).toBe('firma_invalida')
  })

  it('genera secretos distintos e impredecibles', () => {
    expect(nuevoSecretoIngest()).toHaveLength(64)
    expect(nuevoSecretoIngest()).not.toBe(nuevoSecretoIngest())
  })
})
