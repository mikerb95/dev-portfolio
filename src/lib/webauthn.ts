// WebAuthn (passkeys / llaves FIDO2 como YubiKey) como método de login
// ALTERNATIVO al panel admin — no un segundo factor obligatorio encima de
// GitHub. Se apoya en @simplewebauthn/server (estándar, sin costo).
//
// Modelo: dos puertas de entrada independientes, cualquiera basta por sí sola.
//  - GitHub OAuth (allowlist en auth.ts): como siempre.
//  - Llave de seguridad (passwordless, discoverable credential): la llave
//    identifica al login por sí misma, sin pasar por GitHub. auth.config.ts
//    la conecta como provider 'passkey' (Credentials) — la ceremonia FIDO2
//    corre aquí, y el resultado se entrega a Auth.js como un proof firmado
//    de vida corta para que emita una sesión real, igual que el OAuth.
//
// Dos ceremonias, dos superficies distintas:
//  - Registro (alta de una llave nueva): vive bajo /api/admin/webauthn/*, así
//    que hereda el gate de sesión+allowlist del middleware (hay que estar
//    dentro del panel, vía GitHub, para dar de alta la primera llave).
//  - Autenticación (login passwordless): vive bajo /api/auth/webauthn/*,
//    fuera de /admin, porque se ejecuta SIN sesión previa — es la puerta de
//    entrada alternativa, no una verificación posterior.

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
// rpID/origin se derivan del Host real de cada request en vez de hardcodear
// dominio o puerto: así funcionan igual en prod (codebymike.tech), preview
// deployments de Vercel y `astro dev` en cualquier puerto libre. El origin
// que manda el navegador en la ceremonia debe calzar exacto con este valor.

function rpConfig(requestUrl: string): { rpID: string; rpName: string; origin: string } {
  const url = new URL(requestUrl)
  return { rpID: url.hostname, rpName: 'CodeByMike Admin', origin: url.origin }
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

// ── Proof firmado para el provider 'passkey' de Auth.js ─────────────────
// finishPrimaryAuthentication() (más abajo) confirma la posesión de la llave
// pero no crea sesión por sí sola — esa ceremonia FIDO2 vive fuera de Auth.js.
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

/** Firma un proof de "este login verificó su llave" válido por PROOF_TTL_MS. */
export function signPasskeyProof(login: string): string {
  const expiresAtMs = Date.now() + PROOF_TTL_MS
  const payload = `${login}.${expiresAtMs}`
  const sig = createHmac('sha256', hmacSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

/** Verifica el proof (firma + vigencia) y devuelve el login, o null si no es válido. */
export function verifyPasskeyProof(proof: string | undefined | null): string | null {
  if (!proof) return null
  const parts = proof.split('.')
  if (parts.length !== 3) return null
  const [login, expStr, sig] = parts
  const expiresAtMs = Number(expStr)
  if (!login || !Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null
  const expected = createHmac('sha256', hmacSecret()).update(`${login}.${expStr}`).digest('hex')
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
  setChallenge(cookies, { challenge: options.challenge, login, kind: 'reg' })
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

export async function buildAuthenticationOptions(login: string, cookies: AstroCookies, requestUrl: string) {
  const { rpID } = rpConfig(requestUrl)
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
  cookies: AstroCookies,
  requestUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rpID, origin } = rpConfig(requestUrl)
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
