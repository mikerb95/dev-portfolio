import type { APIRoute } from 'astro'
import { clientIp } from '../../../../../../lib/device-info'
import { recordAdminEvent } from '../../../../../../lib/security/events'
import { enforceLimit } from '../../../../../../lib/security/ratelimit-durable'
import { IaNoDisponible, pedirJson } from '../../../../../../lib/plano/ia/motor'
import { ErrorEncargo, detalle, guardarConfig } from '../../../../../../lib/cotiza/db'
import { instanteDesdeBogota } from '../../../../../../lib/cotiza/encargo'
import { fueraDeHorario, precioAdicional } from '../../../../../../lib/cotiza/motor'
import { fechaISOEnColombia } from '../../../../../../lib/fecha-co'
import {
  ESQUEMA_ALCANCE,
  ESQUEMA_CLASIFICACION,
  ESQUEMA_RESUMEN,
  PROMPT_CLASIFICACION,
  PROMPT_RESUMEN,
  alcanceEnTexto,
  aplicarAlcance,
  componerResumen,
  filtrarClasificacion,
  promptAlcance,
  type SalidaAlcance,
  type SalidaClasificacion,
  type SalidaResumen,
} from '../../../../../../lib/cotiza/ia'

// IA de Cotiza (RF-223): POST { modo: 'alcance' | 'clasificar' | 'resumen', ... }.
// Cada llamada cuesta centavos (Opus 5.5); sin tope diario, por decisión de
// Mike (6 oct 2026), solo el límite de llamadas por hora. Nada de lo
// que devuelve se anota solo: el alcance entra al borrador y lo demás llena
// formularios que Mike confirma.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const texto = (v: unknown, min: number, max: number, campo: string): string => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (t.length < min) throw new ErrorEncargo(`${campo} es muy corto`)
  if (t.length > max) throw new ErrorEncargo(`${campo} es demasiado largo (máximo ${max.toLocaleString('es-CO')} caracteres)`)
  return t
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })

  let d: Record<string, unknown>
  try {
    const b = await request.json()
    d = b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  // Veinte llamadas por hora y por IP: de sobra para cotizar en serio, y un
  // techo para un bucle o para un PIN en manos equivocadas.
  const ip = clientIp(request.headers) ?? 'sin-ip'
  const limite = await enforceLimit(`cotiza-ia:${ip}`, { limit: 20, windowMs: 3_600_000 })
  if (!limite.allowed) return json(429, { error: 'Demasiadas consultas a la IA en la última hora. Espera un rato.' })

  const det = await detalle(id)
  if (!det) return json(404, { error: 'encargo no encontrado' })
  const e = det.encargo

  try {
    if (d.modo === 'alcance') {
      if (e.estado !== 'borrador') throw new ErrorEncargo('el alcance con IA solo se arma en un borrador', 409)
      const pedido = texto(d.pedido, 40, 20_000, 'el pedido del cliente')
      const { datos, costo } = await pedirJson<SalidaAlcance>({
        system: promptAlcance(),
        usuario: `<pedido_del_cliente>\n${pedido}\n</pedido_del_cliente>`,
        esquema: ESQUEMA_ALCANCE,
      })
      const r = aplicarAlcance(datos, pedido, det.config, fechaISOEnColombia(new Date()))
      await guardarConfig(e, r.config)
      await recordAdminEvent(request, 'cotiza.ia')
      return json(200, { ok: true, agregados: r.agregados, preguntas: r.preguntas, citasDescartadas: r.citasDescartadas, descartados: r.descartados, costoUsd: costo })
    }

    if (d.modo === 'clasificar' || d.modo === 'resumen') {
      if (e.estado !== 'aceptado' || !det.snapshot) throw new ErrorEncargo('esto solo aplica a un encargo en curso', 409)
      const alcance = alcanceEnTexto(det.snapshot, det.consumo)

      if (d.modo === 'clasificar') {
        const pedido = texto(d.texto, 3, 4_000, 'el pedido')
        const { datos, costo } = await pedirJson<SalidaClasificacion>({
          system: PROMPT_CLASIFICACION,
          usuario: `<alcance_aceptado>\n${alcance}\n</alcance_aceptado>\n\n<pedido_nuevo>\n${pedido}\n</pedido_nuevo>`,
          esquema: ESQUEMA_CLASIFICACION,
          maxTokens: 4000,
        })
          const r = filtrarClasificacion(datos, alcance, pedido)
        // El precio estimado lo pone el motor con las tarifas congeladas, no la IA.
        const c = det.snapshot.cotizacion
        const instante = instanteDesdeBogota(d.pedidoEl)
        const urgente = instante ? fueraDeHorario(instante, c.cupos).fuera : false
        const estimado = r.clasificacion === 'adicional' ? precioAdicional({ horas: r.horas, nivel: r.nivel, urgente }, c.tarifas, c.cupos, c.reglas).monto : null
        await recordAdminEvent(request, 'cotiza.ia')
        return json(200, { ok: true, ...r, estimado, urgente, costoUsd: costo })
      }

      const notas = texto(d.notas, 20, 8_000, 'las notas de la reunión')
      const { datos, costo } = await pedirJson<SalidaResumen>({
        system: PROMPT_RESUMEN,
        usuario: `<alcance_aceptado>\n${alcance}\n</alcance_aceptado>\n\n<notas_de_mike>\n${notas}\n</notas_de_mike>`,
        esquema: ESQUEMA_RESUMEN,
        maxTokens: 4000,
      })
      const r = componerResumen(datos, notas)
      await recordAdminEvent(request, 'cotiza.ia')
      return json(200, { ok: true, ...r, costoUsd: costo })
    }

    return json(400, { error: 'modo desconocido' })
  } catch (err) {
    if (err instanceof ErrorEncargo) return json(err.status, { error: err.message })
    if (err instanceof IaNoDisponible) return json(err.motivo === 'sin_clave' ? 503 : 502, { error: err.message })
    throw err
  }
}
