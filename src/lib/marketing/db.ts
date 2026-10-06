// Persistencia de marketing: suscriptores, campañas y la cola de envíos.
// Ver docs/plan-marketing.md.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db } from '../../db'
import { marketingCampanas, marketingEnvios, marketingSuscriptores } from '../../db/schema'
import { isUniqueViolation } from '../db-unique'
import { renderEmail, renderText, sendMail, SITE_URL } from '../email'
import { serverEnv } from '../env'
import { TEXTO_CONSENTIMIENTO, validarCampana, type CampanaContenido } from './contenido'
import { armarCorreo, enviarLote, remitenteMarketing, urlBaja, urlBajaUnClic } from './envio'
import { CUPO_DIARIO_DEFECTO, DIAS_ENTRE_ENVIOS, TAMANO_LOTE, cupoRestante, inicioDiaCO, ventanaLegal } from './reglas'
import { hashToken, nuevoTokenConfirmacion, secretoMarketing } from './tokens'

type Suscriptor = typeof marketingSuscriptores.$inferSelect
export type Campana = typeof marketingCampanas.$inferSelect

/** Pausa mínima entre dos correos de confirmación al mismo buzón. */
const ESPERA_CONFIRMACION_MS = 10 * 60_000

/** Un lote que lleva más de esto en 'enviando' se da por huérfano y se reintenta. */
const LOTE_HUERFANO_MS = 10 * 60_000

const seg = (d: Date) => Math.floor(d.getTime() / 1000)

// ── Suscriptores ────────────────────────────────────────────────────────────

/**
 * Alta desde un formulario público (doble opt-in). La respuesta al visitante
 * es la misma pase lo que pase: decir "ese correo ya está suscrito" le diría
 * a cualquiera quién está en la lista.
 */
export async function suscribirPublico(input: {
  email: string
  nombre?: string | null
  origen: 'formulario' | 'contacto'
  texto?: string
  ahora?: Date
}): Promise<{ enviado: boolean; motivo?: 'ya_activo' | 'espera' | 'sin_correo' }> {
  const ahora = input.ahora ?? new Date()
  const [existente] = await db.select().from(marketingSuscriptores).where(eq(marketingSuscriptores.email, input.email)).limit(1)
  if (existente?.estado === 'activo') return { enviado: false, motivo: 'ya_activo' }
  if (existente?.confirmacionEnviada && ahora.getTime() - existente.confirmacionEnviada.getTime() < ESPERA_CONFIRMACION_MS) {
    return { enviado: false, motivo: 'espera' }
  }

  const token = nuevoTokenConfirmacion()
  const valores = {
    nombre: input.nombre?.trim().slice(0, 120) || existente?.nombre || null,
    origen: input.origen,
    estado: 'pendiente' as const,
    textoConsentimiento: input.texto ?? TEXTO_CONSENTIMIENTO,
    tokenConfirmacionHash: hashToken(token),
    confirmacionEnviada: ahora,
  }
  if (existente) {
    await db.update(marketingSuscriptores).set(valores).where(eq(marketingSuscriptores.id, existente.id))
  } else {
    try {
      await db.insert(marketingSuscriptores).values({ email: input.email, creado: ahora, ...valores })
    } catch (e) {
      // Dos envíos simultáneos del mismo correo: el segundo pierde el UNIQUE y
      // el primero ya mandó su confirmación.
      if (isUniqueViolation(e)) return { enviado: false, motivo: 'espera' }
      throw e
    }
  }

  const res = await enviarConfirmacion(input.email, token)
  return res.ok ? { enviado: true } : { enviado: false, motivo: 'sin_correo' }
}

