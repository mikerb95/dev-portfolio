// Qué del micro-SIEM es AUDITORÍA y no amenaza.
//
// La tabla security_events guarda dos cosas distintas: requests hostiles (lo
// que sondea un scanner) y el rastro de acciones legítimas (lo que hago yo en
// el panel, un cliente consultando sus pagos, un alumno canjeando un código).
// Tratar las segundas como ataques hacía tres daños: /security las publicaba
// como "amenazas detectadas" (y su gráfico diario habría enseñado qué días
// entro al panel), la detección de anomalías las leía como picos, y "bloquear
// todo" bloqueaba a esos clientes y alumnos.
//
// Módulo puro: lo importan páginas públicas, crons y el panel.

/** Categorías de rastro. Todo lo que no esté aquí se trata como amenaza. */
export const AUDIT_CATEGORIES: string[] = ['admin_action', 'cobro', 'cuenta_cobro', 'computo', 'capacitacion', 'propuesta', 'marketing']

export const isAuditCategory = (category: string): boolean => AUDIT_CATEGORIES.includes(category)

/**
 * Intentos fallidos de entrar al panel. Son amenazas (cuentan como sondeo de
 * autenticación en todas partes), pero la sección de auditoría del panel las
 * enseña junto a los accesos buenos: "entré yo" y "alguien intentó entrar" se
 * leen mejor en la misma lista.
 */
export const ADMIN_ACCESS_FAILURE_RULES: string[] = [
  'admin.login_rejected',
  'passkey.login_failed',
  'sustentacion.password_failed',
  'cotiza.pin_failed',
]

/** Etiqueta legible de las acciones del panel, para la sección de auditoría. */
export const AUDIT_RULE_LABELS: Record<string, string> = {
  'admin.login': 'Inicio de sesión en el panel',
  'admin.login_rejected': 'Login con GitHub rechazado',
  'passkey.login_failed': 'Login con llave fallido',
  'sustentacion.password_failed': 'Contraseña de la sustentación incorrecta',
  'vault.revealed': 'Credenciales de un servicio reveladas',
  'envvar.revealed': 'Variable de entorno revelada',
  'client.impersonated': 'Vista como cliente',
  'session.revoked': 'Sesión revocada',
  'sessions.revoked_others': 'Todas las demás sesiones revocadas',
  'backup.created': 'Backup manual',
  'blocklist.manual_block': 'IP bloqueada a mano',
  'blocklist.block_all': 'Bloqueo masivo',
  'blocklist.unblock': 'IP desbloqueada',
  'passkey.registered': 'Llave de seguridad añadida',
  'passkey.removed': 'Llave de seguridad eliminada',
  'sustentacion.access_granted': 'Entrada a la sustentación con contraseña',
  'cotiza.pin_access': 'Entrada a Cotiza con PIN',
  'cotiza.pin_failed': 'PIN de Cotiza incorrecto',
  'cotiza.pin_cambiado': 'PIN de Cotiza cambiado',
  'cotiza.pin_quitado': 'PIN de Cotiza quitado',
  'cotiza.puerta_reabierta': 'Acceso con PIN de Cotiza reabierto a mano',
  'marketing.campana_creada': 'Campaña de marketing creada',
  'marketing.campana_borrada': 'Borrador de campaña borrado',
  'marketing.campana_disparada': 'Campaña de marketing disparada',
  'marketing.campana_cancelada': 'Campaña de marketing cancelada',
  'marketing.baja_manual': 'Suscriptor dado de baja a mano',
  'cotiza.encargo_creado': 'Encargo de Cotiza creado',
  'cotiza.encargo_congelado': 'Propuesta de Cotiza congelada',
  'cotiza.encargo_aceptado': 'Encargo de Cotiza aceptado',
  'cotiza.encargo_reabierto': 'Propuesta de Cotiza reabierta',
  'cotiza.encargo_cerrado': 'Encargo de Cotiza cerrado',
  'cotiza.encargo_descartado': 'Encargo de Cotiza descartado',
  'cotiza.adicional_aprobado': 'Adicional de Cotiza aprobado',
  'cotiza.adicional_rechazado': 'Adicional de Cotiza rechazado',
  'cotiza.ia': 'Consulta a la IA de Cotiza',
  'cotiza.enlace_generado': 'Enlace de cliente de Cotiza generado',
  'cotiza.cliente_acepto': 'Cliente aceptó una propuesta de Cotiza',
  'cotiza.cliente_aprobo': 'Cliente aprobó un adicional de Cotiza',
  'cotiza.cliente_rechazo': 'Cliente rechazó un adicional de Cotiza',
  'present.session_created': 'Sesión de presentación abierta',
  'analista.analisis': 'Análisis del analista de IA',
  'analista.bloqueo_aprobado': 'Bloqueo propuesto por el analista, aprobado',
  'analista.bloqueo_rechazado': 'Bloqueo propuesto por el analista, rechazado',
  'analista.ip_revelada': 'IP real de un origen del analista revelada',
  'asesor.conversacion_tomada': 'Conversación del asesor público tomada por Mike',
  'plano.creada': 'Propuesta de Plano creada',
  'plano.enviada': 'Propuesta de Plano enviada al cliente',
  'plano.descartada': 'Propuesta de Plano descartada',
  'plano.ajustes': 'Reglas de pago de Plano cambiadas',
  'plano.ia': 'Análisis con IA de una propuesta',
  'asistente.pregunta': 'Pregunta al asistente del dashboard',
  'asistente.propuesta_aprobada': 'Acción propuesta por el asistente, aprobada',
  'asistente.propuesta_rechazada': 'Acción propuesta por el asistente, rechazada',
}
