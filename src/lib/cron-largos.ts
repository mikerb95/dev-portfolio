// Última corrida de los crons de más de un día, sin leer la bitácora.
//
// La bitácora (cron_runs) se lee en una ventana corta para que el vigilante y
// /automatizaciones escaneen pocas filas. Un job semanal casi nunca cae en
// esa ventana, así que su última corrida sale de lo que el propio job guarda:
// una fila de app_settings leída por clave primaria. Solo servidor.
import { leerHistorial } from './resumen-semanal-db'

const FUENTES: Record<string, () => Promise<Date | null>> = {
  'resumen-semanal': async () => {
    const [ultimo] = await leerHistorial()
    return ultimo ? new Date(ultimo.creado) : null
  },
}

/** Fail-open: un job cuya fuente falla simplemente no aparece (y se juzga como sin registro). */
export async function ultimasFueraDeBitacora(jobs: readonly string[]): Promise<Map<string, Date>> {
  const m = new Map<string, Date>()
  await Promise.all(
    jobs.map(async (job) => {
      const fuente = FUENTES[job]
      if (!fuente) return
      try {
        const d = await fuente()
        if (d && Number.isFinite(d.getTime())) m.set(job, d)
      } catch (err) {
        console.error(`[cron-largos] ${job}:`, err instanceof Error ? err.message : err)
      }
    })
  )
  return m
}