function enviarConfirmacion(email: string, token: string) {
  const url = `${SITE_URL}/api/marketing/confirmar?t=${token}`
  const heading = 'Confirma tu suscripción'
  const blocks = [
    'Alguien (ojalá tú) pidió recibir las novedades de CodeByMike en este correo: proyectos nuevos, promociones de los servicios y artículos técnicos. Pocas veces al mes, nunca más de una por semana.',
    'Para empezar a recibirlas, confirma aquí:',
  ]
  // Es un correo transaccional (respuesta a una acción del visitante), no
  // publicidad: sale a cualquier hora, pero desde el remitente de novedades
  // para que el buzón lo reconozca después.
  return sendMail({
    to: email,
    from: remitenteMarketing(),
    subject: 'Confirma tu suscripción a las novedades de CodeByMike',
    html: renderEmail({
      preheader: 'Un clic y quedas suscrito',
      heading,
      blocks,
      button: { label: 'Confirmar suscripción', url },
      footNote: 'Si no fuiste tú, ignora este correo: sin confirmar no recibirás nada.',
      label: 'Novedades',
    }),
    text: renderText(heading, ['Pediste recibir las novedades de CodeByMike.', 'Si no fuiste tú, ignora este correo.'], {
      label: 'Confirmar suscripción',
      url,
    }),
  })
}

/** Canjea el token de confirmación. Devuelve false si no existe o ya se usó. */
export async function confirmarSuscripcion(token: string, ahora = new Date()): Promise<boolean> {
  if (!token || token.length > 100) return false
  const filas = await db
    .update(marketingSuscriptores)
    .set({ estado: 'activo', confirmado: ahora, tokenConfirmacionHash: null, baja: null, bajaCampanaId: null })
    .where(and(eq(marketingSuscriptores.tokenConfirmacionHash, hashToken(token)), eq(marketingSuscriptores.estado, 'pendiente')))
    .returning({ id: marketingSuscriptores.id })
  return filas.length > 0
}

/**
 * Baja. Idempotente: darse de baja dos veces no es un error. Lo pendiente de
 * esa persona en campañas en curso pasa a 'omitido' en el acto, para que un
 * lote que arranque un segundo después ya no la incluya.
 */
export async function darDeBaja(suscriptorId: number, campanaId: number | null = null, ahora = new Date()): Promise<boolean> {
  const filas = await db
    .update(marketingSuscriptores)
    .set({ estado: 'baja', baja: ahora, bajaCampanaId: campanaId, tokenConfirmacionHash: null })
    .where(and(eq(marketingSuscriptores.id, suscriptorId), sql`${marketingSuscriptores.estado} <> 'baja'`))
    .returning({ id: marketingSuscriptores.id })
  await db
    .update(marketingEnvios)
    .set({ estado: 'omitido' })
    .where(and(eq(marketingEnvios.suscriptorId, suscriptorId), eq(marketingEnvios.estado, 'pendiente')))
  return filas.length > 0
}

export async function obtenerSuscriptor(id: number): Promise<Suscriptor | null> {
  const [s] = await db.select().from(marketingSuscriptores).where(eq(marketingSuscriptores.id, id)).limit(1)
  return s ?? null
}

/** ¿Este correo está suscrito? Para la casilla de la cuenta del portal. */
export async function suscritoPorEmail(email: string): Promise<boolean> {
  const [s] = await db
    .select({ estado: marketingSuscriptores.estado })
    .from(marketingSuscriptores)
    .where(eq(marketingSuscriptores.email, email.trim().toLowerCase()))
    .limit(1)
  return s?.estado === 'activo'
}

/**
 * Casilla del portal. El correo ya lo verificó la invitación, así que entra
 * activo sin doble opt-in. Desmarcar es una baja normal.
 */
export async function preferenciaPortal(input: {
  clientUserId: number
  email: string
  nombre?: string | null
  activo: boolean
  ahora?: Date
}): Promise<void> {
  const ahora = input.ahora ?? new Date()
  const email = input.email.trim().toLowerCase()
  const [existente] = await db.select().from(marketingSuscriptores).where(eq(marketingSuscriptores.email, email)).limit(1)
  if (!input.activo) {
    if (existente) await darDeBaja(existente.id, null, ahora)
    return
  }
  const valores = {
    nombre: input.nombre ?? existente?.nombre ?? null,
    origen: 'portal' as const,
    estado: 'activo' as const,
    textoConsentimiento: TEXTO_CONSENTIMIENTO,
    tokenConfirmacionHash: null,
    clientUserId: input.clientUserId,
    confirmado: ahora,
    baja: null,
    bajaCampanaId: null,
  }
  if (existente) await db.update(marketingSuscriptores).set(valores).where(eq(marketingSuscriptores.id, existente.id))
  else await db.insert(marketingSuscriptores).values({ email, creado: ahora, ...valores })
}

