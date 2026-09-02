import { describe, it, expect } from 'vitest'
import {
  CONFIG_DEFAULT,
  CONCEPTOS_DEFAULT,
  UVT_2026_CENTS,
  computeCuentaCobro,
  computeRetentions,
  ibcSeguridadSocial,
  bloquesIdentificacion,
  formatFechaCorta,
  formatFechaLarga,
  montoEnLetras,
  numeroALetras,
  parseCuentaCobroConfig,
  parseDeudor,
  parseEmisor,
  parseFechaCalendario,
  topeIva,
  validateCuentaCobro,
  type CuentaCobroConfig,
  type Emisor,
} from '../src/lib/cuentas-cobro'

// ── Valor en letras ─────────────────────────────────────────────────────────
// La función más traicionera del módulo: va con tabla de casos, no con
// confianza. Cada fila de aquí es una irregularidad real del español.

describe('numeroALetras', () => {
  const casos: [number, string][] = [
    [0, 'cero'],
    [1, 'un'], // apócope: siempre va seguido de 'pesos'
    [7, 'siete'],
    [15, 'quince'],
    [16, 'dieciséis'],
    [20, 'veinte'],
    [21, 'veintiún'],
    [22, 'veintidós'],
    [30, 'treinta'],
    [31, 'treinta y un'],
    [99, 'noventa y nueve'],
    [100, 'cien'], // 'cien' exacto…
    [101, 'ciento un'], // …pero 'ciento' en cuanto hay resto
    [115, 'ciento quince'],
    [200, 'doscientos'],
    [500, 'quinientos'], // no 'cincocientos'
    [700, 'setecientos'], // no 'sietecientos'
    [900, 'novecientos'], // no 'nuevecientos'
    [1000, 'mil'], // no 'un mil'
    [1001, 'mil un'],
    [2000, 'dos mil'],
    [21_000, 'veintiún mil'],
    [100_000, 'cien mil'],
    [121_000, 'ciento veintiún mil'],
    [1_000_000, 'un millón'],
    [2_000_000, 'dos millones'],
    [2_500_000, 'dos millones quinientos mil'],
    [21_000_000, 'veintiún millones'],
    [1_500_750, 'un millón quinientos mil setecientos cincuenta'],
    [183_309_000, 'ciento ochenta y tres millones trescientos nueve mil'],
  ]

  for (const [n, esperado] of casos) {
    it(`${n} → ${esperado}`, () => expect(numeroALetras(n)).toBe(esperado))
  }

  it('rechaza negativos y valores fuera de rango en vez de devolver basura', () => {
    expect(numeroALetras(-1)).toBe('')
    expect(numeroALetras(NaN)).toBe('')
    expect(numeroALetras(1e15)).toBe('')
  })
})

describe('montoEnLetras', () => {
  it('escribe el importe como lo espera el área de pagos', () => {
    expect(montoEnLetras(250_000_00)).toBe('DOSCIENTOS CINCUENTA MIL PESOS M/CTE')
    expect(montoEnLetras(1_500_000_00)).toBe('UN MILLÓN QUINIENTOS MIL PESOS M/CTE')
  })

  it('singulariza un solo peso', () => {
    expect(montoEnLetras(100)).toBe('UN PESO M/CTE')
  })

  it('solo escribe centavos cuando existen', () => {
    expect(montoEnLetras(150)).toBe('UN PESO CON CINCUENTA CENTAVOS M/CTE')
    expect(montoEnLetras(200)).toBe('DOS PESOS M/CTE')
  })

  it('cero es un importe válido de escribir, no un error', () => {
    expect(montoEnLetras(0)).toBe('CERO PESOS M/CTE')
  })
})

// ── Retenciones ─────────────────────────────────────────────────────────────

const cfgDeclarante: CuentaCobroConfig = { ...CONFIG_DEFAULT, declarante: true }
const cfgNoDeclarante: CuentaCobroConfig = { ...CONFIG_DEFAULT, declarante: false }

