// Persistencia del asesor en vivo (lib/asesor/vivo.ts). Solo servidor.

import { createHash, randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { db } from '../../db'
import { asesorConversaciones, asesorMensajes } from '../../db/schema'
import type { Locale } from '../../i18n'
import type { Pagina } from './prompt'
import { MAX_MENSAJES, RETENCION_MS, TOKEN_RE, type Motivo } from './vivo'

export type Autor = 'visitante' | 'asesor' | 'mike'
export type Conversacion = typeof asesorConversaciones.$inferSelect
export type MensajeVivo = { id: number; autor: Autor; texto: string; creado: Date }

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Conversación de un token de visitante, si existe y no venció. */
export async function porToken(token: string, ahora = new Date()): Promise<Conversacion | null> {
  if (!TOKEN_RE.test(token)) return null
  const [c] = await db.select().from(asesorConversaciones).where(eq(asesorConversaciones.tokenHash, hashToken(token))).limit(1)
  if (!c || ahora.getTime() - c.creada.getTime() > RETENCION_MS) return null
  return c
}

export async function porId(id: number): Promise<Conversacion | null> {
  const [c] = await db.select().from(asesorConversaciones).where(eq(asesorConversaciones.id, id)).limit(1)
  return c ?? null
}

/**
 * Empieza a guardar una conversación con todo lo dicho hasta ahora. Devuelve
 * el token para el navegador (lo único que lo deja leer lo que escriba Mike) y
 * el id para el enlace del panel.
 */
export async function abrirConversacion(c: {
  locale: Locale
  pagina?: Pagina
  motivo: Motivo
  mensajes: { autor: Autor; texto: string }[]
  /** La última respuesta del asesor lleva la pregunta fija por el WhatsApp. */
  pidioNumero?: boolean
  ahora?: Date
}): Promise<{ id: number; token: string }> {
  const ahora = c.ahora ?? new Date()
  const token = randomBytes(32).toString('base64url')
  const [fila] = await db
    .insert(asesorConversaciones)
    .values({
      tokenHash: hashToken(token),
      creada: ahora,
      actualizada: ahora,
      locale: c.locale,
      pagina: c.pagina ?? null,
      motivo: c.motivo,
      pidioNumero: c.pidioNumero ?? false,
      vistoVisitante: ahora,
    })
    .returning({ id: asesorConversaciones.id })
  const mensajes = c.mensajes.slice(-MAX_MENSAJES)
  if (mensajes.length) {
    await db.insert(asesorMensajes).values(mensajes.map((m) => ({ conversacionId: fila.id, autor: m.autor, texto: m.texto, creado: ahora })))
  }
  return { id: fila.id, token }
}

/**
 * Agrega mensajes al final. false si la conversación llegó al tope: el resto
 * del chat sigue funcionando, solo que ya no se guarda.
 */
export async function anexar(conversacionId: number, mensajes: { autor: Autor; texto: string }[], ahora = new Date()): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(asesorMensajes).where(eq(asesorMensajes.conversacionId, conversacionId))
  if (n + mensajes.length > MAX_MENSAJES) return false
  await db.insert(asesorMensajes).values(mensajes.map((m) => ({ conversacionId, autor: m.autor, texto: m.texto, creado: ahora })))
  await db.update(asesorConversaciones).set({ actualizada: ahora }).where(eq(asesorConversaciones.id, conversacionId))
  return true
}

/**
 * Guarda el número que dejó la persona. Solo el primero: la condición va en el
 * mismo UPDATE, así dos mensajes casi simultáneos no avisan dos veces. true si
 * esta llamada fue la que lo guardó.
 */
export async function guardarTelefono(conversacionId: number, e164: string): Promise<boolean> {
  const filas = await db
    .update(asesorConversaciones)
    .set({ telefono: e164 })
    .where(and(eq(asesorConversaciones.id, conversacionId), isNull(asesorConversaciones.telefono)))
    .returning({ id: asesorConversaciones.id })
  return filas.length > 0
}

/** Mike entra: desde aquí el asesor se calla en esa conversación. */
export async function tomar(conversacionId: number): Promise<void> {
  await db.update(asesorConversaciones).set({ estado: 'mike' }).where(eq(asesorConversaciones.id, conversacionId))
}

/** Mensajes con id mayor que `desde`, opcionalmente solo de ciertos autores. */
export async function mensajesDesde(conversacionId: number, desde: number, autores?: Autor[]): Promise<MensajeVivo[]> {
  const filtros = [eq(asesorMensajes.conversacionId, conversacionId), gt(asesorMensajes.id, desde)]
  if (autores) filtros.push(inArray(asesorMensajes.autor, autores))
  return db
    .select({ id: asesorMensajes.id, autor: asesorMensajes.autor, texto: asesorMensajes.texto, creado: asesorMensajes.creado })
    .from(asesorMensajes)
    .where(and(...filtros))
    .orderBy(asc(asesorMensajes.id))
    .limit(MAX_MENSAJES)
}

/**
 * Anota que el visitante sigue ahí. Solo escribe si la marca tiene más de 20 s:
 * el chat sondea cada pocos segundos y no hace falta una escritura por sondeo.
 */
export async function marcarVisto(c: Conversacion, ahora = new Date()): Promise<void> {
  if (c.vistoVisitante && ahora.getTime() - c.vistoVisitante.getTime() < 20_000) return
  await db.update(asesorConversaciones).set({ vistoVisitante: ahora }).where(eq(asesorConversaciones.id, c.id))
}

/** Conversaciones vigentes, la más reciente primero, con su último mensaje. */
export async function listarVigentes(ahora = new Date()): Promise<(Conversacion & { ultimo: string | null; total: number })[]> {
  const desde = new Date(ahora.getTime() - RETENCION_MS)
  const filas = await db
    .select()
    .from(asesorConversaciones)
    .where(gt(asesorConversaciones.creada, desde))
    .orderBy(desc(asesorConversaciones.actualizada))
    .limit(50)
  if (!filas.length) return []
  const mensajes = await db
    .select({ conversacionId: asesorMensajes.conversacionId, autor: asesorMensajes.autor, texto: asesorMensajes.texto })
    .from(asesorMensajes)
    .where(inArray(asesorMensajes.conversacionId, filas.map((f) => f.id)))
    .orderBy(asc(asesorMensajes.id))
  return filas.map((f) => {
    const propios = mensajes.filter((m) => m.conversacionId === f.id)
    const ultimoVisitante = propios.filter((m) => m.autor === 'visitante').at(-1)
    return { ...f, ultimo: ultimoVisitante?.texto ?? null, total: propios.length }
  })
}

/** Borra lo que pasó de las 48 h. Corre al abrir cada conversación nueva. */
export async function purgar(ahora = new Date()): Promise<void> {
  const limite = new Date(ahora.getTime() - RETENCION_MS)
  const viejas = await db
    .select({ id: asesorConversaciones.id })
    .from(asesorConversaciones)
    .where(lt(asesorConversaciones.creada, limite))
    .limit(100)
  if (!viejas.length) return
  const ids = viejas.map((v) => v.id)
  await db.delete(asesorMensajes).where(inArray(asesorMensajes.conversacionId, ids))
  await db.delete(asesorConversaciones).where(inArray(asesorConversaciones.id, ids))
}
