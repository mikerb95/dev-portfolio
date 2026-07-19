// Lógica de servidor para el control de descargas del CV: reusa el mismo
// recolector de señales del lab de fingerprinting (src/lib/fingerprint-client.ts)
// pero aquí sí persiste IP/UA y no hay TTL — el propósito es un historial
// permanente de quién descarga el CV, no una demo efímera.

import { randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { cvDownloads } from '../db/schema'

const TOKEN_TTL_MS = 5 * 60 * 1000 // ventana corta: capturar → descargar es casi inmediato

export type CaptureParams = {
  deviceHash: string
  signals: unknown
  libFpHash: string | null
  entropyBits: number
  ip: string | null
  userAgent: string | null
  referer: string | null
}

/**
 * Registra el intento de descarga y devuelve un token de un solo uso para
 * /api/cv/download. Si el hash ya había descargado antes, suma revisita en
 * vez de crear una fila nueva (mismo patrón que joinDevice en fingerprint.ts).
 */
export async function recordCaptureAttempt(params: CaptureParams): Promise<{ token: string }> {
  const token = randomBytes(16).toString('hex')
  const now = new Date()

  const [existing] = await db
    .select()
    .from(cvDownloads)
    .where(eq(cvDownloads.deviceHash, params.deviceHash))
    .orderBy(desc(cvDownloads.createdAt))
    .limit(1)

  if (existing) {
    await db
      .update(cvDownloads)
      .set({
        downloadToken: token,
        downloadedAt: null,
        revisits: existing.revisits + 1,
        ip: params.ip,
        userAgent: params.userAgent,
        referer: params.referer,
        entropyBits: params.entropyBits,
        libFpHash: params.libFpHash,
        signals: JSON.stringify(params.signals ?? {}),
      })
      .where(eq(cvDownloads.id, existing.id))
    return { token }
  }

  await db.insert(cvDownloads).values({
    deviceHash: params.deviceHash,
    signals: JSON.stringify(params.signals ?? {}),
    libFpHash: params.libFpHash,
    entropyBits: params.entropyBits,
    ip: params.ip,
    userAgent: params.userAgent,
    referer: params.referer,
    downloadToken: token,
    downloadedAt: null,
    revisits: 0,
    createdAt: now,
  })
  return { token }
}

/** Consume el token (un solo uso, expira a los 5 min) y marca la descarga real. */
export async function consumeDownloadToken(token: string): Promise<boolean> {
  const [row] = await db.select().from(cvDownloads).where(eq(cvDownloads.downloadToken, token)).limit(1)
  if (!row) return false
  if (row.downloadedAt) return false // ya se usó
  if (Date.now() - row.createdAt.getTime() > TOKEN_TTL_MS) return false

  await db.update(cvDownloads).set({ downloadedAt: new Date() }).where(eq(cvDownloads.id, row.id))
  return true
}

export async function listCvDownloads() {
  return db.select().from(cvDownloads).orderBy(desc(cvDownloads.createdAt)).limit(500)
}
