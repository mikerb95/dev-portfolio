// Escrituras del asistente del panel. Ninguna se ejecuta sola: el motor
// (motor-api.ts) se detiene en cada una, enseña `vista` y espera el "Aprobar"
// de Mike. No están en el catálogo de lectura (herramientas/index.ts), así que
// la terminal no las ve: allí no hay pantalla donde aprobar.
//
// Importa `src/db`: solo servidor.

import type { z } from 'zod'
import type { PropuestaPreparada, ResultadoHerramienta } from '../../analista/bucle'
import { fmtMoney } from '../../money'
import {
  crearCuentaCobroAprobada,
  DESCRIPCION_CREAR_CUENTA,
  esquemaCuentaCobro,
  NOMBRE_CREAR_CUENTA,
  prepararCuentaCobro,
} from './cuenta-cobro'

export type Escritura = {
  nombre: string
  descripcion: string
  esquema: z.ZodObject<z.ZodRawShape>
  /** Revisa y calcula sin escribir: lo que Mike ve antes de decidir. */
  preparar: (entrada: unknown) => Promise<PropuestaPreparada>
  /** Escribe. Solo después de la aprobación. Nunca lanza. */
  ejecutar: (entrada: unknown) => Promise<ResultadoHerramienta>
}

const cuentaCobro: Escritura = {
  nombre: NOMBRE_CREAR_CUENTA,
  descripcion: DESCRIPCION_CREAR_CUENTA,
  esquema: esquemaCuentaCobro as unknown as z.ZodObject<z.ZodRawShape>,
  async preparar(entrada) {
    const p = await prepararCuentaCobro(entrada)
    if (!p.ok) return p
    return {
      ok: true,
      origen: `Cuenta de cobro para ${p.vista.cliente.nombre} por ${fmtMoney(p.vista.subtotal.valor, 'COP', 0)}`,
      motivo: p.vista.concepto,
      vista: p.vista,
    }
  },
  async ejecutar(entrada) {
    try {
      const r = await crearCuentaCobroAprobada(entrada)
      return r.ok ? { ok: true, datos: r.datos } : { ok: false, error: r.error }
    } catch (err) {
      return { ok: false, error: `No se pudo crear la cuenta: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

export const ESCRITURAS: Escritura[] = [cuentaCobro]

export const escritura = (nombre: string) => ESCRITURAS.find((e) => e.nombre === nombre)
