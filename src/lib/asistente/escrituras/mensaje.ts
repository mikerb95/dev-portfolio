// Escritura del asistente: marcar como leídos mensajes del formulario de
// contacto (RF-210, fase 5). Hoy es la única forma de hacerlo: /admin/messages
// los lista pero no tiene botón para marcarlos.
//
// Solo los del formulario (`messages`). Los hilos del portal no: "leído" ahí
// es por persona y se marca al abrir el hilo, y el cliente ve si se le leyó.
//
// En la tarjeta se ve quién escribió y el asunto, pero no el correo ni el
// cuerpo: la tarjeta es del panel, pero viaja también al historial de la
// conversación que se guarda en la base.
//
// Importa `src/db`: solo servidor.

import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { messages } from '../../../db/schema'
import { textoSeguro } from '../herramientas/tipos'
import type { Hecho, VistaCambio } from './cambio'

export const NOMBRE_MARCAR_LEIDO = 'marcar_mensaje_leido'

export const esquemaMensaje = z.object({
  mensajeIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(30)
    .describe('Ids de los mensajes del formulario (salen de la herramienta mensajes, en formulario)'),
})

export const DESCRIPCION_MARCAR_LEIDO =
  'Marca como leídos uno o varios mensajes del formulario de contacto. No se ejecuta sola: Mike ve cuáles y decide. No sirve para los hilos del portal. Busca antes los ids con la herramienta mensajes.'

type Preparada = { ok: true; ids: number[]; vista: VistaCambio } | { ok: false; error: string }

export async function prepararMensajes(entrada: unknown): Promise<Preparada> {
  const parsed = esquemaMensaje.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const pedidos = [...new Set(parsed.data.mensajeIds)]

  const filas = await db
    .select({ id: messages.id, nombre: messages.name, asunto: messages.subject })
    .from(messages)
    .where(and(inArray(messages.id, pedidos), eq(messages.read, false)))
  if (filas.length === 0) return { ok: false, error: 'Ninguno de esos mensajes existe o está sin leer.' }
  const faltan = pedidos.filter((id) => !filas.some((f) => f.id === id))

  return {
    ok: true,
    ids: filas.map((f) => f.id),
    vista: {
      tipo: 'cambio',
      rotulo: filas.length === 1 ? 'Mensaje' : `${filas.length} mensajes`,
      titulo: filas.length === 1 ? 'Marcar como leído' : 'Marcar como leídos',
      contexto: faltan.length ? `Ya estaban leídos o no existen: ${faltan.join(', ')}` : null,
      cambios: filas.map((f) => ({
        campo: textoSeguro(f.nombre, 80) ?? 'Sin nombre',
        antes: textoSeguro(f.asunto, 100) ?? 'Sin asunto',
        despues: 'Leído',
      })),
      avisos: [],
      boton: filas.length === 1 ? 'Aprobar y marcar' : 'Aprobar y marcar todos',
      nota: 'Quien escribió no se entera: solo cambia tu bandeja.',
    },
  }
}

export async function marcarLeidosAprobado(entrada: unknown): Promise<{ ok: true; datos: Hecho & { marcados: number } } | { ok: false; error: string }> {
  const p = await prepararMensajes(entrada)
  if (!p.ok) return p
  // El `read = false` va también en el UPDATE: entre la propuesta y el clic
  // pudo leerse desde otra pestaña, y el conteo debe decir lo que de verdad cambió.
  const r = await db
    .update(messages)
    .set({ read: true })
    .where(and(inArray(messages.id, p.ids), eq(messages.read, false)))
    .returning({ id: messages.id })
  const n = r.length
  return { ok: true, datos: { hecho: true, resumen: n === 1 ? '1 mensaje marcado como leído' : `${n} mensajes marcados como leídos`, enlace: '/admin/messages', marcados: n } }
}
