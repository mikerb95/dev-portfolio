import { chromium } from 'playwright'
import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'

const BASE = 'http://localhost:4326'
const secret = process.env.AUTH_SECRET
const login = 'mikerb95'

const dbc = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
await dbc.execute({ sql: `DELETE FROM webauthn_credentials WHERE login = ?`, args: [login] })

async function mintGithubCookie() {
  const sid = crypto.randomUUID()
  const token = await encode({
    token: { sub: 'test-user-id', login, picture: '', sid },
    secret,
    salt: 'authjs.session-token',
  })
  return token
}

const results = []
const log = (msg) => { console.log(msg); results.push(msg) }

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
page.on('pageerror', (err) => log(`   [pageerror] ${err.message}`))
page.on('dialog', async (d) => {
  log(`   [dialog:${d.type()}] ${d.message()}`)
  if (d.type() === 'prompt') await d.accept('YubiKey passwordless test')
  else await d.accept()
})

const cdp = await context.newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})
log('✅ virtual authenticator creado')

// 1) Bootstrap: entrar con GitHub (cookie minteada) para registrar la primera llave
await context.addCookies([{ name: 'authjs.session-token', value: await mintGithubCookie(), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
await page.goto(`${BASE}/admin/passkeys`, { waitUntil: 'networkidle' })
log(`1) GET /admin/passkeys (con GitHub) → url=${page.url()}`)
if (!page.url().endsWith('/admin/passkeys')) throw new Error('FAIL: no debería redirigir con sesión de GitHub válida')

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
  page.click('#add-key-btn'),
])
await page.waitForTimeout(500)
const bodyText = await page.textContent('body')
log(`2) tras registrar, ¿aparece la llave? ${bodyText.includes('YubiKey passwordless test')}`)
if (!bodyText.includes('YubiKey passwordless test')) throw new Error('FAIL: la llave no aparece tras registrarla')

// 2) Cerrar sesión de GitHub por completo (borrar TODAS las cookies)
await context.clearCookies()
let resp = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`3) GET /admin SIN ninguna cookie → url=${page.url()}`)
if (!page.url().includes('/login')) throw new Error('FAIL: sin sesión debería mandar a /login')

// 3) Ir a /login y usar SOLO la llave (sin GitHub) — el authenticator sigue
// teniendo la credencial de este mismo context/browser.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
log(`4) GET /login → url=${page.url()}`)
const hasPasskeyBtn = await page.$('#btn-passkey')
log(`   ¿existe el botón "usar mi llave"? ${!!hasPasskeyBtn}`)
if (!hasPasskeyBtn) throw new Error('FAIL: no está el botón de passkey en /login')

await page.click('#btn-passkey')
await page.waitForTimeout(2500)
log(`5) tras click en "usar mi llave" (sin GitHub) → url final: ${page.url()}`)
if (!page.url().endsWith('/admin') && !page.url().includes('/entrar')) {
  const st = await page.textContent('#login-status').catch(() => null)
  throw new Error(`FAIL: no llegó a /admin ni /entrar. status visible: "${st}"`)
}
log('✅ login SOLO con la llave (sin GitHub) funcionó')

// 3b) Esperar a que el interstitial /entrar termine su redirect client-side a /admin
await page.waitForTimeout(1500)
log(`5b) tras esperar el interstitial → url=${page.url()}`)

// 4) Confirmar que la sesión resultante es real: /admin carga con la identidad correcta
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
log(`6) GET /admin tras login por llave → url=${page.url()}`)
if (!page.url().endsWith('/admin')) throw new Error('FAIL: la sesión de passkey no dio acceso real a /admin')

// 5) 🔍 probe: un authenticator SIN la credencial no debe poder entrar
const context2 = await browser.newContext()
const page2 = await context2.newPage()
const cdp2 = await context2.newCDPSession(page2)
await cdp2.send('WebAuthn.enable')
await cdp2.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})
await page2.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page2.click('#btn-passkey')
await page2.waitForTimeout(2000)
const st2 = await page2.textContent('#login-status').catch(() => null)
log(`7) 🔍 probe: login con authenticator SIN la credencial real → url=${page2.url()} status="${st2}"`)
if (page2.url().endsWith('/admin')) throw new Error('FAIL DE SEGURIDAD: entró a /admin sin la credencial real')
log('   ✅ correctamente rechazado (no entró a /admin)')

// 6) Limpieza final
await dbc.execute({ sql: `DELETE FROM webauthn_credentials WHERE login = ?`, args: [login] })
log('8) limpieza de credenciales de prueba: hecha')

await browser.close()
log('\n✅ TODOS LOS PASOS PASARON (diseño passwordless independiente)')
