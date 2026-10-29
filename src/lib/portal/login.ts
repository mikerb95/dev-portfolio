// Lógica de login del portal: verificación de credenciales y defensa contra
// fuerza bruta.
//
// Separado de los endpoints para poder testear la máquina de intentos sin
// levantar Astro, y porque el rate limit del middleware (por IP) no basta: un
// atacante distribuido cambia de IP, pero no puede evitar que los fallos se
// acumulen CONTRA LA CUENTA. Las dos capas se complementan.
//
// Regla de oro de este módulo: hacia fuera, todos los fallos son el mismo
// fallo. Nada en la respuesta debe permitir distinguir "no existe esa cuenta"
// de "existe pero la contraseña está mal".

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers, clients } from '../../db/schema'
import { enforceLimit } from '../security/ratelimit-durable'
import { hashPassword, needsRehash, verifyPassword } from './passwords'
import { normalizeEmail } from './invitations'

// A partir de aquí la cuenta se bloquea temporalmente. 10 es holgado para un
// humano que duda de su contraseña y ridículo para un ataque de diccionario.
const MAX_ATTEMPTS = 10
const LOCK_MS = 15 * 60 * 1000

export type LoginOutcome =
  | { ok: true; userId: number; clientId: number }
  | { ok: false; reason: 'invalid' | 'locked' | 'disabled' | 'no_portal'; retryAfterMin?: number }

/**
 * Verifica email + contraseña. No crea sesión (eso lo hace el endpoint): aquí
 * solo se decide si las credenciales valen.
 */
export async function attemptLogin(params: {
  email: string
  password: string
  now?: Date
}): Promise<LoginOutcome> {
  const now = params.now ?? new Date()
  const email = normalizeEmail(params.email ?? '')

  const [row] = await db
    .select({
      id: clientUsers.id,
      clientId: clientUsers.clientId,
      passwordHash: clientUsers.passwordHash,
      status: clientUsers.status,
      failedAttempts: clientUsers.failedAttempts,
      lockedUntil: clientUsers.lockedUntil,
      portalEnabled: clients.portalEnabled,
    })
    .from(clientUsers)
    .innerJoin(clients, eq(clientUsers.clientId, clients.id))
    .where(eq(clientUsers.email, email))
    .limit(1)

  if (!row) {
    // Cuenta inexistente. Tiene que bloquearse igual que una real: si el
    // mensaje de "demasiados intentos" solo saliera para cuentas que existen,
    // diez intentos bastarían para saber si un correo es cliente (auditoría
    // del 20 oct 2026). El contador va aparte, por hash del correo, en la
    // tabla del rate limit durable: no hay fila de usuario donde anotarlo.
    const intento = await enforceLimit(`portal-login:${hashCorreo(email)}`, {
      limit: MAX_ATTEMPTS - 1,
      windowMs: LOCK_MS,
      deferUntil: 0,
    })
    if (!intento.allowed) return bloqueada()
    // Se gasta el tiempo de un scrypt igualmente para que el atacante no
    // distinga por latencia qué correos están registrados.
    await verifyPassword(params.password ?? '', await dummyHash())
    return { ok: false, reason: 'invalid' }
  }

  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) return bloqueada()

  // El intento se anota ANTES de verificar, con un incremento atómico. Leer el
  // contador, verificar y escribir después dejaba que una ráfaga en paralelo
  // probara cien contraseñas con el contador en cero (mismo fallo que tuvo el
  // PIN de Cotiza). Si la base no responde se sigue con el valor leído: el
  // freno por IP del middleware sigue en pie.
  const anotado = await db
    .update(clientUsers)
    .set({ failedAttempts: sql`${clientUsers.failedAttempts} + 1` })
    .where(eq(clientUsers.id, row.id))
    .returning({ n: clientUsers.failedAttempts })
    .catch(() => [])
  const intentos = anotado[0]?.n ?? row.failedAttempts + 1
  const bloquear = () =>
    db
      .update(clientUsers)
      .set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) })
      .where(eq(clientUsers.id, row.id))
      .catch(() => {})

  // Los que llegaron en la misma ráfaga detrás del décimo ya no verifican.
  if (intentos > MAX_ATTEMPTS) {
    await bloquear()
    return bloqueada()
  }

  // Sin hash = invitación pendiente: no es una cuenta usable todavía.
  const valid = row.passwordHash ? await verifyPassword(params.password ?? '', row.passwordHash) : false

  if (!valid) {
    if (intentos < MAX_ATTEMPTS) return { ok: false, reason: 'invalid' }
    await bloquear()
    return bloqueada()
  }

  // Credenciales correctas: a partir de aquí ya se puede distinguir el estado
  // de la cuenta sin filtrar nada (quien acierta la contraseña es el dueño).
  if (row.status === 'disabled') return { ok: false, reason: 'disabled' }
  if (row.status === 'invited') return { ok: false, reason: 'invalid' }
  if (!row.portalEnabled) return { ok: false, reason: 'no_portal' }

  await db
    .update(clientUsers)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      // Endurecimiento transparente: si los parámetros de scrypt subieron desde
      // que este usuario definió su contraseña, se re-hashea ahora que la
      // tenemos en claro. El usuario no se entera.
      ...(needsRehash(row.passwordHash) ? { passwordHash: await hashPassword(params.password) } : {}),
    })
    .where(eq(clientUsers.id, row.id))

  return { ok: true, userId: row.id, clientId: row.clientId }
}

// Siempre los mismos minutos, existan o no la cuenta: contar los que quedan
// solo es posible en una cuenta real, y la diferencia la delataría.
const bloqueada = (): LoginOutcome => ({ ok: false, reason: 'locked', retryAfterMin: LOCK_MS / 60_000 })

const hashCorreo = (email: string) => createHash('sha256').update(email).digest('hex').slice(0, 32)

// Hash de relleno para el camino "cuenta inexistente". Se calcula una vez por
// instancia: derivarlo en cada intento fallido sería un DoS gratis contra mí.
let cachedDummy: string | null = null
async function dummyHash(): Promise<string> {
  cachedDummy ??= await hashPassword(`dummy-${Math.random()}`)
  return cachedDummy
}

/** Mensaje único para el usuario. Deliberadamente idéntico en todos los fallos. */
export function loginErrorMessage(outcome: Extract<LoginOutcome, { ok: false }>): string {
  switch (outcome.reason) {
    case 'locked':
      return `Demasiados intentos fallidos. Vuelve a intentar en máximo ${outcome.retryAfterMin ?? 15} minutos.`
    case 'disabled':
      return 'Tu acceso ha sido desactivado. Contacta con tu administrador.'
    case 'no_portal':
      return 'El portal de este cliente no está habilitado.'
    default:
      return 'Correo o contraseña incorrectos.'
  }
}
