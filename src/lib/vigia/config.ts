import lock from '../../../claude-lock.json'

// Identidad del vigía en Managed Agents. Sale de claude-lock.json (lo escribe
// `ant apply`) para que el ID que filtra el webhook no pueda desalinearse del
// agente que de verdad se despliega.
export const VIGIA_AGENT_ID: string = lock.resources['./agents/vigia/agent.md'].id

/** Clave del vigía en `cron_runs`, junto a los crons de /api/cron/*. */
export const VIGIA_JOB = 'vigia-nocturno'

/** Archivos que el prompt le pide dejar en /mnt/session/outputs/. */
export const ARCHIVO_JSON = 'informe.json'
export const ARCHIVO_MD = 'informe.md'

/** Tamaño máximo que se guarda del informe en markdown (la fila lo lee el panel). */
export const MAX_MD = 60_000
