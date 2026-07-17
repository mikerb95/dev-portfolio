// Demo pública del portal de clientes: deja probar /portal sin invitación ni
// contraseña. Mismo diseño de dos capas que la demo del admin (ver lib/demo.ts):
//
//  1. Las queries de un visitante en demo salen de TURSO_DEMO_URL (otra base
//     física), nunca de la real. Esta es la garantía que de verdad importa.
//  2. Este módulo es solo la puerta: un pase anónimo firmado (HMAC, TTL corto)
//     que el middleware exige para las escrituras, cuya lista de excepciones
//     es deliberadamente corta.
//
// Cookie y token DISTINTOS de los del admin (`demo_session`): son dominios de
// privilegio distintos y no deben poder mezclarse ni por accidente.

import { signDemoToken, verifyDemoToken } from '../demo'

export const PORTAL_DEMO_COOKIE = 'portal_demo_pass'

// 30 min: alcanza para un recorrido completo (dashboard → factura → pagar →
// mensajes → documentos) sin dejar una puerta abierta indefinidamente.
export const PORTAL_DEMO_TTL_SEC = 30 * 60

// Identidad fija del usuario de la demo, sembrada por scripts/seed-demo.mjs en
// la base de demo. No hay contraseña que recordar: el pase ES la sesión.
export const PORTAL_DEMO_EMAIL = 'demo@codebymike.tech'

export function createPortalDemoToken(secret: string, nowMs = Date.now()): string {
  return signDemoToken(secret, Math.floor(nowMs / 1000) + PORTAL_DEMO_TTL_SEC)
}

export const verifyPortalDemoToken = verifyDemoToken

/**
 * Solo lectura, con una única excepción: el simulador de pago. Sin él, la
 * demo no podría mostrar el flujo que más la justifica (pagar una factura y
 * verla saldarse). Se permiten los dos pasos de ese flujo: iniciar el pago de
 * una factura propia y simular la respuesta de la pasarela.
 *
 * Todo lo demás que mute algo queda fuera a propósito: invitar usuarios o
 * cambiar contraseñas dispararía correos reales a direcciones que escribe un
 * anónimo — eso sí sería un vector de abuso, aunque los datos vivan en una
 * base desechable.
 */
const MUTATION_ALLOWLIST: RegExp[] = [
  /^\/api\/portal\/facturas\/\d+\/pagar$/,
  /^\/api\/payments\/mock\/pay$/,
]

export function isPortalDemoAllowedMethod(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true
  return MUTATION_ALLOWLIST.some((re) => re.test(pathname))
}
