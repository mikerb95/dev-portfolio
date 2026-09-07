// Consolidación del consumo medido en periodos facturables. Capa con BD: la
// aritmética está en `calculo.ts` y `periodo.ts`, aquí solo se lee, se agrega y
// se escribe.

import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  computeBatches, computePeriods, computeRates, computeTerms, computeUsageHourly, projects,
} from '../../db/schema'
import { calcularCobro, factorDesdeFactura, type TerminosCobro, type UsoComputo } from './calculo'
import { tarifasVigentes, type FilaTarifas } from './tarifas'
import { clavePeriodo, inicioISO, periodoAnterior, rangoPeriodo, type ClavePeriodo } from './periodo'

/** Consumo agregado de un proyecto en un periodo, leído de las filas horarias. */
export interface ConsumoProyecto extends UsoComputo {
  projectId: number
}

/**
 * Suma las horas de un periodo, agrupando en SQL y no en JS.
 *
 * El GROUP BY lo hace SQLite a propósito: Turso factura filas ESCANEADAS, y
 * aunque agrupar no reduce el escaneo, sí reduce a una fila por proyecto lo que
 * cruza la red y lo que hay que mantener en memoria de la función. El índice
 * `compute_usage_hour_idx` acota el escaneo al mes.
 */
export async function consumoDelPeriodo(clave: ClavePeriodo): Promise<ConsumoProyecto[]> {
  const { desde, hasta } = rangoPeriodo(clave)
  const filas = await db
    .select({
      projectId: computeUsageHourly.projectId,
      cpuMs: sql<number>`sum(${computeUsageHourly.cpuMs})`,
      gbMs: sql<number>`sum(${computeUsageHourly.gbMs})`,
      invocaciones: sql<number>`sum(${computeUsageHourly.invocations})`,
      transferenciaBytes: sql<number>`sum(${computeUsageHourly.transferBytes})`,
      transferenciaOrigenBytes: sql<number>`sum(${computeUsageHourly.originTransferBytes})`,
      edgeRequests: sql<number>`sum(${computeUsageHourly.edgeRequests})`,
    })
    .from(computeUsageHourly)
    .where(and(gte(computeUsageHourly.hour, new Date(desde)), lt(computeUsageHourly.hour, new Date(hasta))))
    .groupBy(computeUsageHourly.projectId)

  return filas.map((f) => ({
    projectId: f.projectId,
    cpuMs: Number(f.cpuMs) || 0,
    gbMs: Number(f.gbMs) || 0,
    invocaciones: Number(f.invocaciones) || 0,
    transferenciaBytes: Number(f.transferenciaBytes) || 0,
    transferenciaOrigenBytes: Number(f.transferenciaOrigenBytes) || 0,
    edgeRequests: Number(f.edgeRequests) || 0,
  }))
}

/** Términos de cobro por proyecto, en la forma que espera `calcularCobro`. */
export async function terminosPorProyecto(): Promise<Map<number, TerminosCobro & { activo: boolean }>> {
  const filas = await db.select().from(computeTerms)
  return new Map(
    filas.map((f) => [
      f.projectId,
      {
        margenPct: f.margenPct,
        minimoUsd: f.minimoUsd ?? undefined,
        incluido: {
          cpuMs: f.incluidoCpuMs,
          gbMs: f.incluidoGbMs,
          invocaciones: f.incluidoInvocaciones,
          transferenciaBytes: f.incluidoTransferBytes,
        },
        activo: f.active,
      },
    ]),
  )
}

export async function filasDeTarifas(): Promise<FilaTarifas[]> {
  const filas = await db.select().from(computeRates)
  return filas.map((f) => ({
    vigenteDesde: f.vigenteDesde,
    cpuActivaHora: f.cpuActivaHora,
    memoriaGbHora: f.memoriaGbHora,
    invocacionesMillon: f.invocacionesMillon,
    transferenciaGb: f.transferenciaGb,
    transferenciaOrigenGb: f.transferenciaOrigenGb,
    edgeRequestsMillon: f.edgeRequestsMillon,
    fuente: f.fuente,
  }))
}

/**
 * Factor de reconciliación heredado del último periodo cerrado que tenga
 * cargada la factura real de Vercel.
 *
 * Se busca hacia atrás y no solo en el mes anterior porque cargar la factura es
 * un acto manual que se puede olvidar un mes. Devuelve 1 si no hay ninguna:
 * sin dato real, la mejor estimación es la medición cruda.
 */
