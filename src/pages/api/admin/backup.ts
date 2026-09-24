import type { APIRoute } from 'astro'
import { list } from '@vercel/blob'
import { runBackup } from '../../../lib/backup'
import { recordAdminEvent } from '../../../lib/security/events'

// Cara del panel: listar los backups existentes y crear uno a mano. La sesión
// la exige el middleware por vivir bajo /api/admin/.
//
// El disparo automático NO está aquí, está en /api/cron/backup: este gate de
// sesión es exactamente lo que impedía que el cron llegara (ver lib/backup.ts).

/** Creación manual desde /admin/backup. */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const result = await runBackup()
    // Un backup es la base entera en un archivo: queda rastro de quién lo pidió.
    await recordAdminEvent(request, 'backup.created')
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 })
  } catch (err) {
    console.error('[backup]', err)
    return new Response(JSON.stringify({ error: 'backup fallido' }), { status: 500 })
  }
}

/** Listado de los backups recientes. */
export const GET: APIRoute = async () => {
  try {
    const { blobs } = await list({ prefix: 'backups/' })
    const sorted = blobs
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .slice(0, 30)
    return new Response(JSON.stringify(sorted), { status: 200 })
  } catch (err) {
    console.error('[backup] listado', err)
    return new Response(JSON.stringify([]), { status: 200 })
  }
}