describe('computeRetentions', () => {
  it('honorarios: 11 % al declarante, 10 % al no declarante', () => {
    const base = 2_000_000_00
    expect(computeRetentions(base, ['honorarios'], cfgDeclarante)[0].valueCents).toBe(220_000_00)
    expect(computeRetentions(base, ['honorarios'], cfgNoDeclarante)[0].valueCents).toBe(200_000_00)
  })

  it('servicios generales: el NO declarante retiene MÁS (6 %) que el declarante (4 %)', () => {
    const base = 1_000_000_00
    expect(computeRetentions(base, ['servicios'], cfgDeclarante)[0].valueCents).toBe(40_000_00)
    expect(computeRetentions(base, ['servicios'], cfgNoDeclarante)[0].valueCents).toBe(60_000_00)
  })

  it('no practica retención por debajo de la base mínima en UVT', () => {
    // Servicios tiene base de 2 UVT; una base de 1 UVT queda por debajo.
    const [r] = computeRetentions(UVT_2026_CENTS, ['servicios'], cfgDeclarante)
    expect(r.applied).toBe(false)
    expect(r.valueCents).toBe(0)
    expect(r.motivo).toContain('2 UVT')
  })

  it('honorarios no tiene base mínima: retiene desde el primer peso', () => {
    const [r] = computeRetentions(10_000_00, ['honorarios'], cfgDeclarante)
    expect(r.applied).toBe(true)
    expect(r.valueCents).toBe(1_100_00)
  })

  it('un concepto con tarifa sin configurar no retiene y lo dice', () => {
    // ReteICA viene apagado por defecto: la tarifa depende del municipio.
    const [r] = computeRetentions(5_000_000_00, ['reteica'], cfgDeclarante)
    expect(r.applied).toBe(false)
    expect(r.motivo).toBe('tarifa sin configurar')
  })

  it('redondea cada concepto a centavo entero por separado', () => {
    // 333.333 pesos al 11 % = 36.666,63 pesos exactos: el redondeo no puede
    // arrastrarse a la suma.
    const [r] = computeRetentions(333_333_00, ['honorarios'], cfgDeclarante)
    expect(Number.isInteger(r.valueCents)).toBe(true)
    expect(r.valueCents).toBe(3_666_663)
  })

  it('ignora conceptos que no existen en el catálogo', () => {
    expect(computeRetentions(1_000_000_00, ['inventado' as never], cfgDeclarante)).toHaveLength(0)
  })
})

// ── Totales ─────────────────────────────────────────────────────────────────

describe('computeCuentaCobro', () => {
  const items = [
    { description: 'Desarrollo del portal', quantity: 1, unitCents: 3_000_000_00 },
    { description: 'Soporte', quantity: 2.5, unitCents: 200_000_00 },
  ]

  it('suma las líneas y no inventa impuestos', () => {
    const t = computeCuentaCobro(items, [], cfgDeclarante)
    expect(t.subtotalCents).toBe(3_500_000_00)
    expect(t.totalCents).toBe(3_500_000_00)
    expect(t.taxCents).toBe(0)
  })

  it('el IVA es cero por construcción, no un default sobrescribible', () => {
    // El invariante que define el documento: quien lo emite no es responsable
    // de IVA, así que no hay camino por el que aparezca un impuesto.
    expect(computeCuentaCobro(items, ['honorarios'], cfgDeclarante).taxCents).toBe(0)
    expect(computeCuentaCobro([], [], cfgDeclarante).taxCents).toBe(0)
  })

  it('el neto descuenta las retenciones pero el total cobrado sigue siendo el bruto', () => {
    const t = computeCuentaCobro(items, ['honorarios'], cfgDeclarante)
    expect(t.retentionsCents).toBe(385_000_00) // 11 % de 3.500.000
    expect(t.netCents).toBe(3_115_000_00)
    expect(t.totalCents).toBe(3_500_000_00) // el bruto no se toca
  })

  it('el neto es exactamente total menos la suma de lo impreso', () => {
    const t = computeCuentaCobro(items, ['honorarios', 'servicios'], cfgDeclarante)
    const suma = t.retentions.reduce((s, r) => s + r.valueCents, 0)
    expect(t.retentionsCents).toBe(suma)
    expect(t.netCents).toBe(t.totalCents - suma)
  })

  it('cantidades fraccionarias redondean a centavo entero por línea', () => {
    const t = computeCuentaCobro([{ description: 'Horas', quantity: 2.5, unitCents: 33_333 }], [])
    expect(t.subtotalCents).toBe(83_333) // 83.332,5 → 83.333
    expect(Number.isInteger(t.subtotalCents)).toBe(true)
  })
})

// ── Configuración ───────────────────────────────────────────────────────────