export async function factorHeredado(projectId: number, clave: ClavePeriodo, saltos = 6): Promise<number> {
  let cursor = periodoAnterior(clave)
  for (let i = 0; i < saltos; i++) {
    const fila = (
      await db
        .select({ medido: computePeriods.costoMedidoUsd, real: computePeriods.facturaRealUsd })
        .from(computePeriods)
        .where(and(eq(computePeriods.projectId, projectId), eq(computePeriods.periodo, cursor)))
        .limit(1)
    )[0]
    if (fila?.real != null) {
      const factor = factorDesdeFactura(fila.medido, fila.real)
      if (factor !== null) return factor
    }
    cursor = periodoAnterior(cursor)
  }
  return 1
}

export interface ResultadoRollup {
  periodo: ClavePeriodo
  proyectos: number
  omitidos: number
  totalUsd: number
}

/**
 * Recalcula y reescribe las filas de `compute_periods` de un periodo.
 *
 * Idempotente: se puede correr veinte veces sobre el mismo mes y el resultado
 * es el mismo, porque parte siempre de las horas y no de lo ya escrito. Los
 * periodos en estado `facturado` NO se tocan: esa cifra ya se le envió a una
 * empresa y no puede moverse porque alguien reajustó un margen.
 */
export async function recalcularPeriodo(clave: ClavePeriodo): Promise<ResultadoRollup> {
  const [consumos, terminos, tarifasFilas] = await Promise.all([
    consumoDelPeriodo(clave),
    terminosPorProyecto(),
    filasDeTarifas(),
  ])
  const tarifas = tarifasVigentes(tarifasFilas, inicioISO(clave))
  const ahora = new Date()

  let proyectos = 0
  let omitidos = 0
  let totalUsd = 0

  for (const consumo of consumos) {
    const term = terminos.get(consumo.projectId)
    // Sin términos cargados no hay margen ni cuota que aplicar. Se omite en vez
    // de asumir margen 0: una factura silenciosamente sin margen es peor que
    // una fila que falta y se ve.
    if (!term || !term.activo) {
      omitidos++
      continue
    }

    const existente = (
      await db
        .select({ estado: computePeriods.estado })
        .from(computePeriods)
        .where(and(eq(computePeriods.projectId, consumo.projectId), eq(computePeriods.periodo, clave)))
        .limit(1)
    )[0]
    if (existente?.estado === 'facturado') {
      omitidos++
      continue
    }

    const factor = await factorHeredado(consumo.projectId, clave)
    const cobro = calcularCobro(consumo, tarifas, { ...term, factorReconciliacion: factor })

    const valores = {
      projectId: consumo.projectId,
      periodo: clave,
      cpuMs: consumo.cpuMs,
      gbMs: consumo.gbMs,
      invocations: consumo.invocaciones,
      transferBytes: consumo.transferenciaBytes,
      originTransferBytes: consumo.transferenciaOrigenBytes,
      edgeRequests: consumo.edgeRequests,
      costoMedidoUsd: cobro.costoMedidoUsd,
      factorReconciliacion: cobro.factorReconciliacion,
      costoUsd: cobro.costoUsd,
      margenPct: term.margenPct,
      totalUsd: cobro.totalUsd,
      updatedAt: ahora,
    }

    await db
      .insert(computePeriods)
      .values(valores)
      .onConflictDoUpdate({
        target: [computePeriods.projectId, computePeriods.periodo],
        // `estado`, `facturaRealUsd` e `invoiceId` quedan fuera del SET a
        // propósito: son decisiones humanas (cerrar, cargar la factura,
        // adjuntar la cuenta de cobro) y un recálculo automático no las revoca.
        set: valores,
      })

    proyectos++
    totalUsd += cobro.totalUsd
  }

  return { periodo: clave, proyectos, omitidos, totalUsd }
}

/**
 * Borra las marcas de lote más viejas que la ventana de antigüedad que acepta
 * el validador. Pasado ese punto un lote repetido ya se rechaza por fecha, así
 * que la marca no aporta nada y la tabla crecería sin techo.
 */
export async function limpiarLotes(ahora: number, dias = 40): Promise<void> {
  await db.delete(computeBatches).where(lt(computeBatches.receivedAt, new Date(ahora - dias * 86_400_000)))
}

/** Proyectos con medición activa, para el panel. */
export async function proyectosMedidos() {
  return db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      clientId: projects.clientId,
      vercelProjectId: projects.vercelProjectId,
      margenPct: computeTerms.margenPct,
      activo: computeTerms.active,
      tieneSecreto: sql<number>`case when ${computeTerms.ingestSecret} is null then 0 else 1 end`,
    })
    .from(computeTerms)
    .innerJoin(projects, eq(projects.id, computeTerms.projectId))
    .orderBy(projects.title)
}

export { clavePeriodo }
