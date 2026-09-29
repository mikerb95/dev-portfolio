// Prueba visual temporal del escenario del analista. Se borra al terminar.
import { encode } from '@auth/core/jwt'
import { chromium } from 'playwright'
import { randomUUID } from 'node:crypto'

process.loadEnvFile('.env')
const BASE = 'http://localhost:4420'
const OUT = process.argv[2]
const login = (process.env.ALLOWED_GITHUB_LOGINS ?? '').split(',')[0].trim().toLowerCase()
const sid = randomUUID()
const nombre = 'authjs.session-token'
const token = await encode({
  token: { name: login, sub: 'prueba-analista', login, sid, authTime: Date.now() },
  secret: process.env.AUTH_SECRET,
  salt: nombre,
})

const browser = await chromium.launch({ args: ['--use-angle=gl-egl'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await ctx.addCookies([{ name: nombre, value: token, url: BASE, httpOnly: true }])
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('[consola]', m.text()))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

try {
  const res = await page.goto(`${BASE}/admin/analista`, { waitUntil: 'networkidle' })
  log('carga', res?.status(), page.url())
  await page.screenshot({ path: `${OUT}/1-inicio.png` })

  await page.fill('#pregunta', 'Revisa la última semana y dime qué merece mi atención. Si hay un origen persistente, propón bloquearlo.')
  await page.click('#enviar')
  await page.waitForTimeout(18_000)
  await page.screenshot({ path: `${OUT}/2-trabajando.png` })
  log('captura trabajando')

  // Espera el diálogo de bloqueo o el final, lo que llegue primero.
  const primero = await Promise.race([
    page.waitForSelector('#aprobacion[open]', { timeout: 240_000 }).then(() => 'dialogo'),
    page.waitForFunction(() => document.querySelector('#estadisticas')?.textContent, null, { timeout: 240_000 }).then(() => 'fin'),
  ])
  log('primero:', primero)
  if (primero === 'dialogo') {
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/3-dialogo.png` })
    await page.click('#ap-rechazar')
    log('rechazado')
    await page.waitForFunction(() => document.querySelector('#estadisticas')?.textContent, null, { timeout: 240_000 })
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/4-final.png` })
  log('estadisticas:', await page.textContent('#estadisticas'))
} finally {
  // Revoca la sesión de prueba para que no quede un dispositivo colgado.
  const r = await page.request.post(`${BASE}/api/admin/sessions`, { data: { id: sid }, headers: { origin: BASE } })
  log('revocada', r.status())
  await browser.close()
}
