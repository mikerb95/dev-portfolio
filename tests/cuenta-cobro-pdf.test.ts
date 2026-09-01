import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { generateCuentaCobroPdf, sanitize, type CuentaCobroPdfInput } from '../src/lib/cuenta-cobro-pdf'
import { computeCuentaCobro, CONFIG_DEFAULT, type Emisor } from '../src/lib/cuentas-cobro'

const emisor: Emisor = {
  nombre: 'Mike Rodríguez',
  cedula: '1000000000',
  direccion: 'Cra 1 #2-3',
  ciudad: 'Bogotá',
  telefono: '+573000000000',
  email: 'mike@codebymike.tech',
  banco: 'Bancolombia',
  tipoCuenta: 'Ahorros',
  numeroCuenta: '12345678901',
  declarante: true,
}

function input(over: Partial<CuentaCobroPdfInput> = {}): CuentaCobroPdfInput {
  const items = over.items ?? [
    { description: 'Desarrollo del portal', quantity: 1, unitCents: 3_000_000_00, totalCents: 3_000_000_00 },
  ]
  const t = computeCuentaCobro(
    items.map((i) => ({ description: i.description, quantity: i.quantity, unitCents: i.unitCents })),
    ['honorarios'],
    { ...CONFIG_DEFAULT, declarante: true }
  )

  return {
    number: 'CC-2026-001',
    city: 'Bogotá',
    issuedAt: new Date('2026-09-01T12:00:00Z'),
    dueAt: null,
    concept: 'Servicios de desarrollo de software prestados durante agosto de 2026.',
    contractRef: 'OC-4471',
    periodStart: new Date('2026-08-01T12:00:00Z'),
    periodEnd: new Date('2026-08-31T12:00:00Z'),
    subtotalCents: t.subtotalCents,
    totalCents: t.totalCents,
    retentionsCents: t.retentionsCents,
    netCents: t.netCents,
    notes: null,
    ssPlanilla: '1234567890',
    ssPeriodo: '2026-08',
    emisor,
    deudor: { nombre: 'ACME S.A.S.', nit: '900123456-7', direccion: 'Cra 7 #1-2', ciudad: 'Bogotá' },
    retentions: t.retentions,
    items,
    ...over,
  }
}

// ── Saneado ─────────────────────────────────────────────────────────────────
// Este bloque es el que justifica el archivo: las fuentes estándar de pdf-lib
// codifican en WinAnsi y `drawText` LANZA con cualquier cosa fuera de ese
// rango. El fallo no aparece en compilación, aparece con el primer cliente que
// pega texto desde WhatsApp.

describe('sanitize', () => {
  it('conserva las tildes y la ñ: son WinAnsi válido', () => {
    expect(sanitize('Bogotá, señor Muñoz')).toBe('Bogotá, señor Muñoz')
  })

  it('degrada la tipografía fina a ASCII en vez de romperse', () => {
    const raya = String.fromCodePoint(0x2014)
    const comillas = `${String.fromCodePoint(0x201c)}hola${String.fromCodePoint(0x201d)}`
    const puntos = String.fromCodePoint(0x2026)
    expect(sanitize(`a${raya}b`)).toBe('a-b')
    expect(sanitize(comillas)).toBe('"hola"')
    expect(sanitize(`espera${puntos}`)).toBe('espera...')
  })

  it('convierte el espacio duro que mete Intl en un espacio normal', () => {
    expect(sanitize(`$${String.fromCodePoint(0x00a0)}150.000`)).toBe('$ 150.000')
  })

  it('descarta emojis y caracteres de control sin descartar el texto', () => {
    expect(sanitize('Pago listo 🎉 gracias')).toBe('Pago listo  gracias')
    expect(sanitize('linea1linea2')).toBe('linea1linea2')
  })

  it('null y undefined dan cadena vacía, no "null"', () => {
    expect(sanitize(null)).toBe('')
    expect(sanitize(undefined)).toBe('')
  })
})

// ── Generación ──────────────────────────────────────────────────────────────

describe('generateCuentaCobroPdf', () => {
  it('genera un PDF de una sola página', async () => {
    const bytes = await generateCuentaCobroPdf(input())
    expect(bytes.byteLength).toBeGreaterThan(1000)

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('sobrevive a texto sucio en cada campo libre', async () => {
    // El caso que de verdad tumba esto en producción: descripciones y conceptos
    // pegados desde WhatsApp o Word, con emojis y comillas tipográficas.
    const sucio = `Diseño ${String.fromCodePoint(0x201c)}web${String.fromCodePoint(0x201d)} 🚀 ${String.fromCodePoint(0x2014)} fase 1 ✅`
    await expect(
      generateCuentaCobroPdf(
        input({
          concept: sucio,
          notes: sucio,
          contractRef: sucio,
          items: [{ description: sucio, quantity: 1, unitCents: 100_000_00, totalCents: 100_000_00 }],
        })
      )
    ).resolves.toBeInstanceOf(Uint8Array)
  })

  it('no se rompe con los campos opcionales vacíos', async () => {
    await expect(
      generateCuentaCobroPdf(
        input({
          concept: null,
          notes: null,
          contractRef: null,
          periodStart: null,
          periodEnd: null,
          dueAt: null,
          ssPlanilla: null,
          ssPeriodo: null,
          city: null,
          issuedAt: null,
          retentions: [],
        })
      )
    ).resolves.toBeInstanceOf(Uint8Array)
  })

  it('sigue siendo de una página aunque se pasen más líneas de las que caben', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      description: `Concepto largo número ${i} con texto de relleno para forzar el corte`,
      quantity: 1,
      unitCents: 50_000_00,
      totalCents: 50_000_00,
    }))
    const doc = await PDFDocument.load(await generateCuentaCobroPdf(input({ items })))
    expect(doc.getPageCount()).toBe(1)
  })

  it('un importe grande no desborda la línea del valor en letras', async () => {
    // 'ciento ochenta y tres millones trescientos nueve mil pesos m/cte' no cabe
    // en una sola línea: el envoltorio tiene que partirlo, no salirse del papel.
    const bytes = await generateCuentaCobroPdf(
      input({ totalCents: 183_309_000_00, subtotalCents: 183_309_000_00, netCents: 183_309_000_00 })
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
