// Genera public/og-<slug>.png (1200x630) para cada sección de scripts/og/sections.mjs
// a partir de scripts/og/template.html, usando Playwright (chromium headless).
//
// Uso:
//   node scripts/og/generate.mjs            # genera todas las secciones
//   node scripts/og/generate.mjs status log  # genera solo las indicadas

import { chromium } from 'playwright'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sections } from './sections.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

const FONTS = {
  inter: join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
  mono: join(root, 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'),
  serif: join(root, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'),
}

function ornamentHtml(kind) {
  switch (kind) {
    case 'bars': {
      const heights = [28, 40, 22, 52, 64, 18, 46, 34, 58, 30, 44, 26]
      const alertIdx = 5
      return `<div class="bars">${heights
        .map((h, i) => `<div class="bar${i === alertIdx ? ' alert' : ''}" style="height:${h}px"></div>`)
        .join('')}</div>`
    }
    case 'grid': {
      const filled = new Set([1, 4, 6, 9, 11, 14])
      return `<div class="grid-orn">${Array.from({ length: 16 })
        .map((_, i) => `<div class="cell${filled.has(i) ? ' fill' : ''}"></div>`)
        .join('')}</div>`
    }
    case 'architecture':
      return `<div class="arch">
        <div class="node"></div><div class="line"></div>
        <div class="node"></div><div class="line"></div>
        <div class="node"></div>
      </div>`
    case 'prose': {
      const widths = [180, 140, 165, 110, 150]
      return `<div class="prose-orn">${widths.map((w) => `<div class="ln" style="width:${w}px"></div>`).join('')}</div>`
    }
    case 'log': {
      const rows = [
        ['ok', '200 GET /api/status'],
        ['warn', '429 rate-limited 10.0.4.2'],
        ['crit', 'blocked wp-login.php scan'],
        ['ok', '200 GET /notes/feed'],
      ]
      return `<div class="log-orn">${rows
        .map(([sev, text]) => `<div class="row"><span class="sev ${sev}"></span>${text}</div>`)
        .join('')}</div>`
    }
    case 'badges':
      return `<div class="badges-orn"><div class="seal"></div><div class="seal"></div><div class="seal"></div></div>`
    case 'commits':
      return `<div class="commits-orn">${Array.from({ length: 5 })
        .map((_, i) => `<div class="dot"></div>${i < 4 ? '<div class="seg"></div>' : ''}`)
        .join('')}</div>`
    case 'available':
      return `<div class="available-orn"><div class="pulse"></div><div class="wordmark" style="font-size:15px">DISPONIBLE</div></div>`
    case 'brand':
      return `<div class="brand-orn"><div class="tag">codebymike.tech</div></div>`
    default:
      return ''
  }
}

function renderTemplate(template, fontUrls, section) {
  const badgeHtml = section.badge
    ? `<div class="badge"><span class="badge-dot"></span>${section.badge}</div>`
    : ''

  return template
    .replaceAll('__INTER_FONT__', fontUrls.inter)
    .replaceAll('__MONO_FONT__', fontUrls.mono)
    .replaceAll('__SERIF_FONT__', fontUrls.serif)
    .replaceAll('__KICKER__', section.kicker)
    .replaceAll('__KICKER_LABEL__', section.kickerLabel)
    .replaceAll('__TITLE_LINE1__', section.titleLine1)
    .replaceAll('__TITLE_LINE2__', section.titleLine2)
    .replaceAll('__DESCRIPTION__', section.description)
    .replaceAll('__BADGE__', badgeHtml)
    .replaceAll('__ORNAMENT__', ornamentHtml(section.ornament))
}

async function main() {
  const requested = process.argv.slice(2)
  const targets = requested.length
    ? sections.filter((s) => requested.includes(s.slug))
    : sections

  if (targets.length === 0) {
    console.error(`No matching sections for: ${requested.join(', ')}`)
    process.exit(1)
  }

  const template = await readFile(join(__dirname, 'template.html'), 'utf-8')
  const fontUrls = {
    inter: pathToFileURL(FONTS.inter).href,
    mono: pathToFileURL(FONTS.mono).href,
    serif: pathToFileURL(FONTS.serif).href,
  }

  const browser = await chromium.launch()
  const tmp = await mkdtemp(join(tmpdir(), 'og-'))

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })

    for (const section of targets) {
      const html = renderTemplate(template, fontUrls, section)
      const htmlPath = join(tmp, `${section.slug}.html`)
      await writeFile(htmlPath, html, 'utf-8')

      await page.goto(pathToFileURL(htmlPath).href)
      await page.evaluate(() => document.fonts.ready)

      const outPath = join(root, 'public', `og-${section.slug}.png`)
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } })
      console.log(`✓ public/og-${section.slug}.png`)
    }

    await page.close()
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