export async function listarSuscriptores(limite = 200): Promise<Suscriptor[]> {
  return db.select().from(marketingSuscriptores).orderBy(desc(marketingSuscriptores.creado)).limit(limite)
}

export async function conteoSuscriptores(): Promise<Record<Suscriptor['estado'], number>> {
  const filas = await db
    .select({ estado: marketingSuscriptores.estado, n: sql<number>`count(*)` })
    .from(marketingSuscriptores)
    .groupBy(marketingSuscriptores.estado)
  const out = { pendiente: 0, activo: 0, baja: 0 }
  for (const f of filas) out[f.estado] = Number(f.n)
  return out
}

// ── Campañas ────────────────────────────────────────────────────────────────

const limpiar = (c: CampanaContenido) => ({
  asunto: c.asunto.trim(),
  preheader: c.preheader?.trim() || null,
  titulo: c.titulo.trim(),
  cuerpo: c.cuerpo.trim(),
  botonTexto: c.botonTexto?.trim() || null,
  botonUrl: c.botonUrl?.trim() || null,
})

export async function guardarCampana(
  id: number | null,
  c: CampanaContenido,
  ahora = new Date()
): Promise<{ ok: true; id: number } | { ok: false; errores: string[] }> {
  const errores = validarCampana(c)
  if (errores.length) return { ok: false, errores }
  if (id == null) {
    const [fila] = await db
      .insert(marketingCampanas)
      .values({ ...limpiar(c), estado: 'borrador', creada: ahora, actualizada: ahora })
      .returning({ id: marketingCampanas.id })
    return { ok: true, id: fila.id }
  }
  // Solo un borrador se edita: lo que ya salió tiene que quedar como salió.
  const filas = await db
    .update(marketingCampanas)
    .set({ ...limpiar(c), actualizada: ahora })
    .where(and(eq(marketingCampanas.id, id), eq(marketingCampanas.estado, 'borrador')))
    .returning({ id: marketingCampanas.id })
  return filas.length ? { ok: true, id } : { ok: false, errores: ['Solo se puede editar una campaña en borrador.'] }
}

export async function obtenerCampana(id: number): Promise<Campana | null> {
  const [c] = await db.select().from(marketingCampanas).where(eq(marketingCampanas.id, id)).limit(1)
  return c ?? null
}

export type ConteoEnvios = { pendiente: number; enviando: number; enviado: number; fallido: number; omitido: number; bajas: number }

export async function listarCampanas(): Promise<(Campana & { envios: ConteoEnvios })[]> {
  const campanas = await db.select().from(marketingCampanas).orderBy(desc(marketingCampanas.creada)).limit(100)
  if (!campanas.length) return []
  const ids = campanas.map((c) => c.id)
  const conteos = await db
    .select({ campanaId: marketingEnvios.campanaId, estado: marketingEnvios.estado, n: sql<number>`count(*)` })
    .from(marketingEnvios)
    .where(inArray(marketingEnvios.campanaId, ids))
    .groupBy(marketingEnvios.campanaId, marketingEnvios.estado)
  const bajas = await db
    .select({ campanaId: marketingSuscriptores.bajaCampanaId, n: sql<number>`count(*)` })
    .from(marketingSuscriptores)
    .where(inArray(marketingSuscriptores.bajaCampanaId, ids))
    .groupBy(marketingSuscriptores.bajaCampanaId)
  return campanas.map((c) => {
    const envios: ConteoEnvios = { pendiente: 0, enviando: 0, enviado: 0, fallido: 0, omitido: 0, bajas: 0 }
    for (const f of conteos) if (f.campanaId === c.id) envios[f.estado] = Number(f.n)
    envios.bajas = Number(bajas.find((b) => b.campanaId === c.id)?.n ?? 0)
    return { ...c, envios }
  })
}

