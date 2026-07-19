// Lógica de servidor del laboratorio de fingerprinting: salas efímeras y
// registro de dispositivos. Sin PII persistente: todo vive en Turso con TTL
// corto y el cron lo purga (ver sweepFpRooms).

import { randomBytes } from 'node:crypto'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { db } from '../db'
import { fpDevices, fpRooms } from '../db/schema'

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000 // 2h: vida de una demo, no más.

function shortId(): string {
  return randomBytes(4).toString('hex') // 8 chars, suficiente para no colisionar en una demo
}

export async function createRoom(): Promise<{ id: string; expiresAt: Date }> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ROOM_TTL_MS)
  // Colisión con 8 hex es ínfima, pero reintentamos verificando cada id nuevo
  // para no arriesgar un error de clave primaria al insertar.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = shortId()
    const [existing] = await db.select().from(fpRooms).where(eq(fpRooms.id, id)).limit(1)
    if (!existing) {
      await db.insert(fpRooms).values({ id, createdAt: now, expiresAt })
      return { id, expiresAt }
    }
  }
  throw new Error('no se pudo generar un id de sala único')
}

export async function getRoom(id: string) {
  const [room] = await db.select().from(fpRooms).where(eq(fpRooms.id, id)).limit(1)
  if (!room) return null
  if (room.expiresAt.getTime() < Date.now()) return null
  return room
}

export type JoinResult = { label: number; revisits: number; isReturning: boolean }

/**
 * Registra un dispositivo en la sala. Si el hash ya apareció, es una
 * "revisita" (el efecto demostrativo: incógnito/borrar cookies no lo evade).
 */
export async function joinDevice(params: {
  roomId: string
  deviceHash: string
  ownFp: unknown
  libFpHash: string | null
  entropyBits: number
}): Promise<JoinResult> {
  const now = new Date()

  // Identidad primaria: el visitorId de FingerprintJS (libFpHash), que está
  // diseñado para sobrevivir a incógnito y al borrado de cookies. Nuestro hash
  // propio es el respaldo: es más frágil (canvas/audio/devicePixelRatio pueden
  // variar entre sesiones y romper la igualdad exacta), así que si solo con él
  // buscáramos, el mismo dispositivo en incógnito entraría como uno nuevo — que
  // es justo lo que la demo quiere demostrar que NO debería pasar. Un match por
  // deviceHash O por libFpHash reconoce la revisita aunque el hash propio baile.
  const matchClause = params.libFpHash
    ? or(eq(fpDevices.deviceHash, params.deviceHash), eq(fpDevices.libFpHash, params.libFpHash))
    : eq(fpDevices.deviceHash, params.deviceHash)

  // orderBy(label) para quedarnos siempre con el dispositivo más antiguo que
  // coincide (su #N original), no con uno arbitrario si hubiera varios.
  const [existing] = await db
    .select()
    .from(fpDevices)
    .where(and(eq(fpDevices.roomId, params.roomId), matchClause))
    .orderBy(fpDevices.label)
    .limit(1)

  if (existing) {
    const revisits = existing.revisits + 1
    await db
      .update(fpDevices)
      .set({
        revisits,
        lastSeen: now,
        entropyBits: params.entropyBits,
        // Refrescamos ambos anclajes al último valor visto: el ancla estable es
        // libFpHash, pero guardar el deviceHash más reciente da mejor chance de
        // reconocer la próxima visita por hash si FingerprintJS no cargara.
        deviceHash: params.deviceHash,
        libFpHash: params.libFpHash ?? existing.libFpHash,
      })
      .where(eq(fpDevices.id, existing.id))
    return { label: existing.label, revisits, isReturning: true }
  }

  const [{ maxLabel } = { maxLabel: 0 }] = await db
    .select({ maxLabel: fpDevices.label })
    .from(fpDevices)
    .where(eq(fpDevices.roomId, params.roomId))
    .orderBy(desc(fpDevices.label))
    .limit(1)

  const label = (maxLabel ?? 0) + 1
  await db.insert(fpDevices).values({
    roomId: params.roomId,
    deviceHash: params.deviceHash,
    label,
    ownFp: JSON.stringify(params.ownFp ?? {}),
    libFpHash: params.libFpHash,
    entropyBits: params.entropyBits,
    revisits: 0,
    firstSeen: now,
    lastSeen: now,
  })
  return { label, revisits: 0, isReturning: false }
}

export async function recordBehavior(params: { roomId: string; deviceHash: string; behaviorSig: unknown }) {
  await db
    .update(fpDevices)
    .set({ behaviorSig: JSON.stringify(params.behaviorSig ?? {}), lastSeen: new Date() })
    .where(and(eq(fpDevices.roomId, params.roomId), eq(fpDevices.deviceHash, params.deviceHash)))
}

export async function listDevices(roomId: string) {
  return db.select().from(fpDevices).where(eq(fpDevices.roomId, roomId)).orderBy(fpDevices.label)
}

/** Purga salas vencidas (cascada borra sus dispositivos). Llamado por el cron. */
export async function sweepFpRooms(now = new Date()): Promise<number> {
  const rows = await db.delete(fpRooms).where(lt(fpRooms.expiresAt, now)).returning({ id: fpRooms.id })
  return rows.length
}
