// Auditoría del portal: quién hizo qué, cuándo y desde dónde.
//
// Dos consumidores con dos propósitos distintos:
//  · El owner del cliente, que ve la actividad de su propio equipo.
//  · Yo, cuando hay que demostrar que un contrato se descargó el día X o que
//    un pago lo inició tal persona.
//
// Fire-and-forget como el micro-SIEM: registrar nunca puede tumbar la acción
// que se está auditando. Si Turso falla, se pierde la línea, no el request.

import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers, portalAuditLog } from '../../db/schema'

export type AuditAction =
  | 'login'
  | 'login.failed'
  | 'logout'
  | 'password.set'
  | 'password.changed'
  | 'password.reset'
  | 'invite.sent'
  | 'invite.accepted'
  | 'user.role_changed'
  | 'user.disabled'
  | 'session.revoked'
  | 'document.download'
  | 'document.upload'
  | 'invoice.viewed'
  | 'invoice.pay_started'
  | 'message.sent'
  | 'impersonate.start'
  | 'impersonate.end'

export function audit(params: {
  clientId: number
  clientUserId?: number | null
  action: AuditAction
  entity?: string | null
  entityId?: number | null
  detail?: string | null
  ip?: string | null
}): void {
  void db
    .insert(portalAuditLog)
    .values({
      clientId: params.clientId,
      clientUserId: params.clientUserId ?? null,
      action: params.action,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      detail: params.detail?.slice(0, 500) ?? null,
      ip: params.ip ?? null,
      at: new Date(),
    })
    .catch(() => {})
}

/** Actividad reciente de un cliente, con el nombre de quien la hizo. */
export async function recentActivity(clientId: number, limit = 30) {
  return db
    .select({
      id: portalAuditLog.id,
      action: portalAuditLog.action,
      entity: portalAuditLog.entity,
      entityId: portalAuditLog.entityId,
      detail: portalAuditLog.detail,
      at: portalAuditLog.at,
      userName: clientUsers.name,
      userEmail: clientUsers.email,
    })
    .from(portalAuditLog)
    .leftJoin(clientUsers, eq(portalAuditLog.clientUserId, clientUsers.id))
    .where(eq(portalAuditLog.clientId, clientId))
    .orderBy(desc(portalAuditLog.at))
    .limit(limit)
}

export const ACTION_LABELS: Record<string, string> = {
  login: 'Inició sesión',
  'login.failed': 'Intento de acceso fallido',
  logout: 'Cerró sesión',
  'password.set': 'Definió su contraseña',
  'password.changed': 'Cambió su contraseña',
  'password.reset': 'Restableció su contraseña',
  'invite.sent': 'Envió una invitación',
  'invite.accepted': 'Aceptó su invitación',
  'user.role_changed': 'Cambió un rol',
  'user.disabled': 'Desactivó un usuario',
  'session.revoked': 'Cerró una sesión',
  'document.download': 'Descargó un documento',
  'document.upload': 'Subió un documento',
  'invoice.viewed': 'Consultó una factura',
  'invoice.pay_started': 'Inició un pago',
  'message.sent': 'Envió un mensaje',
}
