import type { APIRoute } from 'astro'
import { runBackup } from '../../../lib/backup'
import { cronSecretOk } from '../../../lib/cron-auth'

// Backup diario. Estuvo bajo `/api/admin/backup` hasta agosto de 2026 y por eso
// no funcionó nunca: el middleware protege con sesión todo lo que cuelga de
// `/api/admin/`, así que el cron de Vercel se llevaba un 302 a /login antes de
// llegar al handler. Encima el handler del cron era POST y los crons de Vercel
// disparan GET, con lo que la petición diaria caía en el GET de "listar
// backups" y devolvía 200 sin hacer nada. Dos fallos que se tapaban entre sí:
// el panel de Vercel marcaba el cron en verde y el store de Blob estaba vacío.
//
// Aquí es GET con Bearer CRON_SECRET, igual que los otros seis crons.

export const GET: APIRoute = async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify({ ok: true, ...(await runBackup()) }), { status: 200 })
  } catch (err) {
    // Este cron NO es fail-open silencioso como los de observabilidad: un backup
    // que falla y devuelve 200 es justo lo que dejó el store vacío un mes.
    console.error('[cron/backup]', err)
    return new Response(JSON.stringify({ error: 'backup fallido' }), { status: 500 })
  }
}
