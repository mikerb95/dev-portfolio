import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=gl-egl'] })
const rutas = { '404':'/no-existe', hola:'/hola', feedback:'/feedback', cv:'/cv/descargar', sala:'/lab/fingerprint/abc123', tablero:'/lab/fingerprint/abc123/board' }
for (const scheme of ['light','dark']) for (const w of [1440,390]) {
  const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: w, height: 900 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  for (const [n,r] of Object.entries(rutas)) {
    if (n==='cv') await p.route('**/api/cv/**', x => x.abort())
    await p.goto('http://localhost:4417'+r, { waitUntil: 'networkidle' }).catch(()=>{})
    await p.waitForTimeout(1500)
    const tema = await p.evaluate(() => document.documentElement.dataset.tema ?? '-')
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    console.log(scheme, w, n, 'tema='+tema, 'desborde='+desborde)
    await p.screenshot({ path: '/tmp/claude-1000/-home-mike-dev-work-github-com-portfolio/4225e611-f3d1-4d43-a55a-3c6ea20f7647/scratchpad/cap/'+n+'-'+scheme+'-'+w+'.png', fullPage: n==='tablero' })
  }
  await ctx.close()
}
await b.close()
