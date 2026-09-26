import { describe, expect, it } from 'vitest'
import { HALLAZGOS, ORDEN_AUDITORIAS } from '../src/data/hallazgos-seguridad'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// /security une los metadatos de cada hallazgo (commit, fecha, OWASP) con su
// texto por índice. Un hallazgo añadido en un lado y no en el otro no rompe
// nada visible: corre todos los commits un puesto y cada tarjeta enlaza la
// corrección de otra. Esto lo impide.

describe('hallazgos publicados en /security', () => {
  it('cada metadato tiene su texto, en los dos idiomas', () => {
    expect(es.security.findings).toHaveLength(HALLAZGOS.length)
    expect(en.security.findings).toHaveLength(HALLAZGOS.length)
  })

  it('los identificadores no se repiten y los commits son hashes cortos', () => {
    expect(new Set(HALLAZGOS.map((h) => h.id)).size).toBe(HALLAZGOS.length)
    for (const h of HALLAZGOS) expect(h.commit).toMatch(/^[0-9a-f]{7}$/)
  })

  it('cada hallazgo pertenece a una auditoría publicada y su fecha cae en ese mes', () => {
    for (const h of HALLAZGOS) {
      expect(ORDEN_AUDITORIAS).toContain(h.auditoria)
      const [mes, anio] = h.auditoria.split('-')
      const mm = { jul: '07', sep: '09' }[mes]
      expect(h.date.startsWith(`${anio}-${mm}`)).toBe(true)
    }
  })
})
