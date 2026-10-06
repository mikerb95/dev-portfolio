// Persistencia de Cotiza (docs/plan-cotiza.md, Fase 2). El cálculo vive en
// motor.ts y las reglas de estado en encargo.ts; aquí solo se lee y se escribe.
//
// Dos garantías que este módulo sostiene y los tests comprueban:
//
//  1. Ninguna cifra viene del navegador. Al congelar, el servidor recalcula la
//     propuesta desde la configuración; los adicionales se calculan con las
//     tarifas CONGELADAS del encargo.
//  2. Las transiciones son condicionales (`WHERE estado = ...`): dos clics
//     cruzados no pueden, por ejemplo, reabrir una propuesta que se acaba de
//     aceptar.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { cotizaAdicionales, cotizaEncargos, cotizaReuniones, cotizaRondas, cotizaSolicitudes } from '../../db/schema'
import type { NivelConsultoria } from '../../data/cotiza'
import { NIVELES } from '../../data/cotiza'
import { fechaISOEnColombia } from '../fecha-co'
import { esFechaISO, fechaCorta } from '../plano/fechas'
import { huellaSnapshot } from '../plano/hash'
import {
  CANALES,
  CLASIFICACIONES,
  ESTADO_TRAS,
  faltantesParaCongelar,
  instanteDesdeBogota,
  normalizarConfig,
  puede,
  type AccionEncargo,
  type Canal,
  type Clasificacion,
  type ConfigEncargo,
  type EstadoEncargo,
} from './encargo'
import {
  ErrorCotiza,
  consumoDeCupos,
  cotizar,
  fueraDeHorario,
  nivelDelEncargo,
  plazoCorreccion,
  precioAdicional,
  precioExcedente,
  totalVigente,
  type ConsumoCupos,
  type Excedente,
  type CotizacionConsultoria,
  type PrecioAdicional,
  type TotalVigente,
} from './motor'

export type Encargo = typeof cotizaEncargos.$inferSelect
export type Solicitud = typeof cotizaSolicitudes.$inferSelect
export type Reunion = typeof cotizaReuniones.$inferSelect
export type Ronda = typeof cotizaRondas.$inferSelect
export type Adicional = typeof cotizaAdicionales.$inferSelect

/** Lo que se congela: el resultado y el texto que el cliente aceptó. Sin las notas privadas. */
export type SnapshotEncargo = {
  titulo: string
  cliente: ConfigEncargo['cliente']
  exclusiones: string[]
  supuestos: string[]
  cotizacion: CotizacionConsultoria
  congeladoEl: string
}

/** Error con el código HTTP que le corresponde: lo traduce el endpoint. */
export class ErrorEncargo extends Error {
  constructor(
    mensaje: string,
    readonly status = 400
  ) {
    super(mensaje)
    this.name = 'ErrorEncargo'
  }
}

const hoyCO = (): string => fechaISOEnColombia(new Date())

export function configDe(e: Pick<Encargo, 'config'>): ConfigEncargo {
  try {
    return normalizarConfig(JSON.parse(e.config))
  } catch {
    return normalizarConfig(null)
  }
}

export function snapshotDe(e: Pick<Encargo, 'snapshot'>): SnapshotEncargo | null {
  if (!e.snapshot) return null
  try {
    return JSON.parse(e.snapshot) as SnapshotEncargo
  } catch {
    return null
  }
}

// ── Encargos ────────────────────────────────────────────────────────────────

export async function crearEncargo(config: ConfigEncargo): Promise<Encargo> {
  const ahora = new Date()
  const [fila] = await db
    .insert(cotizaEncargos)
    .values({
      titulo: config.titulo || 'Encargo sin título',
      clienteNombre: config.cliente.nombre,
      clienteEmpresa: config.cliente.empresa || null,
      clienteContacto: config.cliente.contacto || null,
      moneda: config.moneda,
      config: JSON.stringify(config),
      creadoEl: ahora,
      actualizadoEl: ahora,
    })
    .returning()
  return fila
}

export async function encargo(id: number): Promise<Encargo | null> {
  const [fila] = await db.select().from(cotizaEncargos).where(eq(cotizaEncargos.id, id)).limit(1)
  return fila ?? null
}

function exigir(e: Encargo, accion: AccionEncargo): void {
  if (!puede(e.estado as EstadoEncargo, accion)) {
    throw new ErrorEncargo(`no se puede "${accion}" un encargo en estado ${e.estado}`, 409)
  }
}

