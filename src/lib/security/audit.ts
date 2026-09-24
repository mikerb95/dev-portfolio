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
export const AUDIT_CATEGORIES: string[] = ['admin_action', 'cobro', 'cuenta_cobro', 'computo', 'capacitacion']

export const isAuditCategory = (category: string): boolean => AUDIT_CATEGORIES.includes(category)

/** Etiqueta legible de las acciones del panel, para la sección de auditoría. */
export const AUDIT_RULE_LABELS: Record<string, string> = {
  'admin.login': 'Inicio de sesión en el panel',
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
  'present.session_created': 'Sesión de presentación abierta',
}