/** Prueba al admin: mismo armado, sin enlace de baja real, fuera de la cola. */
export async function enviarPrueba(id: number): Promise<{ ok: boolean; error?: string; para?: string }> {
  const c = await obtenerCampana(id)
  if (!c) return { ok: false, error: 'La campaña no existe.' }
  const para = serverEnv('ALERT_EMAIL_TO')?.split(',')[0]?.trim()
  if (!para) return { ok: false, error: 'Falta ALERT_EMAIL_TO: no sé a qué correo mandarte la prueba.' }
  const correo = armarCorreo(c, para, null)
  const res = await sendMail({
    to: para,
    from: correo.from,
    subject: `[Prueba] ${correo.subject}`,
    html: correo.html,
    text: correo.text,
    replyTo: correo.reply_to,
  })
  return res.ok ? { ok: true, para } : { ok: false, error: res.skipped ? 'RESEND_API_KEY no configurada.' : res.error }
}

/**
 * Dispara una campaña: encola un envío por cada suscriptor activo. Idempotente
 * por el UNIQUE (campaña, suscriptor): disparar dos veces no duplica a nadie.
 * No envía nada: la cola la vacía `procesarCola`, que respeta horario y cupo.
 */
export async function dispararCampana(id: number, ahora = new Date()): Promise<{ ok: true; encolados: number } | { ok: false; error: string }> {
  if (!secretoMarketing()) return { ok: false, error: 'Falta MARKETING_SECRET: sin él no hay enlace de baja, y sin baja no se puede enviar.' }
  const c = await obtenerCampana(id)
  if (!c) return { ok: false, error: 'La campaña no existe.' }
  if (c.estado !== 'borrador') return { ok: false, error: 'Esta campaña ya se disparó.' }
  const errores = validarCampana(c)
  if (errores.length) return { ok: false, error: errores.join(' ') }

  const res = await db.run(sql`
    INSERT INTO marketing_envios (campana_id, suscriptor_id, estado, creado)
    SELECT ${id}, s.id, 'pendiente', ${seg(ahora)}
    FROM marketing_suscriptores s
    WHERE s.estado = 'activo'
    ON CONFLICT (campana_id, suscriptor_id) DO NOTHING`)
  await db
    .update(marketingCampanas)
    .set({ estado: 'enviando', disparada: ahora, actualizada: ahora })
    .where(and(eq(marketingCampanas.id, id), eq(marketingCampanas.estado, 'borrador')))
  return { ok: true, encolados: Number(res.rowsAffected ?? 0) }
}

/** Cancela lo que falte por salir. Lo ya enviado, enviado está. */
export async function cancelarCampana(id: number, ahora = new Date()): Promise<boolean> {
  const filas = await db
    .update(marketingCampanas)
    .set({ estado: 'cancelada', terminada: ahora, actualizada: ahora })
    .where(and(eq(marketingCampanas.id, id), inArray(marketingCampanas.estado, ['borrador', 'enviando'])))
    .returning({ id: marketingCampanas.id })
  await db
    .update(marketingEnvios)
    .set({ estado: 'omitido' })
    .where(and(eq(marketingEnvios.campanaId, id), eq(marketingEnvios.estado, 'pendiente')))
  return filas.length > 0
}

export async function borrarBorrador(id: number): Promise<boolean> {
  const filas = await db
    .delete(marketingCampanas)
    .where(and(eq(marketingCampanas.id, id), eq(marketingCampanas.estado, 'borrador')))
    .returning({ id: marketingCampanas.id })
  return filas.length > 0
}

// ── Cola ────────────────────────────────────────────────────────────────────

export const cupoDiario = (): number => {
  const n = Number(serverEnv('MARKETING_CUPO_DIARIO'))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : CUPO_DIARIO_DEFECTO
}

