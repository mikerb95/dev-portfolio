import { describe, expect, it } from 'vitest'
import { computeMutationScore, countByStatus, type MutationReport } from '../src/lib/lab/mutation'

// Reporte de referencia: recorte real de una corrida de Stryker contra
// money.ts + pnl.ts (money.ts:12-16 con 5 StringLiteral sobrevivientes por
// falta de test de esas etiquetas, más killed/timeout/noCoverage reales).
const REAL_REPORT: MutationReport = {
  files: {
    'src/lib/money.ts': {
      mutants: [
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Survived' },
        { status: 'Survived' },
        { status: 'Survived' },
        { status: 'Survived' },
        { status: 'Survived' },
        { status: 'NoCoverage' },
        { status: 'Timeout' },
      ],
    },
    'src/lib/pnl.ts': {
      mutants: [
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Killed' },
        { status: 'Survived' },
      ],
    },
  },
}

describe('computeMutationScore', () => {
  it('killed + timeout sobre el total detectable', () => {
    // money.ts: 3 killed + 1 timeout = 4/10 detectados. pnl.ts: 5/6.
    // Total: 9 detectados / 16 = 56.25 → redondeado a 1 decimal.
    expect(computeMutationScore(REAL_REPORT)).toBe(56.3)
  })

  it('100% cuando todos los mutantes mueren', () => {
    const report: MutationReport = { files: { 'a.ts': { mutants: [{ status: 'Killed' }, { status: 'Timeout' }] } } }
    expect(computeMutationScore(report)).toBe(100)
  })

  it('0% cuando todos sobreviven o no tienen cobertura', () => {
    const report: MutationReport = {
      files: { 'a.ts': { mutants: [{ status: 'Survived' }, { status: 'NoCoverage' }] } },
    }
    expect(computeMutationScore(report)).toBe(0)
  })

  it('excluye Ignored y CompileError del cálculo (no cuentan ni arriba ni abajo)', () => {
    const conIgnorados: MutationReport = {
      files: {
        'a.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Survived' }, { status: 'Ignored' }, { status: 'CompileError' }],
        },
      },
    }
    // 1 killed / 2 detectables (killed+survived) = 50%, los otros dos no cuentan.
    expect(computeMutationScore(conIgnorados)).toBe(50)
  })

  it('null cuando no hay mutantes evaluables (todo el archivo era Ignored)', () => {
    const report: MutationReport = { files: { 'a.ts': { mutants: [{ status: 'Ignored' }] } } }
    expect(computeMutationScore(report)).toBeNull()
  })

  it('null con reporte vacío', () => {
    expect(computeMutationScore({ files: {} })).toBeNull()
  })
})

describe('countByStatus', () => {
  it('cuenta cada estado a través de todos los archivos', () => {
    const counts = countByStatus(REAL_REPORT)
    expect(counts).toEqual({
      Killed: 8, Survived: 6, NoCoverage: 1, Timeout: 1, Ignored: 0, RuntimeError: 0, CompileError: 0,
    })
  })
})
