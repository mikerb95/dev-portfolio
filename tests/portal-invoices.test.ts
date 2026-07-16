import { describe, it, expect } from 'vitest'
import { computeTotals, isImmutable, isPayable, lineTotal, INVOICE_STATUS_LABELS } from '../src/lib/portal/invoices'
import { formatMoney, daysUntil } from '../src/lib/portal/format'

describe('portal · facturación', () => {
  describe('lineTotal', () => {
    it('multiplica cantidad por precio unitario', () => {
      expect(lineTotal({ description: 'x', quantity: 3, unitCents: 150_000 })).toBe(450_000)
    })

    it('redondea a centavo entero con cantidades fraccionarias', () => {
      // 2.5 horas a 33.333,33 → el producto tiene decimales de centavo. Si se
      // arrastraran, el total de la factura no cuadraría con la suma de las
      // líneas impresas.
      expect(lineTotal({ description: 'x', quantity: 2.5, unitCents: 3_333_333 })).toBe(8_333_333)
      expect(Number.isInteger(lineTotal({ description: 'x', quantity: 1.5, unitCents: 333 }))).toBe(true)
    })

    it('maneja cantidad cero', () => {
      expect(lineTotal({ description: 'x', quantity: 0, unitCents: 500_000 })).toBe(0)
    })
  })

  describe('computeTotals', () => {
    it('suma las líneas sin impuesto por defecto', () => {
      const totals = computeTotals([
        { description: 'Diseño', quantity: 1, unitCents: 2_000_000 },
        { description: 'Desarrollo', quantity: 2, unitCents: 1_500_000 },
      ])
      expect(totals).toEqual({ subtotalCents: 5_000_000, taxCents: 0, totalCents: 5_000_000 })
    })

    it('aplica el impuesto sobre el subtotal', () => {
      const totals = computeTotals([{ description: 'x', quantity: 1, unitCents: 1_000_000 }], 0.19)
      expect(totals).toEqual({ subtotalCents: 1_000_000, taxCents: 190_000, totalCents: 1_190_000 })
    })

    it('el total es SIEMPRE subtotal + impuesto, sin deriva de redondeo', () => {
      // Este es el test que importa: tres líneas que en float darían un total
      // distinto de la suma de sus partes.
      const totals = computeTotals(
        [
          { description: 'a', quantity: 1, unitCents: 10 },
          { description: 'b', quantity: 1, unitCents: 20 },
          { description: 'c', quantity: 1, unitCents: 30 },
        ],
        0.19
      )
      expect(totals.subtotalCents).toBe(60)
      expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents)
      expect(Number.isInteger(totals.totalCents)).toBe(true)
    })

    it('devuelve ceros sin líneas', () => {
      expect(computeTotals([])).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 })
    })

    it('todos los importes son enteros con cualquier combinación', () => {
      const totals = computeTotals(
        [
          { description: 'a', quantity: 1.33, unitCents: 777 },
          { description: 'b', quantity: 0.5, unitCents: 333 },
        ],
        0.19
      )
      for (const v of Object.values(totals)) expect(Number.isInteger(v)).toBe(true)
    })
  })

  describe('máquina de estados', () => {
    it('solo se puede pagar lo que está emitido o vencido', () => {
      expect(isPayable('sent')).toBe(true)
      expect(isPayable('overdue')).toBe(true)
      // Un borrador no lo ha visto el cliente; una pagada ya está saldada;
      // una anulada no se debe. Pagar cualquiera de las tres es un bug.
      expect(isPayable('draft')).toBe(false)
      expect(isPayable('paid')).toBe(false)
      expect(isPayable('void')).toBe(false)
    })

    it('las facturas pagadas y anuladas son inmutables', () => {
      expect(isImmutable('paid')).toBe(true)
      expect(isImmutable('void')).toBe(true)
      expect(isImmutable('draft')).toBe(false)
      expect(isImmutable('sent')).toBe(false)
      expect(isImmutable('overdue')).toBe(false)
    })

    it('todos los estados tienen etiqueta legible', () => {
      for (const s of ['draft', 'sent', 'paid', 'overdue', 'void'] as const) {
        expect(INVOICE_STATUS_LABELS[s]).toBeTruthy()
      }
    })
  })

  describe('formato de dinero', () => {
    it('convierte centavos a pesos sin decimales', () => {
      //   es el espacio duro que mete Intl entre el símbolo y la cifra.
      expect(formatMoney(5_000_000, 'COP').replace(/ /g, ' ')).toMatch(/50\.000/)
    })

    it('no pierde precisión en importes grandes', () => {
      expect(formatMoney(123_456_789, 'COP')).toMatch(/1\.234\.567/)
    })

    it('usa decimales para monedas que los tienen', () => {
      expect(formatMoney(1_050, 'USD')).toMatch(/10[.,]50/)
    })
  })

  describe('daysUntil', () => {
    it('cuenta días de calendario, no fracciones de 24h', () => {
      // Una factura que vence hoy son 0 días, aunque se emitiera esta mañana.
      const hoy = new Date(2026, 6, 15, 23, 0)
      expect(daysUntil(new Date(2026, 6, 15, 1, 0), hoy)).toBe(0)
      expect(daysUntil(new Date(2026, 6, 16, 1, 0), hoy)).toBe(1)
      expect(daysUntil(new Date(2026, 6, 14, 23, 59), hoy)).toBe(-1)
    })

    it('devuelve null sin fecha', () => {
      expect(daysUntil(null)).toBeNull()
    })
  })
})
