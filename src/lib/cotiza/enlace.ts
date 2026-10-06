// Enlace del cliente de Cotiza (/acuerdo/<token>, RF-224, Fase 4).
//
// Lo que el cliente puede hacer con su enlace, y nada más:
//   · ver la propuesta congelada, sus cupos y los resúmenes de reunión;
//   · aceptar la propuesta (mientras está vigente) dejando nombre y documento;
//   · aprobar o rechazar cada adicional propuesto.
// Cada decisión deja una CONSTANCIA: el SHA-256 de lo decidido con quién y
// cuándo, recalculable por cualquiera con los datos guardados. Es la respuesta
// escrita a "yo nunca aprobé eso".
//
// El token tiene 128 bits (nuevoToken de Plano). En la base va su SHA-256 para
// buscar y una copia cifrada para que Mike lo vuelva a copiar; nunca en claro.
// Solo servidor.

import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { cotizaAdicionales, cotizaEncargos } from '../../db/schema'
import { decrypt, encrypt } from '../crypto'
import { canonico, esTokenValido, nuevoToken, sha256 } from '../plano/hash'
import { ErrorEncargo, snapshotDe, type Adicional, type Encargo } from './db'

export const hashToken = (token: string): string => sha256(`cotiza:enlace:v1:${token}`)

/** Crea (o rota) el enlace. El anterior deja de servir en el acto. */
export async function generarEnlace(e: Encargo): Promise<string> {
  if (e.estado !== 'enviado' && e.estado !== 'aceptado') {
    throw new ErrorEncargo('el enlace solo existe para una propuesta enviada o un encargo en curso', 409)
  }
  const token = nuevoToken()
  let cifrado: string | null = null
  try {
    cifrado = encrypt(token)
  } catch {
    // Sin ENCRYPTION_KEY el enlace funciona igual; lo que se pierde es poder
    // volver a copiarlo después (habría que generar otro).
    cifrado = null
  }
  await db.update(cotizaEncargos).set({ tokenHash: hashToken(token), tokenCifrado: cifrado, actualizadoEl: new Date() }).where(eq(cotizaEncargos.id, e.id))
  return token
}

/** El token para mostrárselo a Mike, si se puede descifrar. */
export function tokenDe(e: Pick<Encargo, 'tokenCifrado'>): string | null {
  if (!e.tokenCifrado) return null
  try {
    return decrypt(e.tokenCifrado)
  } catch {
    return null
  }
}

/**
 * El encargo de un token, solo si tiene algo que mostrar. La forma del token
 * se valida antes de consultar (la basura no genera lecturas) y "no existe",
 * "borrador" y "descartado" responden igual.
 */
export async function encargoPorToken(token: unknown): Promise<Encargo | null> {
  if (!esTokenValido(token)) return null
  const [e] = await db.select().from(cotizaEncargos).where(eq(cotizaEncargos.tokenHash, hashToken(token))).limit(1)
  if (!e || !e.snapshot || (e.estado !== 'enviado' && e.estado !== 'aceptado' && e.estado !== 'cerrado')) return null
  return e
}

export async function registrarVista(e: Encargo): Promise<void> {
  try {
    await db
      .update(cotizaEncargos)
      .set({ vistas: sql`${cotizaEncargos.vistas} + 1`, vistaPrimera: e.vistaPrimera ?? new Date() })
      .where(eq(cotizaEncargos.id, e.id))
  } catch {
    // Contar visitas es accesorio: nunca tumba la página del cliente.
  }
}

/** Último día (incluido) en que se puede aceptar: el envío más la validez, en hora de Bogotá. */
export function vigenteHasta(e: Pick<Encargo, 'enviadoEl' | 'snapshot'>): Date | null {
  const s = snapshotDe(e)
  if (!e.enviadoEl || !s) return null
  return new Date(e.enviadoEl.getTime() + s.cotizacion.validezDias * 86_400_000)
}

export function estaVencida(e: Pick<Encargo, 'enviadoEl' | 'snapshot' | 'estado'>, ahora = new Date()): boolean {
  const hasta = vigenteHasta(e)
  return e.estado === 'enviado' && !!hasta && ahora > hasta
}

function nombreValido(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  if (t.length < 3 || t.length > 120) throw new ErrorEncargo('escribe tu nombre completo')
  return t
}

function documentoValido(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/\s+/g, '').trim() : ''
  if (!/^[0-9A-Za-z.\-]{5,30}$/.test(t)) throw new ErrorEncargo('escribe tu número de documento o NIT')
  return t
}