describe('parseCuentaCobroConfig', () => {
  it('lee tarifas en porcentaje y ReteICA en por mil', () => {
    const cfg = parseCuentaCobroConfig([
      { key: 'emisor_declarante', value: 'true' },
      { key: 'ret_honorarios_declarante', value: '10' },
      { key: 'ret_reteica_por_mil', value: '9.66' },
      { key: 'uvt_cents', value: '5300000' },
    ])
    expect(cfg.declarante).toBe(true)
    expect(cfg.uvtCents).toBe(5_300_000)
    expect(cfg.conceptos.find((c) => c.id === 'honorarios')!.rateDeclarante).toBeCloseTo(0.1)
    expect(cfg.conceptos.find((c) => c.id === 'reteica')!.rateDeclarante).toBeCloseTo(0.00966)
  })

  it('un valor basura cae al defecto en vez de tumbar el panel', () => {
    const cfg = parseCuentaCobroConfig([
      { key: 'uvt_cents', value: 'ocho mil' },
      { key: 'ret_honorarios_declarante', value: '-5' },
      { key: 'ret_servicios_base_uvt', value: '' },
    ])
    expect(cfg.uvtCents).toBe(UVT_2026_CENTS)
    expect(cfg.conceptos.find((c) => c.id === 'honorarios')!.rateDeclarante).toBe(0.11)
    expect(cfg.conceptos.find((c) => c.id === 'servicios')!.baseUvt).toBe(2)
  })

  it('la base mínima de servicios es configurable: cambió con el Decreto 572 de 2025', () => {
    const cfg = parseCuentaCobroConfig([{ key: 'ret_servicios_base_uvt', value: '4' }])
    expect(cfg.conceptos.find((c) => c.id === 'servicios')!.baseUvt).toBe(4)

    // Y ese cambio tiene efecto real en el cálculo, no solo en la config.
    const base = 3 * UVT_2026_CENTS
    expect(computeRetentions(base, ['servicios'], cfg)[0].applied).toBe(false)
    expect(computeRetentions(base, ['servicios'], CONFIG_DEFAULT)[0].applied).toBe(true)
  })

  it('sin ninguna fila, el catálogo por defecto queda intacto', () => {
    expect(parseCuentaCobroConfig([]).conceptos).toEqual(CONCEPTOS_DEFAULT)
  })
})

describe('parseEmisor / parseDeudor', () => {
  it('lee los datos del emisor de app_settings', () => {
    const e = parseEmisor([
      { key: 'emisor_nombre', value: '  Mike Rodríguez  ' },
      { key: 'emisor_cedula', value: '1000000000' },
      { key: 'emisor_declarante', value: 'true' },
    ])
    expect(e.nombre).toBe('Mike Rodríguez')
    expect(e.declarante).toBe(true)
    expect(e.banco).toBe('') // lo que falta queda vacío, no undefined
  })

  it('extrae el NIT del billing_info aunque la clave esté escrita de otra forma', () => {
    // Ese campo lo he llenado a mano durante meses y no tiene esquema.
    expect(parseDeudor('ACME', null, '{"NIT":"900.123.456-7"}').nit).toBe('900.123.456-7')
    expect(parseDeudor('ACME', null, '{"Documento":"800111222"}').nit).toBe('800111222')
    expect(parseDeudor('ACME', null, '{"Dirección":"Cra 7 #1-2"}').direccion).toBe('Cra 7 #1-2')
  })

  it('la razón social manda sobre el nombre de contacto de la ficha', () => {
    // En el CRM `name` suele ser la persona y `company` la empresa. Una cuenta
    // de cobro a nombre de "Juan Pérez" con el NIT de ACME la devuelve
    // contabilidad: el nombre y el documento no concuerdan.
    expect(parseDeudor('Juan Pérez', 'ACME S.A.S.', null).nombre).toBe('ACME S.A.S.')
  })

  it('sin empresa cae al nombre de la ficha (cliente persona natural)', () => {
    expect(parseDeudor('Juan Pérez', null, null).nombre).toBe('Juan Pérez')
    expect(parseDeudor('Juan Pérez', '   ', null).nombre).toBe('Juan Pérez')
  })

  it('un billing_info corrupto no lanza: devuelve campos vacíos', () => {
    expect(parseDeudor('ACME', null, '{roto').nit).toBe('')
    expect(parseDeudor('ACME', null, null).nombre).toBe('ACME')
  })
})

// ── Seguridad social ────────────────────────────────────────────────────────

describe('ibcSeguridadSocial', () => {
  it('cotiza sobre el 40 % del valor mensualizado', () => {
    expect(ibcSeguridadSocial(5_000_000_00).ibcCents).toBe(2_000_000_00)
  })

  it('aplica el piso de 1 SMMLV cuando el 40 % queda por debajo', () => {
    const r = ibcSeguridadSocial(2_000_000_00, 1_500_000_00)
    expect(r.ibcCents).toBe(800_000_00)
    expect(r.bajoPiso).toBe(true)
    expect(r.cotizableCents).toBe(1_500_000_00)
  })

  it('sin SMMLV configurado no inventa un piso', () => {
    const r = ibcSeguridadSocial(2_000_000_00)
    expect(r.pisoCents).toBe(null)
    expect(r.bajoPiso).toBe(false)
    expect(r.cotizableCents).toBe(800_000_00)
  })
})