/** Cambia el estado solo si sigue siendo el que se leyó. */
async function transicionar(e: Encargo, accion: AccionEncargo, extra: Partial<Encargo> = {}): Promise<Encargo> {
  exigir(e, accion)
  const destino = ESTADO_TRAS[accion]
  if (!destino) throw new ErrorEncargo(`acción sin transición: ${accion}`, 500)
  const [fila] = await db
    .update(cotizaEncargos)
    .set({ ...extra, estado: destino, actualizadoEl: new Date() })
    .where(and(eq(cotizaEncargos.id, e.id), eq(cotizaEncargos.estado, e.estado)))
    .returning()
  if (!fila) throw new ErrorEncargo('el encargo cambió mientras tanto; recarga la página', 409)
  return fila
}

export async function guardarConfig(e: Encargo, raw: unknown): Promise<Encargo> {
  exigir(e, 'guardar')
  const config = normalizarConfig(raw)
  const [fila] = await db
    .update(cotizaEncargos)
    .set({
      titulo: config.titulo || 'Encargo sin título',
      clienteNombre: config.cliente.nombre,
      clienteEmpresa: config.cliente.empresa || null,
      clienteContacto: config.cliente.contacto || null,
      moneda: config.moneda,
      config: JSON.stringify(config),
      actualizadoEl: new Date(),
    })
    .where(and(eq(cotizaEncargos.id, e.id), eq(cotizaEncargos.estado, 'borrador')))
    .returning()
  if (!fila) throw new ErrorEncargo('el encargo ya no es un borrador; recarga la página', 409)
  return fila
}

/**
 * Congela la propuesta: recalcula en el servidor con las tarifas y los cupos
 * de hoy, y guarda el resultado completo con su huella. Lo que el navegador
 * haya mostrado no cuenta.
 */
export async function congelar(e: Encargo): Promise<Encargo> {
  exigir(e, 'congelar')
  const config = configDe(e)
  const faltan = faltantesParaCongelar(config)
  if (faltan.length) throw new ErrorEncargo(`falta ${faltan.join(', ')}`)
  let cotizacion: CotizacionConsultoria
  try {
    cotizacion = cotizar({ moneda: config.moneda, entregables: config.entregables })
  } catch (err) {
    if (err instanceof ErrorCotiza) throw new ErrorEncargo(err.message)
    throw err
  }
  const snapshot: SnapshotEncargo = {
    titulo: config.titulo,
    cliente: config.cliente,
    exclusiones: config.exclusiones,
    supuestos: config.supuestos,
    cotizacion,
    congeladoEl: new Date().toISOString(),
  }
  return transicionar(e, 'congelar', {
    snapshot: JSON.stringify(snapshot),
    huella: huellaSnapshot(snapshot),
    precio: cotizacion.precio,
    enviadoEl: new Date(),
  })
}

/** Vuelve a borrador antes de aceptar. Borra lo congelado: la próxima vez se congela de nuevo. */
export const reabrir = (e: Encargo) => transicionar(e, 'reabrir', { snapshot: null, huella: null, precio: null, enviadoEl: null })
export const aceptar = (e: Encargo) => transicionar(e, 'aceptar', { aceptadoEl: new Date() })
export const cerrar = (e: Encargo) => transicionar(e, 'cerrar', { cerradoEl: new Date() })
export const descartar = (e: Encargo) => transicionar(e, 'descartar')

// ── Bitácora ────────────────────────────────────────────────────────────────

function congeladoDe(e: Encargo): SnapshotEncargo {
  const s = snapshotDe(e)
  if (!s) throw new ErrorEncargo('el encargo no tiene una propuesta congelada', 409)
  return s
}

const NIVEL_IDS = NIVELES.map((n) => n.id)

function nivelValido(v: unknown): NivelConsultoria {
  if (!NIVEL_IDS.includes(v as NivelConsultoria)) throw new ErrorEncargo('nivel inválido')
  return v as NivelConsultoria
}

function textoRequerido(v: unknown, campo: string, max: number): string {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) throw new ErrorEncargo(`falta ${campo}`)
  if (t.length > max) throw new ErrorEncargo(`${campo} es demasiado largo (máximo ${max} caracteres)`)
  return t
}

