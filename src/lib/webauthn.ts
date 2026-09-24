// WebAuthn (passkeys / llaves FIDO2 como YubiKey) como método de login
// ALTERNATIVO al panel admin - no un segundo factor obligatorio encima de
// GitHub. Se apoya en @simplewebauthn/server (estándar, sin costo).
//
// Modelo: dos puertas de entrada independientes, cualquiera basta por sí sola.
//  - GitHub OAuth (allowlist en auth.ts): como siempre.
//  - Llave de seguridad (passwordless, discoverable credential): la llave
//    identifica al login por sí misma, sin pasar por GitHub. auth.config.ts
//    la conecta como provider 'passkey' (Credentials) - la ceremonia FIDO2
//    corre aquí, y el resultado se entrega a Auth.js como un proof firmado
//    de vida corta para que emita una sesión real, igual que el OAuth.
//
// Dos ceremonias, dos superficies distintas:
//  - Registro (alta de una llave nueva): vive bajo /api/admin/webauthn/*, así
//    que hereda el gate de sesión+allowlist del middleware (hay que estar
//    dentro del panel, vía GitHub, para dar de alta la primera llave).
//  - Autenticación (login passwordless): vive bajo /api/auth/webauthn/*,
//    fuera de /admin, porque se ejecuta SIN sesión previa - es la puerta de
//    entrada alternativa, no una verificación posterior.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, and, gt, lt } from 'drizzle-orm'
import type { AstroCookies } from 'astro'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  WebAuthnCredential,
} from '@simplewebauthn/server'
import { db } from '../db'
import { webauthnChallenges, webauthnCredentials } from '../db/schema'
import { describeDevice } from './device-info'
import { sendPush } from './notify'
import { recordSecurityEvent } from './security/events'
import { siteUrl } from './site'

// ── Relying Party ────────────────────────────────────────────────────────
// rpID/origin se derivan del Host real de cada request en vez de hardcodear
// dominio o puerto: así funcionan igual en prod (codebymike.net), preview
// deployments de Vercel y `astro dev` en cualquier puerto libre. El origin
// que manda el navegador en la ceremonia debe calzar exacto con este valor.

function rpConfig(requestUrl: string): { rpID: string; rpName: string; origin: string } {
  const url = new URL(requestUrl)
  return { rpID: url.hostname, rpName: 'CodeByMike Admin', origin: url.origin }
}

// ── Challenge de la ceremonia ─────────────────────────────────────────────
// El navegador tarda hasta ~2 min en una ceremonia (esperar el toque físico
// de la llave). El challenge viaja en una cookie httpOnly de corta vida, que
// ata la ceremonia al navegador que la empezó, PERO la cookie no basta: la
// escribe el cliente y el servidor aceptaba el challenge que trajera. El
// challenge es la defensa contra la repetición, y con passkeys sincronizadas
// (iCloud, Google) el contador vale siempre 0, así que era la ÚNICA: quien
// capturara una aserción válida podía repetirla sin límite poniendo su propia
// cookie. Por eso además se guarda en la base al emitirse y la verificación lo
// consume allí: solo vale si lo emitió el servidor, antes de vencer y una vez.

const CHALLENGE_COOKIE = 'wan_challenge'
const CHALLENGE_TTL_SEC = 5 * 60

export type ChallengeData = { challenge: string; login: string; kind: 'reg' | 'auth' }

/**
 * Registra un challenge recién emitido. De paso barre los vencidos: el
 * endpoint de opciones del login es público, y sin el barrido cada ceremonia
 * abandonada dejaría una fila para siempre.
 */
export async function storeChallenge(data: ChallengeData, now = new Date()): Promise<void> {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now))
  await db.insert(webauthnChallenges).values({
    challenge: data.challenge,
    kind: data.kind,
    login: data.login,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SEC * 1000),
  })
}

/**
 * ¿Emitió el servidor este challenge, para esta ceremonia y este login, y
 * sigue vivo? Lo borra en la misma sentencia: dos verificaciones simultáneas
 * con el mismo challenge no pueden ganar las dos.
 */
export async function consumeChallenge(data: ChallengeData, now = new Date()): Promise<boolean> {
  const rows = await db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.challenge, data.challenge),
        eq(webauthnChallenges.kind, data.kind),
        eq(webauthnChallenges.login, data.login),
        gt(webauthnChallenges.expiresAt, now)
      )
    )
    .returning({ challenge: webauthnChallenges.challenge })
  return rows.length > 0
}

