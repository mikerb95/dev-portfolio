import type { APIRoute } from 'astro'
import { procesarCola } from '../../../../lib/marketing/db'
import { json } from './campanas/_comun'

// "Enviar lo pendiente ahora" del panel: lo mismo que hace el cron, con las
// mismas reglas (horario legal, cupo diario, una por semana).

export const POST: APIRoute = async () => json(200, await procesarCola())