// ── Fechas ──────────────────────────────────────────────────────────────────
// En Vercel el servidor corre en UTC. Los dos errores posibles son OPUESTOS y
// arreglar uno solo produce el otro, así que van juntos: un instante formateado
// sin zona salta al día siguiente, y una fecha de calendario anclada a UTC
// retrocede al anterior al mostrarse en Bogotá.

describe('fechas en zona de Colombia', () => {
  it('un documento emitido de noche en Colombia NO se fecha al día siguiente', () => {
    // 1 sep, 19:30 en Bogotá = 2 sep 00:30 UTC. Es el caso que se detectó en uso.
    const emision = new Date('2026-09-02T00:30:00Z')
    expect(formatFechaLarga(emision)).toBe('01 de septiembre de 2026')
  })

  it('una fecha de calendario no retrocede un día al imprimirse', () => {
    // El error inverso: 'YYYY-MM-DD' leído como medianoche UTC cae el día
    // anterior en Bogotá, y el periodo de agosto empezaría el 31 de julio.
    const inicio = parseFechaCalendario('2026-08-01')!
    expect(formatFechaLarga(inicio)).toBe('01 de agosto de 2026')
    expect(formatFechaCorta(inicio)).toContain('2026')
  })

  it('un cierre de mes se mantiene en su mes', () => {
    expect(formatFechaLarga(parseFechaCalendario('2026-08-31'))).toBe('31 de agosto de 2026')
    expect(formatFechaLarga(parseFechaCalendario('2026-01-01'))).toBe('01 de enero de 2026')
  })

  it('ancla las fechas de calendario a medianoche colombiana, no a UTC', () => {
    // 00:00 en Bogotá (UTC-5) son las 05:00 UTC del mismo día.
    expect(parseFechaCalendario('2026-08-01')!.toISOString()).toBe('2026-08-01T05:00:00.000Z')
  })

  it('respeta un instante completo cuando ya viene con zona', () => {
    expect(parseFechaCalendario('2026-09-02T00:30:00Z')!.toISOString()).toBe('2026-09-02T00:30:00.000Z')
  })

  it('una fecha inválida es null, nunca un Invalid Date que llegue a la base', () => {
    for (const v of ['', '   ', 'ayer', '2026-13-45', null, undefined, 42]) {
      expect(parseFechaCalendario(v)).toBeNull()
    }
  })

  it('sin fecha, el formateo no imprime "Invalid Date"', () => {
    expect(formatFechaLarga(null)).toBe('')
    expect(formatFechaCorta(null)).toBe('-')
  })
})

// ── Identificación de las partes ────────────────────────────────────────────
// ── Dirección del documento ─────────────────────────────────────────────────
// La fórmula colombiana es "[DEUDOR] DEBE A [EMISOR]": el rótulo "DEBE A"
// encabeza a quien COBRA. Invertirlo no rompe nada visible, solo convierte la
// cuenta de cobro en un reconocimiento de deuda propia, y eso lo detecta el
// cliente, no el compilador.

describe('bloquesIdentificacion', () => {
  const deudor = { nombre: 'Antídoto Colombia', nit: '901777384-6', direccion: 'Cra 7 #1-2', ciudad: 'Bogotá D.C.' }

  it('el deudor va primero, bajo SEÑORES', () => {
    const [primero] = bloquesIdentificacion(emisorOk, deudor)
    expect(primero.rotulo).toBe('SEÑORES')
    expect(primero.papel).toBe('deudor')
    expect(primero.nombre).toBe('Antídoto Colombia')
  })

  it('DEBE A encabeza al EMISOR, que es quien cobra', () => {
    const [, segundo] = bloquesIdentificacion(emisorOk, deudor)
    expect(segundo.rotulo).toBe('DEBE A')
    expect(segundo.papel).toBe('emisor')
    expect(segundo.nombre).toBe(emisorOk.nombre)
  })

  it('nunca pone al deudor bajo el rótulo DEBE A', () => {
    const debeA = bloquesIdentificacion(emisorOk, deudor).find((b) => b.rotulo === 'DEBE A')
    expect(debeA!.nombre).not.toBe(deudor.nombre)
    expect(debeA!.documento).not.toContain(deudor.nit)
  })

  it('cada parte lleva su documento con el prefijo que le corresponde', () => {
    const [señores, debeA] = bloquesIdentificacion(emisorOk, deudor)
    expect(señores.documento).toBe('NIT/C.C. 901777384-6')
    expect(debeA.documento).toBe(`C.C. ${emisorOk.cedula}`)
  })

  it('omite las líneas vacías en vez de dejar huecos en el documento', () => {
    const [señores] = bloquesIdentificacion(emisorOk, { nombre: 'X', nit: '1', direccion: '', ciudad: '' })
    expect(señores.lineas).toEqual([])
  })
})