async function setChallenge(cookies: AstroCookies, data: ChallengeData): Promise<void> {
  await storeChallenge(data)
  cookies.set(CHALLENGE_COOKIE, JSON.stringify(data), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: CHALLENGE_TTL_SEC,
  })
}

async function takeChallenge(cookies: AstroCookies, kind: 'reg' | 'auth', login: string): Promise<string | null> {
  const raw = cookies.get(CHALLENGE_COOKIE)?.value
  cookies.delete(CHALLENGE_COOKIE, { path: '/' }) // un solo uso, siempre se consume
  if (!raw) return null
  let data: ChallengeData
  try {
    data = JSON.parse(raw) as ChallengeData
  } catch {
    return null
  }
  if (typeof data?.challenge !== 'string' || data.kind !== kind || data.login !== login) return null
  return (await consumeChallenge(data)) ? data.challenge : null
}

// ── Proof firmado para el provider 'passkey' de Auth.js ─────────────────
// finishPrimaryAuthentication() (más abajo) confirma la posesión de la llave
// pero no crea sesión por sí sola - esa ceremonia FIDO2 vive fuera de Auth.js.
// Empaquetamos el resultado en un proof firmado (HMAC, no cifrado: no lleva
// secretos, solo "este login verificó su llave antes de expiresAt") y de vida
// muy corta (30s) que el Credentials provider valida de forma síncrona en su
// authorize(), sin repetir la criptografía FIDO2 ahí.

const PROOF_TTL_MS = 30_000

function hmacSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET no configurado (requerido por auth-astro)')
  return s
}

// El prefijo separa dominios: AUTH_SECRET firma también los pases de demo, el
// de respaldo del portal y el acceso de la sustentación. Sin él, cualquier
// otra firma futura de `<algo>.<número>` con esa clave valdría como proof de
// login del admin.
const firmaProof = (payload: string) =>
  createHmac('sha256', hmacSecret()).update(`passkey:proof:v1:${payload}`).digest('hex')

/** Firma un proof de "este login verificó su llave" válido por PROOF_TTL_MS. */
export function signPasskeyProof(login: string): string {
  const expiresAtMs = Date.now() + PROOF_TTL_MS
  const payload = `${login}.${expiresAtMs}`
  return `${payload}.${firmaProof(payload)}`
}

/** Verifica el proof (firma + vigencia) y devuelve el login, o null si no es válido. */
export function verifyPasskeyProof(proof: string | undefined | null): string | null {
  if (!proof) return null
  const parts = proof.split('.')
  if (parts.length !== 3) return null
  const [login, expStr, sig] = parts
  const expiresAtMs = Number(expStr)
  if (!login || !Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null
  const expected = firmaProof(`${login}.${expStr}`)
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? login : null
}

// ── CRUD de credenciales ──────────────────────────────────────────────────

export type StoredCredential = typeof webauthnCredentials.$inferSelect

function toWebAuthnCredential(row: StoredCredential): WebAuthnCredential {
  return {
    id: row.id,
    publicKey: new Uint8Array(Buffer.from(row.publicKey, 'base64url')),
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[]) : undefined,
  }
}

export async function listCredentials(login: string): Promise<StoredCredential[]> {
  return db.select().from(webauthnCredentials).where(eq(webauthnCredentials.login, login))
}

// hasCredentials() la consulta la página de login para decidir si mostrar el
// botón de la llave; se cachea en memoria con TTL corto (mismo patrón que
// blocklist.ts) para no pegarle a Turso en cada carga de /login.
const CACHE_TTL_MS = 30_000
const hasCredsCache = new Map<string, { value: boolean; fetchedAt: number }>()

export function invalidateCredentialsCache(login: string): void {
  hasCredsCache.delete(login)
}

/** ¿El login tiene al menos una llave registrada? */
export async function hasCredentials(login: string): Promise<boolean> {
  const cached = hasCredsCache.get(login)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.value
  try {
    const rows = await db
      .select({ id: webauthnCredentials.id })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.login, login))
      .limit(1)
    const value = rows.length > 0
    hasCredsCache.set(login, { value, fetchedAt: now })
    return value
  } catch {
    // Fail-open: si Turso falla, no ocultamos el botón de GitHub por error.
    return false
  }
}

