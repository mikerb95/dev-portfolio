// Motor del prototipo (Claude Agent SDK) para la pantalla del analista. Solo en
// `astro dev`: la Agent SDK levanta el binario de Claude Code como subproceso,
// y eso no cabe en una función de Vercel. Existe para el meetup del 1 oct
// (el requisito es un agente hecho con la Agent SDK); en producción el motor
// es el de la API (lib/analista/motor-api.ts), sobre las mismas herramientas.
//
// A diferencia del motor de producción, aquí la aprobación NO se guarda en la
// base: el subproceso espera en memoria a que llegue la decisión por
// /api/admin/analista/decision. Si nadie decide en 10 minutos, se rechaza.
//
// El prefijo `_` evita que Astro lo publique como ruta.

import { randomUUID } from 'node:crypto'

const ESPERA_MAX_MS = 10 * 60_000

// En globalThis y no en el módulo: el dev server re-evalúa los archivos al
// editarlos, y la decisión resolvería una promesa que nadie espera.
const global = globalThis as typeof globalThis & { __analistaSdk?: Map<string, (aprobado: boolean) => void> }
const pendientes = (global.__analistaSdk ??= new Map())

export const esEjecucionSdk = (id: string) => id.startsWith('sdk-')

/** Entrega la decisión a un análisis de la Agent SDK. false si no había nada esperando. */
export function decidirSdk(id: string, aprobado: boolean): boolean {
  const resolver = pendientes.get(id)
  if (!resolver) return false
  pendientes.delete(id)
  resolver(aprobado)
  return true
}

/** Corre una pregunta con la Agent SDK, traduciendo sus eventos a los de la pantalla. */
export async function correrConAgentSdk(pregunta: string, enviar: (evento: unknown) => void): Promise<void> {
  // La guarda con DEV deja el import fuera del build de producción: la SDK no
  // se empaqueta para Vercel.
  const motor = import.meta.env.DEV ? await import('../../../../../agents/analista-siem/motor') : null
  if (!motor) throw new Error('La Agent SDK solo corre en local (npm run dev).')

  const id = `sdk-${randomUUID()}`
  enviar({ tipo: 'ejecucion', id })
  try {
    await motor.consultar({
      pregunta,
      seudonimos: new motor.Seudonimos(),
      formato: 'pantalla',
      emitir: (e) => {
        if (e.tipo === 'sesion' || e.tipo === 'facturacion') return
        // El bloqueo se pinta con su diálogo, no como un paso más.
        if (e.tipo === 'paso' && e.herramienta === 'bloquear_origen') return
        if (e.tipo === 'fin') {
          enviar({
            tipo: 'fin',
            estado: e.ok ? 'terminada' : 'fallida',
            iteraciones: e.turnos,
            costoUsd: e.costoUsd,
            error: e.ok ? null : `El agente terminó con: ${e.motivo}`,
          })
          return
        }
        enviar(e)
      },
      aprobar: () =>
        new Promise<boolean>((resolve) => {
          pendientes.set(id, resolve)
          setTimeout(() => decidirSdk(id, false), ESPERA_MAX_MS)
        }),
    })
  } finally {
    decidirSdk(id, false)
  }
}