function precio(fn: () => PrecioAdicional): PrecioAdicional {
  try {
    return fn()
  } catch (err) {
    if (err instanceof ErrorCotiza) throw new ErrorEncargo(err.message)
    throw err
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function insertarAdicional(
  tx: Tx | typeof db,
  encargoId: number,
  datos: { origen: Adicional['origen']; referenciaId: number | null; descripcion: string; urgente: boolean },
  p: PrecioAdicional
): Promise<Adicional> {
  const [fila] = await tx
    .insert(cotizaAdicionales)
    .values({
      encargoId,
      origen: datos.origen,
      referenciaId: datos.referenciaId,
      descripcion: datos.descripcion,
      horas: p.horas,
      nivel: p.nivel,
      urgente: datos.urgente,
      tarifa: p.tarifa,
      recargo: Math.round(p.recargo),
      monto: p.monto,
      creadoEl: new Date(),
    })
    .returning()
  return fila
}

export type ResultadoBitacora = { id: number; adicional: Adicional | null }

/**
 * Anota un pedido del cliente. Si se clasifica como adicional, nace el
 * adicional propuesto con su precio; el recargo de urgencia lo decide la hora
 * del pedido en Bogotá, no una casilla.
 */
export async function registrarSolicitud(e: Encargo, d: Record<string, unknown>): Promise<ResultadoBitacora> {
  exigir(e, 'solicitud')
  const s = congeladoDe(e)
  const pedidoEl = instanteDesdeBogota(d.pedidoEl)
  if (!pedidoEl) throw new ErrorEncargo('fecha y hora del pedido inválidas')
  if (pedidoEl.getTime() > Date.now() + 5 * 60_000) throw new ErrorEncargo('el pedido no puede ser del futuro')
  if (!CANALES.includes(d.canal as Canal)) throw new ErrorEncargo('canal inválido')
  if (!CLASIFICACIONES.includes(d.clasificacion as Clasificacion)) throw new ErrorEncargo('clasificación inválida')
  const texto = textoRequerido(d.texto, 'qué pidió', 2000)
  const horario = fueraDeHorario(pedidoEl, s.cotizacion.cupos)

  const p =
    d.clasificacion === 'adicional'
      ? precio(() =>
          precioAdicional(
            { horas: Number(d.horas), nivel: nivelValido(d.nivel), urgente: horario.fuera },
            s.cotizacion.tarifas,
            s.cotizacion.cupos,
            s.cotizacion.reglas
          )
        )
      : null

  return db.transaction(async (tx) => {
    const [fila] = await tx
      .insert(cotizaSolicitudes)
      .values({
        encargoId: e.id,
        pedidoEl,
        canal: d.canal as Canal,
        texto,
        clasificacion: d.clasificacion as Clasificacion,
        fueraDeHorario: horario.fuera,
        creadoEl: new Date(),
      })
      .returning({ id: cotizaSolicitudes.id })
    const adicional = p
      ? await insertarAdicional(tx, e.id, { origen: 'solicitud', referenciaId: fila.id, descripcion: texto.slice(0, 300), urgente: horario.fuera }, p)
      : null
    return { id: fila.id, adicional }
  })
}

/**
 * Anota una reunión. Si ya no cabe en los cupos (o se alargó), el exceso nace
 * como adicional propuesto, cobrado al nivel del encargo.
 */
export async function registrarReunion(e: Encargo, d: Record<string, unknown>): Promise<ResultadoBitacora> {
  exigir(e, 'reunion')
  const s = congeladoDe(e)
  const c = s.cotizacion
  if (!esFechaISO(d.fecha)) throw new ErrorEncargo('fecha de la reunión inválida')
  if (d.fecha > hoyCO()) throw new ErrorEncargo('la reunión no puede ser del futuro')
  const minutos = Number(d.minutos)
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 600) throw new ErrorEncargo('minutos inválidos (de 1 a 600)')
  const resumen = typeof d.resumen === 'string' ? d.resumen.trim().slice(0, 4000) : ''

  return db.transaction(async (tx) => {
    const previas = await tx
      .select({ minutos: cotizaReuniones.minutos })
      .from(cotizaReuniones)
      .where(eq(cotizaReuniones.encargoId, e.id))
      // Los cupos se gastan en el orden en que se anotan, no por fecha: una
      // reunión anotada tarde con fecha vieja no le quita el cupo a otra que
      // ya se dio por incluida (y cuyo adicional, si lo hubo, ya existe).
      .orderBy(cotizaReuniones.id)
    const [fila] = await tx
      .insert(cotizaReuniones)
      .values({ encargoId: e.id, fecha: d.fecha as string, minutos, resumen, plazoCorreccion: plazoCorreccion(d.fecha as string, c.cupos), creadoEl: new Date() })
      .returning({ id: cotizaReuniones.id })

    const numero = previas.length + 1
    const ex = consumoDeCupos(c.cupos, { reuniones: [...previas.map((r) => r.minutos), minutos], rondasPorEntregable: [] }, c.reglas)
      .excedentes.find(
        (x): x is Extract<Excedente, { tipo: 'reunion_extra' | 'reunion_larga' }> =>
          (x.tipo === 'reunion_extra' || x.tipo === 'reunion_larga') && x.reunion === numero
      )
    if (!ex) return { id: fila.id, adicional: null }

    const p = precio(() => precioExcedente(ex, { tarifas: c.tarifas, cupos: c.cupos, nivel: nivelDelEncargo(c) }, c.reglas))
    const descripcion =
      ex.tipo === 'reunion_extra'
        ? `Reunión ${numero} del ${fechaCorta(d.fecha as string)} (${minutos} min), fuera de las ${c.cupos.reuniones} incluidas`
        : `Reunión ${numero} del ${fechaCorta(d.fecha as string)}: ${ex.minutosDeMas} min por encima de los ${c.cupos.minutosPorReunion} pactados`
    const adicional = await insertarAdicional(tx, e.id, { origen: ex.tipo, referenciaId: fila.id, descripcion, urgente: false }, p)
    return { id: fila.id, adicional }
  })
}

/**
 * Anota una ronda de cambios. Pasado el cupo del entregable, la ronda es
 * adicional y necesita las horas que Mike estima: no hay forma honesta de
 * calcular sola cuánto cuesta "otro cambio".
 */
export async function registrarRonda(e: Encargo, d: Record<string, unknown>): Promise<ResultadoBitacora> {
  exigir(e, 'ronda')
  const c = congeladoDe(e).cotizacion
  const entregable = Number(d.entregable)
  if (!Number.isInteger(entregable) || entregable < 0 || entregable >= c.lineas.length) throw new ErrorEncargo('entregable inválido')
  const nota = typeof d.nota === 'string' ? d.nota.trim().slice(0, 1000) : ''

  return db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(cotizaRondas)
      .where(and(eq(cotizaRondas.encargoId, e.id), eq(cotizaRondas.entregable, entregable)))
    const ronda = Number(n) + 1
    const deMas = ronda > c.cupos.rondasDeCambios
    const p = deMas
      ? precio(() =>
          precioExcedente(
            { tipo: 'ronda_extra', entregable, ronda },
            { tarifas: c.tarifas, cupos: c.cupos, nivel: c.lineas[entregable].nivel, horasRonda: Number(d.horas) },
            c.reglas
          )
        )
      : null
    const [fila] = await tx.insert(cotizaRondas).values({ encargoId: e.id, entregable, nota, creadoEl: new Date() }).returning({ id: cotizaRondas.id })
    const adicional = p
      ? await insertarAdicional(
          tx,
          e.id,
          { origen: 'ronda_extra', referenciaId: fila.id, descripcion: `Ronda ${ronda} de "${c.lineas[entregable].nombre}"${nota ? `: ${nota.slice(0, 200)}` : ''}`, urgente: false },
          p
        )
      : null
    return { id: fila.id, adicional }
  })
}

