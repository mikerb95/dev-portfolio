import type { APIRoute } from 'astro'
import { getRoom, listDevices } from '../../../../lib/fingerprint'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Estado de la sala para el tablero (polling corto, sin WebSocket disponible en Vercel).
export const GET: APIRoute = async ({ params }) => {
  const roomId = params.room
  if (!roomId) return json(400, { error: 'sala requerida' })

  const room = await getRoom(roomId)
  if (!room) return json(404, { error: 'sala no encontrada o expirada' })

  const devices = await listDevices(roomId)
  return json(200, {
    room: { id: room.id, expiresAt: room.expiresAt },
    devices: devices.map((d) => ({
      label: d.label,
      revisits: d.revisits,
      entropyBits: d.entropyBits,
      // Prefijo del hash propio (no el completo): suficiente para mostrar la
      // "identidad" en el tablero y compararla con la de FingerprintJS.
      idShort: d.deviceHash.slice(0, 12),
      libFpHash: d.libFpHash,
      ownFp: d.ownFp ? JSON.parse(d.ownFp) : null,
      behaviorSig: d.behaviorSig ? JSON.parse(d.behaviorSig) : null,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
    })),
  })
}
