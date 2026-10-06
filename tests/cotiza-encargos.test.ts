import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Encargos de Cotiza contra libSQL en archivo temporal, con las tablas creadas
// por el SQL de las migraciones REALES (drizzle/0045 y 0046): si la migración y el schema
// se separan, este test lo dice antes que producción.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `cotiza-encargos-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  ErrorEncargo,
  aceptar,
  cerrar,
  congelar,
  crearAdicionalManual,
  crearEncargo,
  decidirAdicional,
  descartar,
  detalle,
  encargo,
  guardarConfig,
  listarEncargos,
  reabrir,
  registrarReunion,
  registrarRonda,
  registrarSolicitud,
  type Encargo,
} from '../src/lib/cotiza/db'
import { configVacia, instanteDesdeBogota, normalizarConfig, puede, type ConfigEncargo } from '../src/lib/cotiza/encargo'
import { huellaSnapshot } from '../src/lib/plano/hash'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  // Reloj fijo: las fechas de los casos (octubre de 2026) no pueden depender
  // del día en que se corra la suite. Solo se finge Date, no los temporizadores
  // que usa el cliente de libSQL.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  for (const archivo of ['0045_low_dormammu.sql', '0046_woozy_dark_phoenix.sql']) {
    const sqlMigracion = readFileSync(join(__dirname, '..', 'drizzle', archivo), 'utf8')
    for (const sentencia of sqlMigracion.split('--> statement-breakpoint')) {
      if (sentencia.trim()) await client.execute(sentencia)
    }
  }
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  for (const t of ['cotiza_adicionales', 'cotiza_rondas', 'cotiza_reuniones', 'cotiza_solicitudes', 'cotiza_encargos']) {
    await client.execute(`DELETE FROM ${t}`)
  }
})

const CONFIG: ConfigEncargo = {
  titulo: 'Presentaciones y revisión para la junta',
  cliente: { nombre: 'Laura Gómez', empresa: 'Importadora Andina', contacto: '3001112233' },
  moneda: 'COP',
  entregables: [
    { tipo: 'presentacion', nombre: 'Informe de importaciones para la junta', diapositivas: 15, anexos: true, documentosFuente: 4, cantidad: 2 },
    { tipo: 'revision', nombre: 'Revisión de contratos de transporte', documentos: 6, paginasPorDocumento: 20 },
    { tipo: 'libre', nombre: 'Costeo de importación', nivel: 'analitica', horas: 6 },
  ],
  exclusiones: ['Negociación directa con navieras'],
  supuestos: ['El cliente entrega las facturas en PDF'],
  notas: 'Cliente que suele pedir cosas por WhatsApp de noche',
}

async function aceptado(): Promise<Encargo> {
  const e = await crearEncargo(CONFIG)
  await congelar(e)
  return aceptar((await encargo(e.id))!)
}

const recargar = async (e: Encargo) => (await encargo(e.id))!

describe('estados', () => {
  it('matriz de acciones', () => {
    expect(puede('borrador', 'congelar')).toBe(true)
    expect(puede('borrador', 'solicitud')).toBe(false)
    expect(puede('enviado', 'guardar')).toBe(false)
    expect(puede('aceptado', 'reabrir')).toBe(false)
    expect(puede('aceptado', 'reunion')).toBe(true)
    expect(puede('cerrado', 'solicitud')).toBe(false)
    expect(puede('descartado', 'reabrir')).toBe(false)
  })

  it('no congela sin lo mínimo: título, cliente, entregables y una exclusión', async () => {
    const e = await crearEncargo(configVacia())
    await expect(congelar(e)).rejects.toThrow(/título.*cliente.*entregable.*exclusión/)
  })

  it('congelar recalcula en el servidor y guarda el resultado con su huella', async () => {
    // Una cifra metida en la configuración no llega a ninguna parte.
    const e = await crearEncargo({ ...CONFIG, precio: 1 } as unknown as ConfigEncargo)
    const f = await congelar(e)
    expect(f.estado).toBe('enviado')
    expect(f.precio).toBe(850_000)
    const snap = JSON.parse(f.snapshot!)
    expect(huellaSnapshot(snap)).toBe(f.huella)
    expect(snap.cotizacion.tarifas.hora.documental).toBe(50_000)
    // Las notas privadas no se congelan: el snapshot es lo que vio el cliente.
    expect(f.snapshot).not.toContain('WhatsApp de noche')
  })

  it('un entregable inválido no se congela y explica por qué', async () => {
    const e = await crearEncargo({ ...CONFIG, entregables: [{ tipo: 'libre', nombre: 'x', nivel: 'analitica', horas: 1.3 }] })
    await expect(congelar(e)).rejects.toThrow(/horas inválidas/)
  })

  it('después de congelar no se edita; reabrir borra lo congelado; aceptado ya no se reabre', async () => {
    const e = await crearEncargo(CONFIG)
    const enviado = await congelar(e)
    await expect(guardarConfig(enviado, CONFIG)).rejects.toMatchObject({ status: 409 })
    const borrador = await reabrir(enviado)
    expect(borrador.snapshot).toBeNull()
    expect(borrador.precio).toBeNull()
    const ok = await aceptar(await congelar(borrador))
    await expect(reabrir(ok)).rejects.toMatchObject({ status: 409 })
    await expect(guardarConfig(ok, CONFIG)).rejects.toBeInstanceOf(ErrorEncargo)
  })

  it('dos clics cruzados: el segundo choca con el estado nuevo', async () => {
    const e = await congelar(await crearEncargo(CONFIG))
    await aceptar(e)
    // `e` es la lectura vieja (enviado): reabrir con ella no debe pasar.
    await expect(reabrir(e)).rejects.toMatchObject({ status: 409 })
    expect((await recargar(e)).estado).toBe('aceptado')
  })

  it('cerrar y descartar son finales', async () => {
    const c = await cerrar(await aceptado())
    await expect(registrarReunion(c, { fecha: '2026-10-01', minutos: 30 })).rejects.toMatchObject({ status: 409 })
    const d = await descartar(await crearEncargo(CONFIG))
    expect(d.estado).toBe('descartado')
  })
})