export type DatosAceptacion = { huellaPropuesta: string; nombre: string; documento: string; instante: string }

export const constanciaAceptacion = (d: DatosAceptacion): string =>
  sha256(canonico({ tipo: 'cotiza:aceptacion:v1', huella: d.huellaPropuesta, nombre: d.nombre, documento: d.documento, instante: d.instante }))

export type DatosDecision = { encargoId: number; adicionalId: number; monto: number; decision: 'aprobado' | 'rechazado'; nombre: string; instante: string }

export const constanciaDecision = (d: DatosDecision): string =>
  sha256(canonico({ tipo: 'cotiza:adicional:v1', encargo: d.encargoId, adicional: d.adicionalId, monto: d.monto, decision: d.decision, nombre: d.nombre, instante: d.instante }))

/** El cliente acepta la propuesta vigente. Condicional al estado: dos clics, una aceptación. */
export async function aceptarPorCliente(e: Encargo, d: Record<string, unknown>): Promise<Encargo> {
  if (e.estado !== 'enviado') throw new ErrorEncargo('esta propuesta ya no está esperando aceptación', 409)
  if (estaVencida(e)) throw new ErrorEncargo('esta propuesta venció; pídele a Mike una actualizada', 409)
  const nombre = nombreValido(d.nombre)
  const documento = documentoValido(d.documento)
  if (d.acepto !== true) throw new ErrorEncargo('marca la casilla de aceptación')
  // La página manda la huella de la propuesta que mostró: si Mike la reabrió y
  // la volvió a congelar mientras el cliente la tenía abierta, no se acepta una
  // propuesta distinta de la que leyó.
  if (d.huella !== e.huella) throw new ErrorEncargo('la propuesta cambió mientras la mirabas; recarga la página', 409)
  const ahora = new Date()
  const huella = constanciaAceptacion({ huellaPropuesta: e.huella!, nombre, documento, instante: ahora.toISOString() })
  const [fila] = await db
    .update(cotizaEncargos)
    .set({ estado: 'aceptado', aceptadoEl: ahora, aceptadoPor: nombre, aceptadoDocumento: documento, aceptacionHuella: huella, actualizadoEl: ahora })
    // Y en el WHERE, por si el cambio ocurre entre la lectura y la escritura.
    .where(and(eq(cotizaEncargos.id, e.id), eq(cotizaEncargos.estado, 'enviado'), eq(cotizaEncargos.huella, e.huella!)))
    .returning()
  if (!fila) throw new ErrorEncargo('la propuesta cambió mientras la mirabas; recarga la página', 409)
  return fila
}

/** El cliente aprueba o rechaza un adicional propuesto de SU encargo. */
export async function decidirPorCliente(e: Encargo, d: Record<string, unknown>): Promise<Adicional> {
  if (e.estado !== 'aceptado') throw new ErrorEncargo('este encargo no está en curso', 409)
  const id = Number(d.adicionalId)
  if (!Number.isInteger(id) || id <= 0) throw new ErrorEncargo('adicional inválido')
  if (d.decision !== 'aprobado' && d.decision !== 'rechazado') throw new ErrorEncargo('decisión inválida')
  const nombre = nombreValido(d.nombre)
  const [a] = await db
    .select()
    .from(cotizaAdicionales)
    .where(and(eq(cotizaAdicionales.id, id), eq(cotizaAdicionales.encargoId, e.id)))
    .limit(1)
  if (!a || a.estado !== 'propuesto') throw new ErrorEncargo('ese adicional no existe o ya se decidió', 409)
  const ahora = new Date()
  const constancia = constanciaDecision({ encargoId: e.id, adicionalId: a.id, monto: a.monto, decision: d.decision, nombre, instante: ahora.toISOString() })
  const [fila] = await db
    .update(cotizaAdicionales)
    .set({ estado: d.decision, decididoEl: ahora, decididoPor: 'cliente', decididoNombre: nombre, constancia })
    // El monto va en el WHERE: se aprueba la cifra que el cliente vio.
    .where(and(eq(cotizaAdicionales.id, a.id), eq(cotizaAdicionales.encargoId, e.id), eq(cotizaAdicionales.estado, 'propuesto'), eq(cotizaAdicionales.monto, a.monto)))
    .returning()
  if (!fila) throw new ErrorEncargo('ese adicional ya se decidió', 409)
  return fila
}