// ── Registro (alta de una llave nueva) ────────────────────────────────────

export async function buildRegistrationOptions(login: string, cookies: AstroCookies, requestUrl: string) {
  const { rpID, rpName } = rpConfig(requestUrl)
  const existing = await listCredentials(login)
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: login,
    userDisplayName: login,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })
  await setChallenge(cookies, { challenge: options.challenge, login, kind: 'reg' })
  return options
}

export async function finishRegistration(
  login: string,
  response: RegistrationResponseJSON,
  nickname: string | undefined,
  cookies: AstroCookies,
  requestUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rpID, origin } = rpConfig(requestUrl)
  const expectedChallenge = await takeChallenge(cookies, 'reg', login)
  if (!expectedChallenge) return { ok: false, error: 'challenge expirado o inválido, intenta de nuevo' }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'verificación fallida' }
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'no se pudo verificar la llave' }
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  await db.insert(webauthnCredentials).values({
    id: credential.id,
    login,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    nickname: nickname?.slice(0, 60) || null,
    createdAt: new Date(),
  })
  invalidateCredentialsCache(login)
  return { ok: true }
}

// ── Autenticación (login passwordless: probar posesión de la llave) ──────
// A diferencia del registro, aquí NO hay sesión de GitHub previa: no se
// conoce el login de antemano. Se apoya en llaves discoverable (resident
// key) - el navegador ofrece las credenciales guardadas para este rpID y el
// usuario elige/toca la suya; el login se descubre a partir del id devuelto.

export async function buildPrimaryAuthenticationOptions(cookies: AstroCookies, requestUrl: string) {
  const { rpID } = rpConfig(requestUrl)
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // Sin allowCredentials: el autenticador ofrece sus llaves discoverable
    // para este rpID (flujo usernameless/passwordless).
  })
  await setChallenge(cookies, { challenge: options.challenge, login: '', kind: 'auth' })
  return options
}

export async function finishPrimaryAuthentication(
  response: AuthenticationResponseJSON,
  cookies: AstroCookies,
  requestUrl: string
): Promise<{ ok: true; login: string } | { ok: false; error: string }> {
  const { rpID, origin } = rpConfig(requestUrl)
  const expectedChallenge = await takeChallenge(cookies, 'auth', '')
  if (!expectedChallenge) return { ok: false, error: 'challenge expirado o inválido, intenta de nuevo' }

  const [row] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, response.id))
    .limit(1)
  if (!row) return { ok: false, error: 'llave no reconocida' }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toWebAuthnCredential(row),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'verificación fallida' }
  }
  if (!verification.verified) return { ok: false, error: 'no se pudo verificar la llave' }

  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, row.id))

  return { ok: true, login: row.login }
}

export async function deleteCredential(login: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.login, login)))
    .returning({ id: webauthnCredentials.id })
  invalidateCredentialsCache(login)
  return deleted.length > 0
}

// ── Aviso de cambios en las llaves ──────────────────────────────────────
// Una llave es una puerta de entrada permanente: quien añada una conserva el
// acceso aunque después se revoquen todas las sesiones. Cada alta y cada baja
// avisa al teléfono y queda en el micro-SIEM, para que una llave que yo no
// puse no pase inadvertida. Fail-open, como toda notificación del repo.

export async function notifyPasskeyChange(
  change: 'added' | 'removed',
  info: { login: string; nickname?: string | null; ip: string | null; userAgent: string | null }
): Promise<void> {
  const titulo = change === 'added' ? 'Llave de seguridad añadida' : 'Llave de seguridad eliminada'
  const nombre = info.nickname ? `«${info.nickname}» · ` : ''
  await Promise.allSettled([
    sendPush(titulo, `${nombre}${describeDevice(info.userAgent)} · IP ${info.ip ?? 'desconocida'} · @${info.login}`, {
      priority: 4,
      tags: 'key',
      click: `${siteUrl()}/admin/passkeys`,
    }),
    recordSecurityEvent({
      ip: info.ip,
      classification: {
        category: 'admin_action',
        severity: 'medium',
        ruleId: change === 'added' ? 'passkey.registered' : 'passkey.removed',
      },
      method: change === 'added' ? 'POST' : 'DELETE',
      path: change === 'added' ? '/api/admin/webauthn/registration/verify' : '/api/admin/webauthn/credentials',
      userAgent: info.userAgent,
      statusCode: 200,
    }),
  ])
}
