// Lectura de una corrida de CI como pista de etapas (sección del pipeline en
// /lab). Qué se puede afirmar de cada etapa sale de cómo reporta .github/
// workflows/ci.yml, no de lo que sería bonito dibujar:
//   · solo reporta el job `verify-production`, que corre con `needs: quality`:
//     toda corrida registrada pasó tests + build + e2e
//   · `conclusion` y `healthOk` los escribe ese job después del health check;
//     rolled_back = el health check falló y el rollback se ejecutó, failure =
//     falló sin rollback (por ejemplo, el deploy nunca apareció)
//
// Módulo puro, probado en tests/motion-lab.test.ts.

export type EstadoEtapa = 'ok' | 'fallo' | 'sin-dato'
export type Desenlace = 'ok' | 'fallo' | 'rollback'

export type Pista = {
  calidad: EstadoEtapa
  deploy: EstadoEtapa
  health: EstadoEtapa
  desenlace: Desenlace
  /** La luz vuelve por el desvío hasta la versión anterior. */
  vuelve: boolean
}

export function pistaDe(run: { conclusion: string; healthOk: boolean | null }): Pista {
  const desenlace: Desenlace =
    run.conclusion === 'success' ? 'ok' : run.conclusion === 'rolled_back' ? 'rollback' : 'fallo'
  // Sin dato del health check no se inventa uno: la etapa queda hueca. Un
  // éxito sin healthOk no existe hoy en ci.yml, pero una fila vieja o escrita
  // a mano no debería pintarse verde por descarte.
  const health: EstadoEtapa = run.healthOk == null ? (desenlace === 'ok' ? 'sin-dato' : 'fallo') : run.healthOk ? 'ok' : 'fallo'
  // Un rollback implica que hubo deploy (ci.yml solo revierte si lo detectó).
  // En un fallo sin rollback no se sabe si el deploy llegó a aparecer.
  const deploy: EstadoEtapa = desenlace === 'fallo' ? 'sin-dato' : 'ok'
  return { calidad: 'ok', deploy, health, desenlace, vuelve: desenlace === 'rollback' }
}
