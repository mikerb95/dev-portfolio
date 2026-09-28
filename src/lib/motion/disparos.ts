// Qué despierta a cada workflow: el selector de eventos de /automatizaciones.
//
// Módulo PURO. La relación evento → workflows no se escribe en la página: sale
// de `disparadores` en el catálogo, que es lo mismo que declara cada YAML. Si
// un workflow cambia de disparadores, el selector cambia con él.

import type { Disparador, Workflow } from '../../data/automatizaciones'

/** Los eventos que despiertan workflows, en el orden en que se viven: del commit al domingo. */
export const EVENTOS_CI = ['push', 'pull_request', 'semanal', 'manual'] as const satisfies readonly Disparador[]
export type EventoCi = (typeof EVENTOS_CI)[number]

export function workflowsDe<W extends Pick<Workflow, 'disparadores'>>(evento: EventoCi, workflows: readonly W[]): W[] {
  return workflows.filter((w) => w.disparadores.includes(evento))
}
