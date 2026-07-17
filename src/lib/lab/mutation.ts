// Lógica pura sobre el reporte JSON de Stryker (Mutation Testing Elements,
// schemaVersion 1.0). El reporte NO trae un score agregado — cada mutante solo
// tiene un `status`— así que el cálculo es responsabilidad nuestra. Aquí vive
// aislado de la red y del disco para poder testearlo contra un reporte real.

export type MutantStatus =
  | 'Killed'
  | 'Survived'
  | 'NoCoverage'
  | 'Timeout'
  | 'Ignored'
  | 'RuntimeError'
  | 'CompileError'

export type MutationReport = {
  files: Record<string, { mutants: { status: MutantStatus }[] }>
}

/**
 * % de mutantes "detectados" (Killed + Timeout) sobre los que de verdad cuentan
 * para el score. Se excluyen `Ignored` (mutados a propósito fuera de alcance) y
 * `CompileError` (mutación inválida, no dice nada de los tests) — mismo criterio
 * que usa Stryker internamente. `NoCoverage` SÍ cuenta como no detectado: ningún
 * test tocó esa línea, que es exactamente el hueco que mutation testing existe
 * para encontrar.
 */
export function computeMutationScore(report: MutationReport): number | null {
  let detected = 0
  let total = 0

  for (const file of Object.values(report.files ?? {})) {
    for (const m of file.mutants ?? []) {
      if (m.status === 'Ignored' || m.status === 'CompileError') continue
      total++
      if (m.status === 'Killed' || m.status === 'Timeout') detected++
    }
  }

  if (total === 0) return null
  return Math.round((detected / total) * 1000) / 10
}

export type MutationCounts = Record<MutantStatus, number>

/** Desglose por estado, para mostrar en el panel (cuántos sobrevivieron, etc.). */
export function countByStatus(report: MutationReport): MutationCounts {
  const counts: MutationCounts = {
    Killed: 0, Survived: 0, NoCoverage: 0, Timeout: 0, Ignored: 0, RuntimeError: 0, CompileError: 0,
  }
  for (const file of Object.values(report.files ?? {})) {
    for (const m of file.mutants ?? []) counts[m.status]++
  }
  return counts
}