describe('bitácora', () => {
  it('un pedido dentro del alcance no genera adicional', async () => {
    const e = await aceptado()
    const r = await registrarSolicitud(e, { pedidoEl: '2026-10-06T10:00', canal: 'whatsapp', texto: 'Que el informe tenga el logo', clasificacion: 'dentro' })
    expect(r.adicional).toBeNull()
  })

  it('un pedido adicional a las 7:30 p. m. lleva recargo de urgencia (hora de Bogotá)', async () => {
    const e = await aceptado()
    const r = await registrarSolicitud(e, {
      pedidoEl: '2026-10-06T19:30',
      canal: 'whatsapp',
      texto: 'Agrégale un análisis de proveedores alternos',
      clasificacion: 'adicional',
      horas: 2,
      nivel: 'analitica',
    })
    // 2 h × 70.000 = 140.000, +50 % = 210.000
    expect(r.adicional).toMatchObject({ origen: 'solicitud', urgente: true, monto: 210_000, estado: 'propuesto' })
  })

  it('el mismo pedido a las 10 a. m. no lleva recargo; precios que mande el navegador se ignoran', async () => {
    const e = await aceptado()
    const r = await registrarSolicitud(e, {
      pedidoEl: '2026-10-06T10:00',
      canal: 'correo',
      texto: 'Análisis de proveedores',
      clasificacion: 'adicional',
      horas: 2,
      nivel: 'analitica',
      monto: 1,
      tarifa: 1,
    })
    expect(r.adicional?.monto).toBe(140_000)
  })

  it('rechaza pedidos del futuro, canales inventados y fechas imposibles', async () => {
    const e = await aceptado()
    const base = { canal: 'whatsapp', texto: 'x', clasificacion: 'dentro' }
    await expect(registrarSolicitud(e, { ...base, pedidoEl: '2099-01-01T10:00' })).rejects.toThrow(/futuro/)
    await expect(registrarSolicitud(e, { ...base, pedidoEl: '2026-02-31T10:00' })).rejects.toThrow(/inválidas/)
    await expect(registrarSolicitud(e, { ...base, pedidoEl: '2026-10-06T10:00', canal: 'paloma' })).rejects.toThrow(/canal/)
  })

  it('dos reuniones entran; la tercera nace como adicional al nivel del encargo', async () => {
    const e = await aceptado()
    expect((await registrarReunion(e, { fecha: '2026-10-01', minutos: 40, resumen: 'Arranque' })).adicional).toBeNull()
    expect((await registrarReunion(e, { fecha: '2026-10-02', minutos: 45 })).adicional).toBeNull()
    const r = await registrarReunion(e, { fecha: '2026-10-03', minutos: 60 })
    // 1 h al nivel analítico (empata en horas con el documental y gana el más alto)
    expect(r.adicional).toMatchObject({ origen: 'reunion_extra', horas: 1, nivel: 'analitica', monto: 70_000 })
  })

  it('una reunión incluida que se alarga: el exceso, en bloques de 30 min', async () => {
    const e = await aceptado()
    const r = await registrarReunion(e, { fecha: '2026-10-01', minutos: 70 })
    expect(r.adicional).toMatchObject({ origen: 'reunion_larga', horas: 0.5, monto: 35_000 })
  })

  it('el plazo para corregir el resumen salta el festivo', async () => {
    const e = await aceptado()
    await registrarReunion(e, { fecha: '2026-10-09', minutos: 30 })
    const d = await detalle(e.id)
    expect(d!.reuniones[0].plazoCorreccion).toBe('2026-10-13')
  })

  it('la tercera ronda de un entregable exige las horas de Mike y nace como adicional', async () => {
    const e = await aceptado()
    expect((await registrarRonda(e, { entregable: 0 })).adicional).toBeNull()
    expect((await registrarRonda(e, { entregable: 0 })).adicional).toBeNull()
    await expect(registrarRonda(e, { entregable: 0, nota: 'cambiar colores' })).rejects.toThrow(/horas/)
    const r = await registrarRonda(e, { entregable: 0, nota: 'cambiar colores', horas: 1 })
    expect(r.adicional).toMatchObject({ origen: 'ronda_extra', monto: 50_000 })
    // Otro entregable tiene sus propias rondas.
    expect((await registrarRonda(e, { entregable: 1 })).adicional).toBeNull()
    await expect(registrarRonda(e, { entregable: 9 })).rejects.toThrow(/entregable/)
  })

  it('decidir: una vez, y solo adicionales de este encargo', async () => {
    const e = await aceptado()
    const otro = await aceptado()
    const a = await crearAdicionalManual(e, { descripcion: 'Formato extra del informe', horas: 1, nivel: 'documental', urgente: false })
    await expect(decidirAdicional(otro, a.id, 'aprobado')).rejects.toMatchObject({ status: 409 })
    expect((await decidirAdicional(e, a.id, 'aprobado')).estado).toBe('aprobado')
    await expect(decidirAdicional(e, a.id, 'rechazado')).rejects.toMatchObject({ status: 409 })
  })

  it('el total suma los aprobados sin tocar el precio pactado', async () => {
    const e = await aceptado()
    const a = await crearAdicionalManual(e, { descripcion: 'Uno', horas: 1, nivel: 'documental' })
    await crearAdicionalManual(e, { descripcion: 'Dos', horas: 2, nivel: 'documental' })
    await decidirAdicional(e, a.id, 'aprobado')
    const d = await detalle(e.id)
    expect(d!.total).toEqual({ base: 850_000, aprobados: 50_000, propuestos: 100_000, total: 900_000 })
    expect(d!.encargo.precio).toBe(850_000)
    const [fila] = await listarEncargos()
    expect(fila).toMatchObject({ aprobados: 50_000, propuestos: 100_000, reunionesUsadas: 0 })
  })

  it('el consumo de cupos cuenta en el orden en que se anotaron', async () => {
    const e = await aceptado()
    await registrarReunion(e, { fecha: '2026-10-05', minutos: 30 })
    await registrarReunion(e, { fecha: '2026-10-06', minutos: 30 })
    // Anotada tarde con fecha vieja: es la tercera, no le quita el cupo a nadie.
    const r = await registrarReunion(e, { fecha: '2026-10-01', minutos: 30 })
    expect(r.adicional?.origen).toBe('reunion_extra')
    const d = await detalle(e.id)
    expect(d!.consumo!.excedentes).toEqual([{ tipo: 'reunion_extra', reunion: 3, minutos: 30 }])
  })
})

describe('forma de los datos', () => {
  it('normalizarConfig descarta lo que no tiene forma y recorta textos', () => {
    const c = normalizarConfig({
      titulo: 'x'.repeat(500),
      moneda: 'EUR',
      entregables: [{ tipo: 'hackeo' }, null, { tipo: 'libre', nombre: 'Algo', nivel: 'jefe', horas: '3' }],
      exclusiones: ['', '  uno  ', 5],
    })
    expect(c.titulo).toHaveLength(160)
    expect(c.moneda).toBe('COP')
    expect(c.entregables).toEqual([{ tipo: 'libre', nombre: 'Algo', nivel: 'operativa', horas: 3 }])
    expect(c.exclusiones).toEqual(['uno'])
  })

  it('la hora del formulario se lee en Bogotá', () => {
    expect(instanteDesdeBogota('2026-10-06T19:30')?.toISOString()).toBe('2026-10-07T00:30:00.000Z')
    for (const v of ['2026-10-06', '2026-13-01T10:00', '2026-02-30T10:00', '2026-10-06T25:00', 5, null]) {
      expect(instanteDesdeBogota(v), String(v)).toBeNull()
    }
  })
})