// ── Validación ──────────────────────────────────────────────────────────────

const emisorOk: Emisor = {
  nombre: 'Mike Rodríguez',
  cedula: '1000000000',
  direccion: 'Cra 1 #2-3',
  ciudad: 'Bogotá',
  telefono: '+573000000000',
  email: 'mike@codebymike.tech',
  banco: 'Bancolombia',
  tipoCuenta: 'Ahorros',
  numeroCuenta: '12345678901',
  declarante: false,
}

const draftOk = {
  docType: 'cuenta_cobro',
  concept: 'Desarrollo del portal de clientes, agosto de 2026',
  city: 'Bogotá',
  items: [{ description: 'Desarrollo', quantity: 1, unitCents: 3_000_000_00 }],
  emisor: emisorOk,
  deudor: { nombre: 'ACME S.A.S.', nit: '900123456-7', direccion: 'Cra 7 #1-2', ciudad: 'Bogotá' },
}

describe('validateCuentaCobro', () => {
  it('un borrador completo no tiene problemas', () => {
    expect(validateCuentaCobro(draftOk)).toEqual([])
  })

  // Estos campos no son burocracia del formulario: son exactamente lo que el
  // pagador necesita para generar su Documento Soporte (Res. DIAN 000167/2021).
  // Sin ellos, contabilidad devuelve el documento.
  it.each([
    ['cédula del emisor', { emisor: { ...emisorOk, cedula: '' } }, 'cédula'],
    ['dirección del emisor', { emisor: { ...emisorOk, direccion: '' } }, 'dirección'],
    ['banco', { emisor: { ...emisorOk, banco: '' } }, 'banco'],
    ['número de cuenta', { emisor: { ...emisorOk, numeroCuenta: '' } }, 'número de cuenta'],
    ['NIT del deudor', { deudor: { ...draftOk.deudor, nit: '' } }, 'NIT'],
    ['concepto', { concept: '  ' }, 'concepto detallado'],
    ['ciudad de expedición', { city: null }, 'ciudad de expedición'],
  ])('exige %s', (_nombre, parche, fragmento) => {
    const errs = validateCuentaCobro({ ...draftOk, ...parche })
    expect(errs.join(' | ')).toContain(fragmento)
  })

  it('rechaza el IVA: es el invariante del documento', () => {
    expect(validateCuentaCobro({ ...draftOk, taxCents: 1 }).join(' ')).toContain('no lleva IVA')
  })

  it('rechaza un documento que no es cuenta de cobro', () => {
    expect(validateCuentaCobro({ ...draftOk, docType: 'factura' }).join(' ')).toContain('tipo de documento')
  })

  it('exige líneas válidas y total positivo', () => {
    expect(validateCuentaCobro({ ...draftOk, items: [] }).join(' ')).toContain('al menos un concepto')
    expect(
      validateCuentaCobro({ ...draftOk, items: [{ description: '', quantity: 1, unitCents: 100 }] }).join(' ')
    ).toContain('sin descripción')
    expect(
      validateCuentaCobro({ ...draftOk, items: [{ description: 'x', quantity: 1, unitCents: 0 }] }).join(' ')
    ).toContain('mayor que cero')
  })
})

// ── Tope de responsabilidad de IVA ──────────────────────────────────────────

describe('topeIva', () => {
  it('el tope son 3.500 UVT del año configurado', () => {
    expect(topeIva(0).topeCents).toBe(3500 * UVT_2026_CENTS) // $183.309.000
  })

  it('escala de niveles: ok → aviso (70 %) → alerta (90 %) → superado', () => {
    const tope = 3500 * UVT_2026_CENTS
    expect(topeIva(tope * 0.5).nivel).toBe('ok')
    expect(topeIva(tope * 0.75).nivel).toBe('aviso')
    expect(topeIva(tope * 0.95).nivel).toBe('alerta')
    expect(topeIva(tope).nivel).toBe('superado')
    expect(topeIva(tope * 1.2).nivel).toBe('superado')
  })

  it('sin nada emitido no alarma', () => {
    expect(topeIva(0).nivel).toBe('ok')
    expect(topeIva(-5).emitidoCents).toBe(0)
  })
})
