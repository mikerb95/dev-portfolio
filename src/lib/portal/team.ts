// Gestión del equipo de un cliente: los usuarios que comparten su portal.
//
// El `owner` gestiona a los suyos sin pasar por mí. Todas las funciones exigen
// `clientId` y verifican que el usuario objetivo pertenezca a ese cliente: sin
// esa comprobación, un owner podría desactivar al usuario de otra empresa
// pasando un id ajeno.

import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers } from '../../db/schema'
import { revokeAllSessions, type PortalRole } from './session'

export type TeamMember = {
  id: number
  email: string
  name: string | null
  role: PortalRole
  status: 'invited' | 'active' | 'disabled'
  lastLoginAt: Date | null
  createdAt: Date
}

/** Usuarios del cliente, con los activos primero. */
export async function clientTeam(clientId: number): Promise<TeamMember[]> {
  const rows = await db
    .select({
      id: clientUsers.id,
      email: clientUsers.email,
      name: clientUsers.name,
      role: clientUsers.role,
      status: clientUsers.status,
      lastLoginAt: clientUsers.lastLoginAt,
      createdAt: clientUsers.createdAt,
    })
    .from(clientUsers)
    .where(eq(clientUsers.clientId, clientId))
    .orderBy(asc(clientUsers.createdAt))

  const order = { active: 0, invited: 1, disabled: 2 } as const
  return rows.sort((a, b) => order[a.status] - order[b.status]) as TeamMember[]
}

/** Un usuario del cliente. Null si el id no le pertenece. */
export async function teamMember(clientId: number, userId: number) {
  const [row] = await db
    .select()
    .from(clientUsers)
    .where(and(eq(clientUsers.id, userId), eq(clientUsers.clientId, clientId)))
    .limit(1)
  return row ?? null
}

export type TeamActionResult = { ok: true } | { ok: false; error: string }

/**
 * Desactiva a un usuario. Sus sesiones mueren en el acto (no al expirar).
 *
 * Se niega a desactivar al último owner activo: dejaría a la empresa sin nadie
 * que pueda gestionar accesos, y recuperarlo tendría que pasar por mí. El
 * llamador ya impide auto-desactivarse; esto cubre el caso de dos owners que se
 * desactivan mutuamente.
 */
export async function disableMember(clientId: number, userId: number): Promise<TeamActionResult> {
  const member = await teamMember(clientId, userId)
  if (!member) return { ok: false, error: 'Ese usuario no pertenece a tu equipo.' }
  if (member.status === 'disabled') return { ok: true }

  if (member.role === 'owner' && (await countActiveOwners(clientId)) <= 1) {
    return { ok: false, error: 'No puedes desactivar al único administrador del equipo.' }
  }

  await db.update(clientUsers).set({ status: 'disabled' }).where(eq(clientUsers.id, userId))
  await revokeAllSessions(userId)
  return { ok: true }
}

/**
 * Reactiva a un usuario. Vuelve a 'active' solo si ya tenía contraseña; si
 * nunca aceptó su invitación, vuelve a 'invited' y necesita una nueva.
 */
export async function enableMember(clientId: number, userId: number): Promise<TeamActionResult> {
  const member = await teamMember(clientId, userId)
  if (!member) return { ok: false, error: 'Ese usuario no pertenece a tu equipo.' }

  await db
    .update(clientUsers)
    .set({ status: member.passwordHash ? 'active' : 'invited', failedAttempts: 0, lockedUntil: null })
    .where(eq(clientUsers.id, userId))
  return { ok: true }
}

/** Cambia el rol de un usuario del equipo. */
export async function changeRole(clientId: number, userId: number, role: PortalRole): Promise<TeamActionResult> {
  const member = await teamMember(clientId, userId)
  if (!member) return { ok: false, error: 'Ese usuario no pertenece a tu equipo.' }

  // Degradar al último owner deja el equipo sin administrador: mismo problema
  // que desactivarlo.
  if (member.role === 'owner' && role !== 'owner' && (await countActiveOwners(clientId)) <= 1) {
    return { ok: false, error: 'El equipo necesita al menos un administrador.' }
  }

  await db.update(clientUsers).set({ role }).where(eq(clientUsers.id, userId))
  return { ok: true }
}

async function countActiveOwners(clientId: number): Promise<number> {
  const rows = await db
    .select({ id: clientUsers.id })
    .from(clientUsers)
    .where(and(eq(clientUsers.clientId, clientId), eq(clientUsers.role, 'owner'), eq(clientUsers.status, 'active')))
  return rows.length
}
