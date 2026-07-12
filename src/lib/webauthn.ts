// WebAuthn (passkeys / llaves FIDO2 como YubiKey) como segundo factor del
// panel admin. Se apoya en @simplewebauthn/server (estándar, sin costo).
//
// Modelo: la identidad SIGUE siendo el login de GitHub (allowlist en auth.ts).
// WebAuthn no reemplaza el OAuth, lo refuerza: tras iniciar sesión con GitHub,
// si el login ya tiene ≥1 llave registrada, el middleware exige además probar
// posesión de esa llave (step-up) antes de dejar pasar a /admin. Mientras el
// login no tenga ninguna llave registrada, el gate está apagado — así registrar
// la primera llave nunca puede dejar a nadie fuera de su propio panel.
//
// Dos ceremonias, dos superficies distintas:
//  - Registro (alta de una llave nueva): vive bajo /api/admin/webauthn/*, así
//    que hereda el gate de sesión+allowlist del middleware. Antes de la
//    primera llave el gate de MFA todavía no aplica, así que también sirve
//    para el alta inicial sin quedar bloqueado a medio camino.
//  - Autenticación (probar posesión, step-up): vive bajo /api/auth/webauthn/*,
//    fuera de /admin, porque se ejecuta ANTES de que la cookie de MFA exista.
//    Cada handler valida la sesión de GitHub + allowlist por su cuenta.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
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
import { webauthnCredentials } from '../db/schema'

// ── Relying Party ────────────────────────────────────────────────────────

const PROD_HOST = 'codebymike.tech'

function rpConfig(): { rpID: string; rpName: string; origin: string } {
  const override = process.env.WEBAUTHN_RP_ID
  const isProd = import.meta.env.PROD
  const rpID = override ?? (isProd ? PROD_HOST : 'localhost')
  const origin = isProd ? `https://${rpID}` : `http://${rpID}:4321`
  return { rpID, rpName: 'CodeByMike Admin', origin }
}

// ── Cookies de ceremonia (challenge) ─────────────────────────────────────
// El navegador tarda hasta ~2 min en una ceremonia (esperar el toque físico
// de la llave). El challenge vive en una cookie httpOnly de corta vida; si se
// manipula, la verificación simplemente falla (fail-closed, no hace falta
// firmarla: no concede nada por sí sola).

const CHALLENGE_COOKIE = 'wan_challenge'
const CHALLENGE_TTL_SEC = 5 * 60

type ChallengeData = { challenge: string; login: string; kind: 'reg' | 'auth' }

function setChallenge(cookies: AstroCookies, data: ChallengeData): void {
  cookies.set(CHALLENGE_COOKIE, JSON.stringify(data), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: CHALLENGE_TTL_SEC,
  })
}

function takeChallenge(cookies: AstroCookies, kind: 'reg' | 'auth', login: string): string | null {
  const raw = cookies.get(CHALLENGE_COOKIE)?.value
  cookies.delete(CHALLENGE_COOKIE, { path: '/' }) // un solo uso, siempre se consume
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ChallengeData
    if (data.kind !== kind || data.login !== login) return null
    return data.challenge
  } catch {
    return null
  }
}

// ── Cookie de MFA verificado (la que realmente abre /admin) ─────────────
// Firmada con HMAC (no cifrada: no lleva secretos, solo la sentencia "este
// sid pasó el step-up antes de expiresAt"). Atada al `sid` del JWT de la
// sesión de GitHub, así que no es transferible entre sesiones/dispositivos:
// robar la cookie de MFA sin la cookie de sesión de Auth.js no sirve de nada.

const MFA_COOKIE = 'admin_mfa'
const MFA_TTL_MS = 12 * 60 * 60 * 1000 // re-pedir la llave cada 12h

function mfaSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET no configurado (requerido por auth-astro y por el MFA)')
  return s
}

function signMfaPayload(sid: string, expiresAtMs: number): string {
  const payload = `${sid}.${expiresAtMs}`
  const sig = createHmac('sha256', mfaSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

/** Marca el sid actual como verificado por MFA durante MFA_TTL_MS. */
export function issueMfaCookie(cookies: AstroCookies, sid: string): void {
  const expiresAtMs = Date.now() + MFA_TTL_MS
  cookies.set(MFA_COOKIE, signMfaPayload(sid, expiresAtMs), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: MFA_TTL_MS / 1000,
  })
}

/** ¿El sid actual ya pasó el step-up y sigue vigente? Verificación constant-time. */
export function hasMfaCookie(cookies: AstroCookies, sid: string): boolean {
  const raw = cookies.get(MFA_COOKIE)?.value
  if (!raw) return false
  const parts = raw.split('.')
  if (parts.length !== 3) return false
  const [cookieSid, expStr, sig] = parts
  if (cookieSid !== sid) return false
  const expiresAtMs = Number(expStr)
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false
  const expected = createHmac('sha256', mfaSecret()).update(`${cookieSid}.${expStr}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function clearMfaCookie(cookies: AstroCookies): void {
  cookies.delete(MFA_COOKIE, { path: '/' })
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

// hasCredentials() se consulta en el middleware en CADA request a /admin, así
// que se cachea en memoria con TTL corto (mismo patrón que blocklist.ts).
const CACHE_TTL_MS = 30_000
const hasCredsCache = new Map<string, { value: boolean; fetchedAt: number }>()

export function invalidateCredentialsCache(login: string): void {
  hasCredsCache.delete(login)
}

/** ¿El login tiene al menos una llave registrada? Determina si el MFA aplica. */
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
    // Fail-open: si Turso falla, no inventamos un requisito de MFA que nadie
    // pueda cumplir y que tumbaría el panel entero.
    return false
  }
}

// ── Registro (alta de una llave nueva) ────────────────────────────────────

export async function buildRegistrationOptions(login: string, cookies: AstroCookies) {
  const { rpID, rpName } = rpConfig()
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
  setChallenge(cookies, { challenge: options.challenge, login, kind: 'reg' })
  return options
}

export async function finishRegistration(
  login: string,
  response: RegistrationResponseJSON,
  nickname: string | undefined,
  cookies: AstroCookies
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rpID, origin } = rpConfig()
  const expectedChallenge = takeChallenge(cookies, 'reg', login)
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

// ── Autenticación (step-up: probar posesión) ──────────────────────────────

export async function buildAuthenticationOptions(login: string, cookies: AstroCookies) {
  const { rpID } = rpConfig()
  const existing = await listCredentials(login)
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined,
    })),
  })
  setChallenge(cookies, { challenge: options.challenge, login, kind: 'auth' })
  return options
}

export async function finishAuthentication(
  login: string,
  response: AuthenticationResponseJSON,
  cookies: AstroCookies
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rpID, origin } = rpConfig()
  const expectedChallenge = takeChallenge(cookies, 'auth', login)
  if (!expectedChallenge) return { ok: false, error: 'challenge expirado o inválido, intenta de nuevo' }

  const [row] = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, response.id), eq(webauthnCredentials.login, login)))
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
  return { ok: true }
}

export async function deleteCredential(login: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.login, login)))
    .returning({ id: webauthnCredentials.id })
  invalidateCredentialsCache(login)
  return deleted.length > 0
}
