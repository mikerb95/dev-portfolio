import { chromium } from 'playwright'
const S = '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/f1884f35-b550-481c-9dcf-31327ecd63a4/scratchpad/'
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] })
const errores = []
// Escritorio, con movimiento: chat abierto, panel del pulso, cambio de tema en caliente.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'es-CO' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://localhost:4517/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: S + 'c-hero-vivo.png' })
  await p.evaluate(() => window.scrollTo(0, 520)); await p.waitForTimeout(800)
  const senal = p.locator('.pulso-wrap [data-senal]').first()
  if (await senal.count()) { await senal.hover({ force: true }); await p.waitForTimeout(1200) }
  await p.screenshot({ path: S + 'c-pulso.png' })
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.locator('.wa-fab').click({ force: true }); await p.waitForTimeout(900)
  await p.screenshot({ path: S + 'c-fab.png' })
  const op = p.locator('.asesor-opcion').nth(1)
  if (await op.count()) { await op.click({ force: true }); await p.waitForTimeout(1500); await p.screenshot({ path: S + 'c-chat.png' }) }
  await p.keyboard.press('Escape')
  // Botón de tema: a oscuro y de vuelta, y que se guarde.
  await p.locator('[data-tema-boton]').first().click({ force: true }); await p.waitForTimeout(700)
  console.log('tras clic:', await p.evaluate(() => [document.documentElement.dataset.tema ?? 'oscuro', localStorage.getItem('tema'), document.querySelector('meta[name=theme-color]').content, document.querySelector('[data-tema-boton]').getAttribute('aria-label')]))
  await p.screenshot({ path: S + 'c-vuelta-oscuro.png' })
  await p.reload({ waitUntil: 'networkidle' })
  console.log('tras recargar con sistema claro y elección oscuro:', await p.evaluate(() => document.documentElement.dataset.tema ?? 'oscuro'))
  await ctx.close()
}
// Móvil en claro, menú abierto.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'es-CO', reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://localhost:4517/', { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(1500)
  await p.screenshot({ path: S + 'm-hero.png' })
  await p.locator('#navbar-toggle').click({ force: true }); await p.waitForTimeout(500)
  await p.screenshot({ path: S + 'm-menu.png' })
  await p.locator('#navbar-toggle').click({ force: true })
  for (const id of ['bento', 'proyectos', 'expertise']) { await p.evaluate((s) => document.getElementById(s)?.scrollIntoView(), id); await p.waitForTimeout(900); await p.screenshot({ path: S + `m-${id}.png` }) }
  console.log('desborde horizontal:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth))
  await ctx.close()
}
if (errores.length) console.log('ERRORES', errores.slice(0, 6))
await b.close()