export async function enviadosHoy(ahora = new Date()): Promise<number> {
  const [f] = await db
    .select({ n: sql<number>`count(*)` })
    .from(marketingEnvios)
    .where(sql`(${marketingEnvios.estado} = 'enviado' AND ${marketingEnvios.enviado} >= ${seg(inicioDiaCO(ahora))}) OR ${marketingEnvios.estado} = 'enviando'`)
  return Number(f?.n ?? 0)
}

export type ResultadoCola = {
  ok: boolean
  motivo?: string
  enviados: number
  fallidos: number
  reintentados: number
  pendientes: number
}

type FilaLote = { envioId: number; suscriptorId: number; email: string; campanaId: number }

async function filasDeLote(lote: string): Promise<FilaLote[]> {
  return db
    .select({
      envioId: marketingEnvios.id,
      suscriptorId: marketingEnvios.suscriptorId,
      email: marketingSuscriptores.email,
      campanaId: marketingEnvios.campanaId,
    })
    .from(marketingEnvios)
    .innerJoin(marketingSuscriptores, eq(marketingSuscriptores.id, marketingEnvios.suscriptorId))
    .where(and(eq(marketingEnvios.lote, lote), eq(marketingEnvios.estado, 'enviando')))
    .orderBy(marketingEnvios.id)
}

/** Envía un lote ya reclamado y anota el resultado fila por fila. */
async function despacharLote(lote: string, secreto: string, ahora: Date): Promise<{ enviados: number; fallidos: number; error?: string }> {
  const filas = await filasDeLote(lote)
  if (!filas.length) return { enviados: 0, fallidos: 0 }
  const campanas = new Map<number, Campana>()
  for (const id of new Set(filas.map((f) => f.campanaId))) {
    const c = await obtenerCampana(id)
    if (c) campanas.set(id, c)
  }
  const correos = filas.map((f) =>
    armarCorreo(campanas.get(f.campanaId)!, f.email, { web: urlBaja(f.suscriptorId, secreto, f.campanaId), unClic: urlBajaUnClic(f.suscriptorId, secreto, f.campanaId) })
  )
  const res = await enviarLote(correos, `marketing-${lote}`)
  if (!res.ok) {
    // Error de red o 5xx: las filas se quedan en 'enviando' y el próximo
    // ciclo reintenta el lote con la misma llave. Un 4xx no se arregla
    // reintentando: esas sí se marcan fallidas.
    const definitivo = /Resend 4\d\d/.test(res.error) && !/Resend 429/.test(res.error)
    if (definitivo || res.skipped) {
      await db
        .update(marketingEnvios)
        .set({ estado: 'fallido', error: res.error.slice(0, 300) })
        .where(and(eq(marketingEnvios.lote, lote), eq(marketingEnvios.estado, 'enviando')))
    }
    for (const id of campanas.keys()) {
      await db.update(marketingCampanas).set({ ultimoError: res.error.slice(0, 300) }).where(eq(marketingCampanas.id, id))
    }
    return { enviados: 0, fallidos: definitivo || res.skipped ? filas.length : 0, error: res.error }
  }
  for (const [i, f] of filas.entries()) {
    await db
      .update(marketingEnvios)
      .set({ estado: 'enviado', enviado: ahora, resendId: res.ids[i], error: null })
      .where(eq(marketingEnvios.id, f.envioId))
  }
  return { enviados: filas.length, fallidos: 0 }
}

/**
 * Vacía la cola respetando las tres reglas: franja horaria legal, cupo diario
 * y una promoción por persona por semana. La llaman el cron y el botón del
 * panel; las dos a la vez no duplican porque cada fila se reclama con un
 * UPDATE condicionado a 'pendiente'.
 */
