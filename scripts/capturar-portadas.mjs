#!/usr/bin/env node
/**
 * Captura la portada real de cada proyecto con sitio en vivo.
 *
 *   node scripts/capturar-portadas.mjs                 # a .tmp/portadas/ (para revisar)
 *   node scripts/capturar-portadas.mjs --slug=dobleyo  # solo uno
 *   node scripts/capturar-portadas.mjs --aplicar       # copia a public/ y actualiza la base
 *
 * Se separa capturar de aplicar a propósito: un sitio caído o con un aviso
 * encima produce una portada peor que la vieja, así que las capturas se miran
 * antes de reemplazar nada. El nombre `portada_<slug>.webp` es el que
 * `capturar-instantanea.mjs` busca para no dejar la vitrina sin imágenes.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { createClient } from '@libsql/client'
import { readFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(root, '.tmp/portadas')
const PUB = join(root, 'public/assets/screenshots')
const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SOLO = args.find((a) => a.startsWith('--slug='))?.slice(7)

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

// Proyectos ocultos, con dominio muerto o con el sitio devolviendo 500 no se capturan:
// una portada de error es peor que no tener portada.
const EXCLUIR = new Set(['eko', 'residentialaccess', 'capacitaciones-ia', 'sena-uptime'])
const { rows } = await db.execute('select id, slug, preview_url from projects where visible = 1 and preview_url is not null order by id')
// slidehub y SlideHub apuntan al mismo sitio y comparten archivo en minúsculas.
const porArchivo = new Map()
for (const r of rows) {
  const slug = String(r.slug).toLowerCase()
  if (EXCLUIR.has(slug) || (SOLO && slug !== SOLO.toLowerCase())) continue
  if (!porArchivo.has(slug)) porArchivo.set(slug, { slug, url: String(r.preview_url), ids: [] })
  porArchivo.get(slug).ids.push(Number(r.id))
}

if (!APLICAR) {
  mkdirSync(TMP, { recursive: true })
  const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { localStorage['lang-prompt-dismissed'] = '1' } catch {} })
  const informe = []
  for (const p of porArchivo.values()) {
    const page = await ctx.newPage()
    try {
      const res = await page.goto(p.url, { waitUntil: 'load', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      await page.getByRole('button', { name: /^aceptar$/i }).first().click({ timeout: 1500 }).catch(() => {})
      await page.waitForTimeout(3000)
      const png = await page.screenshot({ type: 'png' })
      await sharp(png).webp({ quality: 82 }).toFile(join(TMP, `portada_${p.slug}.webp`))
      informe.push(`${p.slug}: ${res?.status()} ${p.url}`)
    } catch (e) {
      informe.push(`${p.slug}: FALLÓ ${e.message.split('\n')[0]}`)
    }
    await page.close()
  }
  await browser.close()
  console.log(informe.join('\n'))
} else {
  for (const p of porArchivo.values()) {
    const origen = join(TMP, `portada_${p.slug}.webp`)
    if (!existsSync(origen)) continue
    copyFileSync(origen, join(PUB, `portada_${p.slug}.webp`))
    const viejo = join(PUB, `portada_${p.slug}.png`)
    if (existsSync(viejo)) unlinkSync(viejo)
    const ruta = `/assets/screenshots/portada_${p.slug}.webp`
    for (const id of p.ids) await db.execute({ sql: 'update projects set screenshot_url = ? where id = ?', args: [ruta, id] })
    console.log('aplicada', p.slug, p.ids.join(','))
  }
}