/** ¿La próxima ronda de este entregable ya es de más? La vista lo usa para pedir las horas. */
export function rondaEsDeMas(c: CotizacionConsultoria, usadas: number): boolean {
  return usadas + 1 > c.cupos.rondasDeCambios
}

export async function crearAdicionalManual(e: Encargo, d: Record<string, unknown>): Promise<Adicional> {
  exigir(e, 'adicional')
  const c = congeladoDe(e).cotizacion
  const descripcion = textoRequerido(d.descripcion, 'la descripción', 300)
  const urgente = d.urgente === true
  const p = precio(() => precioAdicional({ horas: Number(d.horas), nivel: nivelValido(d.nivel), urgente }, c.tarifas, c.cupos, c.reglas))
  return insertarAdicional(db, e.id, { origen: 'manual', referenciaId: null, descripcion, urgente }, p)
}

/** Aprueba o rechaza un adicional propuesto. Una decisión no se cambia: lo nuevo es otro adicional. */
export async function decidirAdicional(e: Encargo, adicionalId: unknown, decision: unknown): Promise<Adicional> {
  exigir(e, 'decidir')
  const id = Number(adicionalId)
  if (!Number.isInteger(id) || id <= 0) throw new ErrorEncargo('adicional inválido')
  if (decision !== 'aprobado' && decision !== 'rechazado') throw new ErrorEncargo('decisión inválida')
  const [fila] = await db
    .update(cotizaAdicionales)
    .set({ estado: decision, decididoEl: new Date(), decididoPor: 'mike' })
    // El encargo va en el WHERE: un id de adicional de otro encargo no se toca.
    .where(and(eq(cotizaAdicionales.id, id), eq(cotizaAdicionales.encargoId, e.id), eq(cotizaAdicionales.estado, 'propuesto')))
    .returning()
  if (!fila) throw new ErrorEncargo('ese adicional no existe o ya se decidió', 409)
  return fila
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export type DetalleEncargo = {
  encargo: Encargo
  config: ConfigEncargo
  snapshot: SnapshotEncargo | null
  solicitudes: Solicitud[]
  reuniones: Reunion[]
  rondas: Ronda[]
  adicionales: Adicional[]
  consumo: ConsumoCupos | null
  total: TotalVigente | null
}

export async function detalle(id: number): Promise<DetalleEncargo | null> {
  const e = await encargo(id)
  if (!e) return null
  const [solicitudes, reuniones, rondas, adicionales] = await Promise.all([
    db.select().from(cotizaSolicitudes).where(eq(cotizaSolicitudes.encargoId, id)).orderBy(desc(cotizaSolicitudes.pedidoEl)),
    db.select().from(cotizaReuniones).where(eq(cotizaReuniones.encargoId, id)).orderBy(cotizaReuniones.fecha, cotizaReuniones.id),
    db.select().from(cotizaRondas).where(eq(cotizaRondas.encargoId, id)).orderBy(cotizaRondas.id),
    db.select().from(cotizaAdicionales).where(eq(cotizaAdicionales.encargoId, id)).orderBy(desc(cotizaAdicionales.id)),
  ])
  const snapshot = snapshotDe(e)
  const c = snapshot?.cotizacion
  const consumo = c
    ? consumoDeCupos(c.cupos, {
        reuniones: [...reuniones].sort((a, b) => a.id - b.id).map((r) => r.minutos),
        rondasPorEntregable: c.lineas.map((_, i) => rondas.filter((r) => r.entregable === i).length),
      }, c.reglas)
    : null
  const total = c ? totalVigente(c.precio, adicionales.map((a) => ({ monto: a.monto, estado: a.estado }))) : null
  return { encargo: e, config: configDe(e), snapshot, solicitudes, reuniones, rondas, adicionales, consumo, total }
}

export type FilaListado = Encargo & { reunionesUsadas: number; aprobados: number; propuestos: number }

/** Listado sin abrir snapshots: el precio y los conteos salen de columnas y agregados. */
export async function listarEncargos(): Promise<FilaListado[]> {
  const filas = await db
    .select()
    .from(cotizaEncargos)
    .orderBy(desc(cotizaEncargos.actualizadoEl))
    .limit(200)
  if (!filas.length) return []
  const ids = filas.map((f) => f.id)
  const [reuniones, adicionales] = await Promise.all([
    db
      .select({ id: cotizaReuniones.encargoId, n: sql<number>`count(*)` })
      .from(cotizaReuniones)
      .where(inArray(cotizaReuniones.encargoId, ids))
      .groupBy(cotizaReuniones.encargoId),
    db
      .select({ id: cotizaAdicionales.encargoId, estado: cotizaAdicionales.estado, total: sql<number>`sum(${cotizaAdicionales.monto})` })
      .from(cotizaAdicionales)
      .where(inArray(cotizaAdicionales.encargoId, ids))
      .groupBy(cotizaAdicionales.encargoId, cotizaAdicionales.estado),
  ])
  return filas.map((f) => ({
    ...f,
    reunionesUsadas: Number(reuniones.find((r) => r.id === f.id)?.n ?? 0),
    aprobados: Number(adicionales.find((a) => a.id === f.id && a.estado === 'aprobado')?.total ?? 0),
    propuestos: Number(adicionales.find((a) => a.id === f.id && a.estado === 'propuesto')?.total ?? 0),
  }))
}