export async function procesarCola(opts: { ahora?: Date; tope?: number } = {}): Promise<ResultadoCola> {
  const ahora = opts.ahora ?? new Date()
  const base = { enviados: 0, fallidos: 0, reintentados: 0, pendientes: 0 }
  const secreto = secretoMarketing()
  if (!secreto) return { ok: false, motivo: 'Falta MARKETING_SECRET', ...base }

  // Quien se dio de baja entre el disparo y ahora no recibe nada.
  await db.run(sql`
    UPDATE marketing_envios SET estado = 'omitido'
    WHERE estado = 'pendiente'
      AND suscriptor_id IN (SELECT id FROM marketing_suscriptores WHERE estado <> 'activo')`)
  // Antes de mirar el horario: una campaña sin destinatarios (o con todos
  // dados de baja) se cierra aunque sea domingo.
  await cerrarCampanasTerminadas(ahora)

  const ventana = ventanaLegal(ahora)
  if (!ventana.abierta) {
    return { ok: true, motivo: `Fuera del horario permitido: ${ventana.motivo}`, ...base, pendientes: await contarPendientes() }
  }

  const out = { ...base }

  // 1. Lotes huérfanos: la función murió entre reclamar y anotar.
  const huerfanos = await db
    .selectDistinct({ lote: marketingEnvios.lote })
    .from(marketingEnvios)
    .where(and(eq(marketingEnvios.estado, 'enviando'), sql`${marketingEnvios.loteAt} < ${seg(new Date(ahora.getTime() - LOTE_HUERFANO_MS))}`))
  for (const { lote } of huerfanos) {
    if (!lote) continue
    const r = await despacharLote(lote, secreto, ahora)
    out.reintentados += r.enviados
    out.fallidos += r.fallidos
  }

  // 2. Lotes nuevos, hasta agotar el cupo del día.
  const tope = opts.tope ?? cupoDiario()
  let cupo = cupoRestante(await enviadosHoy(ahora), tope)
  const semanaAtras = seg(new Date(ahora.getTime() - DIAS_ENTRE_ENVIOS * 86_400_000))
  while (cupo > 0) {
    const lote = randomBytes(9).toString('base64url')
    const n = Math.min(cupo, TAMANO_LOTE)
    // MIN(e.id) agrupado por persona: si alguien tiene pendientes en dos
    // campañas, solo una entra al lote (la más antigua) y la otra espera su
    // semana.
    const reclamo = await db.run(sql`
      UPDATE marketing_envios SET estado = 'enviando', lote = ${lote}, lote_at = ${seg(ahora)}
      WHERE estado = 'pendiente' AND id IN (
        SELECT MIN(e.id) FROM marketing_envios e
        JOIN marketing_suscriptores s ON s.id = e.suscriptor_id
        JOIN marketing_campanas c ON c.id = e.campana_id
        WHERE e.estado = 'pendiente' AND s.estado = 'activo' AND c.estado = 'enviando'
          AND NOT EXISTS (
            SELECT 1 FROM marketing_envios x
            WHERE x.suscriptor_id = e.suscriptor_id
              AND (x.estado = 'enviando' OR (x.estado = 'enviado' AND x.enviado >= ${semanaAtras}))
          )
        GROUP BY e.suscriptor_id
        ORDER BY MIN(e.id)
        LIMIT ${n}
      )`)
    if (!Number(reclamo.rowsAffected)) break
    const r = await despacharLote(lote, secreto, ahora)
    out.enviados += r.enviados
    out.fallidos += r.fallidos
    if (r.error) break
    cupo -= Number(reclamo.rowsAffected)
  }

  await cerrarCampanasTerminadas(ahora)
  return { ok: true, ...out, pendientes: await contarPendientes() }
}

async function contarPendientes(): Promise<number> {
  const [f] = await db
    .select({ n: sql<number>`count(*)` })
    .from(marketingEnvios)
    .where(inArray(marketingEnvios.estado, ['pendiente', 'enviando']))
  return Number(f?.n ?? 0)
}

/** Una campaña en curso sin nada pendiente ni en vuelo queda como enviada. */
async function cerrarCampanasTerminadas(ahora: Date): Promise<void> {
  await db.run(sql`
    UPDATE marketing_campanas SET estado = 'enviada', terminada = ${seg(ahora)}, actualizada = ${seg(ahora)}
    WHERE estado = 'enviando' AND NOT EXISTS (
      SELECT 1 FROM marketing_envios e WHERE e.campana_id = marketing_campanas.id AND e.estado IN ('pendiente', 'enviando')
    )`)
}
