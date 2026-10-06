// Escritura del asistente: del mensaje de un cliente a una propuesta de Plano
// en borrador (RF-211, fase 3 del plan).
//
// El plan original guardaba la cotización como briefing con su propio
// subagente cotizador. Plano (6 oct 2026) ya hace ese trabajo mejor: lee la
// conversación con la IA, elige componentes de la tabla con citas verificadas
// y calcula con el mismo motor que /paginas-web y el asesor. Decisión de Mike
// del 6 oct 2026: el asistente no cotiza por su cuenta, deja la propuesta en
// Plano y Mike la termina allí. Un solo lugar para cotizar.
//
// Dos tiempos, como las demás escrituras, con un matiz: la lectura con IA se
// hace al APROBAR, no al preparar. Preparar es gratis y Mike ve exactamente
// qué texto se le va a pasar a Plano; si no aprueba, no se gastó nada.
//
// Si la IA de Plano falla, la propuesta queda creada igual con la conversación
// guardada (fail-open): Mike la abre y le da "Leer el chat" desde el
// constructor. Lo que vuelve al modelo del asistente es el enlace, el rango de
// precio ya formateado por el motor y las preguntas abiertas; nunca el
// teléfono ni el correo que Plano haya sacado de la conversación.
//
// Importa `src/db`: solo servidor.

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients } from '../../../db/schema'
import { cargarReglas, crearPropuesta, guardarConfig, guardarConversacion, hoyCO, sumarGastoIa } from '../../plano/db'
import { aplicarSalidaChat, ESQUEMA_CHAT, promptChat, type SalidaChat } from '../../plano/ia/chat'
import { IaNoDisponible, pedirJson } from '../../plano/ia/motor'
import { armarPropuesta, configVacia, PropuestaVacia } from '../../plano/propuesta'
import { dinero, textoSeguro } from '../herramientas/tipos'
import { TOPE_ASISTENTE } from '../presupuesto'
import type { Hecho, VistaCambio } from './cambio'

export const NOMBRE_CREAR_PROPUESTA = 'crear_propuesta'

/** Lo mismo que exige el "Leer el chat" del constructor de Plano. */
const MIN_CONVERSACION = 40
const MAX_CONVERSACION = 40_000
/** Lo que se ve de la conversación en la tarjeta: lo suficiente para reconocerla. */
const MAX_EXTRACTO = 600

export const esquemaPropuesta = z.object({
  conversacion: z
    .string()
    .trim()
    .min(MIN_CONVERSACION)
    .max(MAX_CONVERSACION)
    .describe('El mensaje o la conversación del cliente, COPIADO LITERAL como Mike lo pegó: sin resumir, sin corregir, sin traducir'),
  titulo: z.string().trim().min(1).max(160).optional().describe('Título corto del proyecto, si es claro (por ejemplo "Tienda en línea para Norte SAS")'),
  clienteId: z.number().int().positive().optional().describe('Id del cliente, solo si ya existe en el panel (herramienta clientes)'),
})

export const DESCRIPCION_CREAR_PROPUESTA =
  'Crea una propuesta en BORRADOR en Plano (el cotizador del panel) a partir del mensaje de un cliente que pide precio, y la IA de Plano lo lee para elegir los componentes. No se ejecuta sola: Mike ve el texto que se va a leer y decide. Tú no calculas precios ni eliges componentes: lo hace Plano. Úsala cuando Mike pegue lo que le escribió un cliente y pida cotizarlo.'

type Preparada =
  | { ok: true; entrada: z.infer<typeof esquemaPropuesta>; cliente: { id: number; nombre: string; empresa: string | null } | null; vista: VistaCambio }
  | { ok: false; error: string }

