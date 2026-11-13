import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=gl-egl'] })
const rutas = { '404':'/no-existe', hola:'/hola', feedback:'/feedback', cv:'/cv/descargar', sala:'/lab/fingerprint/abc123', tablero:'/lab/fingerprint/abc123/board' }
for (const scheme of ['light','dark']) for (const w of [1440,390]) {
  const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: w, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript(() => { try { localStorage.setItem('idioma-aviso', '1') } catch {} })
  const p = await ctx.newPage()
  await p.route('**/api/cv/capture', () => {})
  for (const [n,r] of Object.entries(rutas)) {
    await p.goto('http://localhost:4417'+r, { waitUntil: n==='cv' ? 'load' : 'networkidle' }).catch(()=>{})
    await p.waitForTimeout(1500)
    const tema = await p.evaluate(() => document.documentElement.dataset.tema ?? '-')
    console.log(scheme, w, n, 'tema='+tema)
    await p.screenshot({ path: '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/4225e611-f3d1-4d43-a55a-3c6ea20f7647/scratchpad/cap/'+n+'-'+scheme+'-'+w+'.png', fullPage: n==='tablero' || n==='sala' && w===390 })
  }
  await ctx.close()
}
await b.close()
