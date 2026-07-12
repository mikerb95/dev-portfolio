import { chromium } from 'playwright'
import { encode } from '@auth/core/jwt'

const BASE = 'http://localhost:4325'
const secret = process.env.AUTH_SECRET
const login = 'mikerb95'

async function mintCookie() {
  const sid = crypto.randomUUID()
  const token = await encode({
    token: { sub: 'test-user-id', login, picture: '', sid },
    secret,
    salt: 'authjs.session-token',
  })
  return { token, sid }
}

const results = []
const log = (msg) => { console.log(msg); results.push(msg) }

const browser = await chromium.launch()
const context = await browser.newContext()
const { token } = await mintCookie()
await context.addCookies([
  { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
])

const page = await context.newPage()
page.on('console', (msg) => log(`   [console.${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => log(`   [pageerror] ${err.message}`))
page.on('dialog', async (d) => {
  log(`   [dialog:${d.type()}] ${d.message()}`)
  if (d.type() === 'prompt') await d.accept('YubiKey de prueba')
  else await d.accept()
})
const cdp = await context.newCDPSession(page)
await cdp.send('WebAuthn.enable')
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'usb',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
})
log(`✅ virtual authenticator (simula la YubiKey) creado: ${authenticatorId}`)

// 1) Sin llaves registradas: /admin debe cargar directo (MFA apagado)
let resp = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`1) GET /admin (sin llaves) → ${resp.status()} url=${page.url()}`)
if (!page.url().endsWith('/admin')) throw new Error('FAIL: no debería redirigir sin llaves registradas')

// 2) Ir a /admin/passkeys y registrar una llave
await page.goto(`${BASE}/admin/passkeys`, { waitUntil: 'networkidle' })
log(`2) GET /admin/passkeys → url=${page.url()}`)

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
  page.click('#add-key-btn'),
])
await page.waitForTimeout(500)
const bodyText = await page.textContent('body')
log(`3) tras registrar, ¿aparece "YubiKey de prueba"? ${bodyText.includes('YubiKey de prueba')}`)
if (!bodyText.includes('YubiKey de prueba')) throw new Error('FAIL: la llave registrada no aparece en la lista')

// 3) Nueva sesión (nuevo sid) del MISMO login: ahora sí debe pedir MFA
const context2 = await browser.newContext()
const { token: token2 } = await mintCookie()
await context2.addCookies([
  { name: 'authjs.session-token', value: token2, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
])
const page2 = await context2.newPage()
const cdp2 = await context2.newCDPSession(page2)
await cdp2.send('WebAuthn.enable')
// IMPORTANTE: authenticador nuevo y VACÍO en este contexto — para probar que
// SIN la llave correcta, la autenticación falla (no basta con "cualquier" llave).
await cdp2.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})

resp = await page2.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`4) GET /admin (login CON llaves, sid nuevo, MFA cookie ausente) → url=${page2.url()}`)
if (!page2.url().includes('/entrar/verificar')) throw new Error('FAIL: debería redirigir a /entrar/verificar')

// 4a) 🔍 probe: autenticador vacío (sin la credencial real) → debe fallar
await page2.waitForTimeout(1500)
let statusText = await page2.textContent('#verify-status')
log(`4a) 🔍 probe con autenticador SIN la credencial real → status="${statusText}"`)
if (!/falló|no reconocida|error/i.test(statusText || '')) {
  log(`   ⚠️ inesperado: se esperaba un mensaje de error, se vio: "${statusText}"`)
}

await context2.close()

// 5) Step-up real: MISMO browser context/authenticator que registró la llave
// (context, no context2) — nueva sesión (nuevo sid) del mismo login.
const token4data = await mintCookie()
await context.addCookies([
  { name: 'authjs.session-token', value: token4data.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
])
resp = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`5) GET /admin (sid nuevo, MISMO authenticator con la llave real) → url tras cadena de redirects: ${page.url()}`)
// El authenticator virtual tiene automaticPresenceSimulation:true, así que la
// cadena /admin → /entrar/verificar → tap automático → verify → /admin puede
// completarse ENTERA antes de que `networkidle` resuelva. Aterrizar ya en
// /admin es la señal de que el step-up se auto-completó de punta a punta.
await page.waitForTimeout(2000)
log(`6) tras step-up automático → url final: ${page.url()}`)
if (!page.url().endsWith('/admin')) {
  const st = await page.textContent('#verify-status').catch(() => null)
  throw new Error(`FAIL: no volvió a /admin. status visible: "${st}"`)
}
log('✅ step-up con la llave real funcionó: entró a /admin tras tocar la YubiKey virtual')

// 7) Revisitar /admin en la MISMA sesión: no debe volver a pedir la llave (cookie MFA de 12h)
resp = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`7) segunda visita a /admin (misma sesión) → url=${page.url()} (no debería pedir MFA de nuevo)`)
if (!page.url().endsWith('/admin')) throw new Error('FAIL: pidió MFA de nuevo en la misma sesión')

// 8) Borrar la llave (vía la propia página, ya con MFA pasado) y confirmar que
// una visita POSTERIOR a /admin con OTRA sesión nueva ya no exige MFA.
const delRes = await page.evaluate(async () => {
  const listRes = await fetch('/api/admin/webauthn/credentials')
  const items = await listRes.json()
  const out = []
  for (const it of items) {
    const r = await fetch('/api/admin/webauthn/credentials', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id }),
    })
    out.push([it.id, r.status])
  }
  return out
})
log(`8) borradas todas las llaves: ${JSON.stringify(delRes)}`)

const token5 = await mintCookie()
await context.addCookies([
  { name: 'authjs.session-token', value: token5.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
])
resp = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`9) sesión NUEVA tras borrar todas las llaves → url=${page.url()} (MFA debe estar apagado de nuevo)`)
if (!page.url().endsWith('/admin')) throw new Error('FAIL: el MFA debería haberse apagado al borrar la última llave')

await browser.close()
log('\n✅ TODOS LOS PASOS PASARON')
