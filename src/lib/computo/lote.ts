// Validación y normalización de los lotes de telemetría que envían los
// instrumentadores desplegados en los proyectos de cliente. Módulo PURO: sin
// BD y sin node:crypto, para poder probar el parser con un objeto en mano.
//
// La validación es dura porque este endpoint es público y lo que escribe
// termina en una factura. Un lote con un `cpuMs` absurdo no es un dato raro
// que se corrige después: es un cobro de más a una empresa, y esos se
// descubren cuando el cliente reclama.

/** Una hora de consumo dentro de un lote, ya validada. */
export interface MuestraHora {
  /** Inicio de la hora en UTC, en epoch ms. */
  hora: number
  cpuMs: number
  gbMs: number
  invocaciones: number
  transferBytes: number
  originTransferBytes: number
  edgeRequests: number
}

export interface LoteValido {
  batchId: string
  muestras: MuestraHora[]
}

export type ResultadoLote =
  | { ok: true; lote: LoteValido }
  | { ok: false; motivo: MotivoRechazo }

export type MotivoRechazo =
  | 'json_invalido'
  | 'batch_id_invalido'
  | 'muestras_vacias'
  | 'demasiadas_muestras'
  | 'hora_invalida'
  | 'hora_futura'
  | 'hora_antigua'
  | 'valor_fuera_de_rango'

const HORA_MS = 3_600_000

/** Tope de muestras por lote. Un instrumentador sano manda 1 o 2. */
export const MAX_MUESTRAS = 240

/**
 * Cotas de cordura por hora y por proyecto.
 *
 * Una hora de reloj no puede contener más de 3.6e6 ms de CPU por proceso, pero
 * Fluid corre varios procesos en paralelo, así que el techo real es mayor. El
 * límite está en 1000 horas-CPU por hora de reloj: absurdo para un sitio de
 * cliente y aun así muy por encima de cualquier pico legítimo. Lo que se
 * quiere atajar no es el pico, es el valor corrupto o inyectado.
 */
export const TOPES: Record<keyof Omit<MuestraHora, 'hora'>, number> = {
  cpuMs: 1_000 * HORA_MS,
  gbMs: 10_000 * HORA_MS,
  invocaciones: 50_000_000,
  transferBytes: 5_000 * 1_073_741_824,
  originTransferBytes: 5_000 * 1_073_741_824,
  edgeRequests: 200_000_000,
}

/** Margen hacia el futuro que se tolera por desfase de relojes. */
const FUTURO_MAX_MS = 2 * HORA_MS
/** Antigüedad máxima aceptada: más allá, el periodo ya pudo cerrarse. */
const ANTIGUEDAD_MAX_MS = 35 * 24 * HORA_MS

const UUID_RE = /^[a-zA-Z0-9_-]{8,64}$/

function numero(v: unknown, tope: number): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0 || n > tope) return null
  return n
}

/**
 * Valida un lote ya parseado a objeto.
 *
 * `ahora` se inyecta en vez de leer Date.now() dentro para que los tests de
 * las ventanas temporales no dependan del reloj de quien los corre.
 */
export function validarLote(body: unknown, ahora: number): ResultadoLote {
  if (!body || typeof body !== 'object') return { ok: false, motivo: 'json_invalido' }
  const b = body as Record<string, unknown>

  const batchId = typeof b.batchId === 'string' ? b.batchId : ''
  if (!UUID_RE.test(batchId)) return { ok: false, motivo: 'batch_id_invalido' }

  const crudas = b.muestras
  if (!Array.isArray(crudas) || crudas.length === 0) return { ok: false, motivo: 'muestras_vacias' }
  if (crudas.length > MAX_MUESTRAS) return { ok: false, motivo: 'demasiadas_muestras' }

  const muestras: MuestraHora[] = []
  for (const cruda of crudas) {
    if (!cruda || typeof cruda !== 'object') return { ok: false, motivo: 'json_invalido' }
    const m = cruda as Record<string, unknown>

    const horaMs = typeof m.hora === 'number' ? m.hora : Date.parse(String(m.hora ?? ''))
    if (!Number.isFinite(horaMs)) return { ok: false, motivo: 'hora_invalida' }
    if (horaMs > ahora + FUTURO_MAX_MS) return { ok: false, motivo: 'hora_futura' }
    if (horaMs < ahora - ANTIGUEDAD_MAX_MS) return { ok: false, motivo: 'hora_antigua' }

    // Se trunca a la hora aquí y no en el instrumentador: el UPSERT de la BD
    // acumula sobre (project_id, hour), así que dos lotes de la misma hora
    // deben producir exactamente la misma clave aunque los envíe otra versión
    // del instrumentador con otro criterio de redondeo.
    const hora = Math.floor(horaMs / HORA_MS) * HORA_MS

    const valores: Record<string, number> = {}
    for (const campo of Object.keys(TOPES) as (keyof typeof TOPES)[]) {
      const n = numero(m[campo], TOPES[campo])
      if (n === null) return { ok: false, motivo: 'valor_fuera_de_rango' }
      valores[campo] = n
    }

    muestras.push({
      hora,
      cpuMs: valores.cpuMs,
      gbMs: valores.gbMs,
      invocaciones: Math.round(valores.invocaciones),
      transferBytes: valores.transferBytes,
      originTransferBytes: valores.originTransferBytes,
      edgeRequests: Math.round(valores.edgeRequests),
    })
  }

  return { ok: true, lote: { batchId, muestras: fusionarPorHora(muestras) } }
}

/**
 * Colapsa muestras de la misma hora sumándolas.
 *
 * Un lote puede traer dos entradas de la misma hora si el instrumentador hizo
 * flush dos veces dentro de ella. Sin fusionarlas, el UPSERT las aplicaría una
 * tras otra y el resultado sería correcto, pero el conteo de filas escritas
 * mentiría y la comprobación de idempotencia sería más difícil de razonar.
 */
export function fusionarPorHora(muestras: MuestraHora[]): MuestraHora[] {
  const porHora = new Map<number, MuestraHora>()
  for (const m of muestras) {
    const previa = porHora.get(m.hora)
    if (!previa) {
      porHora.set(m.hora, { ...m })
      continue
    }
    previa.cpuMs += m.cpuMs
    previa.gbMs += m.gbMs
    previa.invocaciones += m.invocaciones
    previa.transferBytes += m.transferBytes
    previa.originTransferBytes += m.originTransferBytes
    previa.edgeRequests += m.edgeRequests
  }
  return [...porHora.values()].sort((a, b) => a.hora - b.hora)
}