export async function prepararPropuesta(entrada: unknown): Promise<Preparada> {
  const parsed = esquemaPropuesta.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const e = parsed.data

  let cliente: { id: number; nombre: string; empresa: string | null } | null = null
  if (e.clienteId) {
    const [c] = await db.select({ id: clients.id, nombre: clients.name, empresa: clients.company }).from(clients).where(eq(clients.id, e.clienteId)).limit(1)
    if (!c) return { ok: false, error: `No existe ningún cliente con id ${e.clienteId}. Si es un cliente nuevo, no pases clienteId.` }
    cliente = c
  }

  // En la tarjeta, sin datos personales: es lo que se guarda en el historial
  // de la conversación del asistente. El texto completo sí va a Plano.
  const extracto = textoSeguro(e.conversacion, MAX_EXTRACTO) ?? ''

  return {
    ok: true,
    entrada: e,
    cliente,
    vista: {
      tipo: 'cambio',
      rotulo: 'Propuesta nueva en Plano · borrador',
      titulo: e.titulo ?? 'Propuesta sin título',
      contexto: cliente ? (cliente.empresa || cliente.nombre) : 'Cliente nuevo (no está en el panel)',
      cambios: [
        { campo: 'Lo que lee la IA de Plano', antes: null, despues: extracto },
        { campo: 'Largo del texto', antes: null, despues: `${e.conversacion.length.toLocaleString('es-CO')} caracteres` },
      ],
      avisos: ['Al aprobar, la IA de Plano lee la conversación para elegir los componentes. Cuesta unos centavos y se suma al tope diario del asistente.'],
      boton: 'Aprobar y crear',
      nota: 'Queda en borrador en Plano. Revisarla y enviarla sigue siendo tuyo.',
    },
  }
}

export type ResultadoPropuesta = Hecho & {
  creada: false
  id: number
  iaLeyo: boolean
  motivoSinIa: string | null
  componentes: number
  rango: { desde: string; hasta: string } | null
  preguntasAbiertas: string[]
}

export async function crearPropuestaAprobada(entrada: unknown): Promise<{ ok: true; datos: ResultadoPropuesta } | { ok: false; error: string }> {
  const p = await prepararPropuesta(entrada)
  if (!p.ok) return p
  const hoy = hoyCO()

  const inicial = configVacia(hoy)
  if (p.entrada.titulo) inicial.titulo = p.entrada.titulo
  if (p.cliente) {
    inicial.cliente.nombre = p.cliente.nombre
    inicial.cliente.empresa = p.cliente.empresa ?? ''
    if (p.cliente.empresa) inicial.cliente.tipo = 'empresa'
  }
  const prop = await crearPropuesta(inicial, p.cliente?.id ?? null)
  await guardarConversacion(prop.id, p.entrada.conversacion)

  const base = { hecho: true as const, creada: false as const, id: prop.id, enlace: `/admin/plano/${prop.id}` }

  let resultadoIa
  try {
    const { datos, costo } = await pedirJson<SalidaChat>({
      system: promptChat(),
      usuario: `<conversacion>\n${p.entrada.conversacion}\n</conversacion>`,
      esquema: ESQUEMA_CHAT,
    })
    await sumarGastoIa(prop.id, costo)
    // La lectura la pidió el asistente: cuenta para su tope, no solo para la propuesta.
    await TOPE_ASISTENTE.sumarGasto(costo).catch((err) => console.error('[asistente] no se pudo sumar el gasto de Plano', err))
    resultadoIa = aplicarSalidaChat(datos, p.entrada.conversacion, inicial, hoy)
    await guardarConfig(prop.id, resultadoIa.config)
  } catch (err) {
    const motivo = err instanceof IaNoDisponible ? err.message : 'La lectura con IA falló.'
    if (!(err instanceof IaNoDisponible)) console.error('[asistente] crear_propuesta: falló la IA de Plano', err)
    return {
      ok: true,
      datos: {
        ...base,
        resumen: 'Propuesta creada en Plano, sin leer',
        iaLeyo: false,
        motivoSinIa: `${motivo} La conversación quedó guardada: ábrela y usa "Leer el chat" en el constructor.`,
        componentes: 0,
        rango: null,
        preguntasAbiertas: [],
      },
    }
  }

  let rango: ResultadoPropuesta['rango'] = null
  try {
    const s = armarPropuesta(resultadoIa.config, await cargarReglas(), hoy)
    rango = { desde: dinero(s.rango[0], s.moneda).texto, hasta: dinero(s.rango[1], s.moneda).texto }
  } catch (err) {
    if (!(err instanceof PropuestaVacia)) console.error('[asistente] crear_propuesta: no se pudo calcular el rango', err)
  }

  return {
    ok: true,
    datos: {
      ...base,
      resumen: `Propuesta "${resultadoIa.config.titulo || 'sin título'}" creada en Plano`,
      iaLeyo: true,
      motivoSinIa: null,
      componentes: resultadoIa.config.lineas.length,
      rango,
      preguntasAbiertas: resultadoIa.preguntasAbiertas.map((q) => textoSeguro(q, 240) ?? '').filter(Boolean),
    },
  }
}
