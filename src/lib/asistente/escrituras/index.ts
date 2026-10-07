// Escrituras del asistente del panel. Ninguna se ejecuta sola: el motor
// (motor-api.ts) se detiene en cada una, enseña `vista` y espera el "Aprobar"
// de Mike. No están en el catálogo de lectura (herramientas/index.ts), así que
// la terminal no las ve: allí no hay pantalla donde aprobar.
//
// Todas siguen la misma forma: `preparar` lee la base y arma la tarjeta sin
// escribir; `ejecutar` vuelve a preparar (entre la propuesta y el clic pudo
// cambiar la base) y solo entonces escribe.
//
// Importa `src/db`: solo servidor.

import type { z } from 'zod'
import type { PropuestaPreparada, ResultadoHerramienta } from '../../analista/bucle'
import { fmtMoney } from '../../money'
import type { VistaCambio } from './cambio'
import {
  crearCuentaCobroAprobada,
  DESCRIPCION_CREAR_CUENTA,
  esquemaCuentaCobro,
  NOMBRE_CREAR_CUENTA,
  prepararCuentaCobro,
} from './cuenta-cobro'
import { actualizarHitoAprobado, DESCRIPCION_ACTUALIZAR_HITO, esquemaHito, NOMBRE_ACTUALIZAR_HITO, prepararHito } from './hito'
import { DESCRIPCION_MARCAR_LEIDO, esquemaMensaje, marcarLeidosAprobado, NOMBRE_MARCAR_LEIDO, prepararMensajes } from './mensaje'
import {
  actualizarProyectoAprobado,
  DESCRIPCION_ACTUALIZAR_PROYECTO,
  esquemaProyecto,
  NOMBRE_ACTUALIZAR_PROYECTO,
  prepararProyecto,
} from './proyecto'
import { crearPropuestaAprobada, DESCRIPCION_CREAR_PROPUESTA, esquemaPropuesta, NOMBRE_CREAR_PROPUESTA, prepararPropuesta } from './propuesta'
import {
  DESCRIPCION_REGISTRAR_SEGUIMIENTO,
  esquemaSeguimiento,
  NOMBRE_REGISTRAR_SEGUIMIENTO,
  prepararSeguimiento,
  registrarSeguimientoAprobado,
} from './seguimiento'

export type Escritura = {
  nombre: string
  descripcion: string
  esquema: z.ZodObject<z.ZodRawShape>
  /** Revisa y calcula sin escribir: lo que Mike ve antes de decidir. */
  preparar: (entrada: unknown) => Promise<PropuestaPreparada>
  /** Escribe. Solo después de la aprobación. Nunca lanza. */
  ejecutar: (entrada: unknown) => Promise<ResultadoHerramienta>
}

const fallo = (que: string, err: unknown): ResultadoHerramienta => ({
  ok: false,
  error: `No se pudo ${que}: ${err instanceof Error ? err.message : String(err)}`,
})

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
      return fallo('crear la cuenta', err)
    }
  },
}

/**
 * Las escrituras de la fase 5 comparten tarjeta (antes y después), así que
 * también comparten cómo se convierten en propuesta: el `origen` es la línea
 * que queda en el historial de la conversación y en el sello de la tarjeta.
 */
function deCambio(
  nombre: string,
  descripcion: string,
  esquema: z.ZodObject<z.ZodRawShape>,
  que: string,
  preparar: (entrada: unknown) => Promise<{ ok: true; vista: VistaCambio } | { ok: false; error: string }>,
  ejecutar: (entrada: unknown) => Promise<{ ok: true; datos: unknown } | { ok: false; error: string }>
): Escritura {
  return {
    nombre,
    descripcion,
    esquema,
    async preparar(entrada) {
      const p = await preparar(entrada)
      if (!p.ok) return p
      return {
        ok: true,
        origen: `${p.vista.rotulo}: ${p.vista.titulo}`,
        motivo: p.vista.cambios.map((c) => `${c.campo}: ${c.despues ?? 'vacío'}`).join('; '),
        vista: p.vista,
      }
    },
    async ejecutar(entrada) {
      try {
        const r = await ejecutar(entrada)
        return r.ok ? { ok: true, datos: r.datos } : { ok: false, error: r.error }
      } catch (err) {
        return fallo(que, err)
      }
    },
  }
}

const esquema = (e: unknown) => e as z.ZodObject<z.ZodRawShape>

export const ESCRITURAS: Escritura[] = [
  cuentaCobro,
  deCambio(NOMBRE_ACTUALIZAR_PROYECTO, DESCRIPCION_ACTUALIZAR_PROYECTO, esquema(esquemaProyecto), 'actualizar el proyecto', (e) => prepararProyecto(e), actualizarProyectoAprobado),
  deCambio(NOMBRE_ACTUALIZAR_HITO, DESCRIPCION_ACTUALIZAR_HITO, esquema(esquemaHito), 'actualizar el hito', prepararHito, actualizarHitoAprobado),
  deCambio(
    NOMBRE_REGISTRAR_SEGUIMIENTO,
    DESCRIPCION_REGISTRAR_SEGUIMIENTO,
    esquema(esquemaSeguimiento),
    'anotar el seguimiento',
    prepararSeguimiento,
    registrarSeguimientoAprobado
  ),
  deCambio(NOMBRE_MARCAR_LEIDO, DESCRIPCION_MARCAR_LEIDO, esquema(esquemaMensaje), 'marcar los mensajes', prepararMensajes, marcarLeidosAprobado),
  deCambio(NOMBRE_CREAR_PROPUESTA, DESCRIPCION_CREAR_PROPUESTA, esquema(esquemaPropuesta), 'crear la propuesta', prepararPropuesta, crearPropuestaAprobada),
]

export const escritura = (nombre: string) => ESCRITURAS.find((e) => e.nombre === nombre)
