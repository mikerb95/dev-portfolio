// Exporta cada diagrama BPMN vertical a docs/diagramas-bpmn/ como SVG y PNG con
// fondo blanco, para insertarlos en el documento de arquitectura.
//
// El render sale de la página imprimible (/docs/bpmn-imprimible), no de una
// segunda implementación: el SVG que se guarda es exactamente el que se ve, con
// el mismo motor de layout y la misma paleta. Si algún día cambian, cambian a
// la vez.
//
// Uso:
//   node scripts/export-bpmn.mjs                        # arranca el dev server si hace falta
//   node scripts/export-bpmn.mjs --url http://localhost:4321
//   node scripts/export-bpmn.mjs --escala 3             # PNG a 3x (por defecto 2x)

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const salida = join(root, 'docs', 'diagramas-bpmn')

const args = process.argv.slice(2)
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`)
  return i === -1 ? porDefecto : args[i + 1]
}

const url = opcion('url', 'http://localhost:4321')
const escala = Number(opcion('escala', '2'))
const ruta = `${url}/docs/bpmn-imprimible`

/** ¿Hay ya un servidor escuchando? Si lo hay se reutiliza en vez de levantar otro. */
async function responde() {
  try {
    const r = await fetch(ruta, { signal: AbortSignal.timeout(2500) })
    return r.ok
  } catch {
    return false
  }
}

async function arrancarDev() {
  console.log('· Levantando el servidor de desarrollo…')
  const proc = spawn('npm', ['run', 'dev'], { cwd: root, stdio: 'ignore', detached: true })
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await responde()) return proc
  }
  proc.kill()
  throw new Error(`El servidor no respondió en ${ruta}. Arráncalo con "npm run dev" y reintenta.`)
}

const dev = (await responde()) ? null : await arrancarDev()

await mkdir(salida, { recursive: true })

const browser = await chromium.launch()
// La escala del dispositivo es lo que da nitidez al PNG: el SVG se rasteriza al
// tamaño real de la captura, no se amplía después.
const page = await browser.newPage({ deviceScaleFactor: escala })
await page.goto(ruta, { waitUntil: 'networkidle' })

// Se extrae el SVG a su tamaño natural: en la hoja está encogido para caber, y
// exportarlo así congelaría la escala de impresión dentro del archivo.
const diagramas = await page.evaluate(() => {
  // La barra de herramientas del servidor de desarrollo flota sobre la página y
  // se cuela dentro de la captura del diagrama.
  document.querySelector('astro-dev-toolbar')?.remove()

  // Las reglas de la paleta y de las clases de texto viven en la hoja de
  // estilos del sitio; un SVG suelto en un archivo no las tendría, así que se
  // copian dentro del propio documento SVG.
  const reglas = []
  for (const hoja of document.styleSheets) {
    let css
    try {
      css = hoja.cssRules
    } catch {
      continue // hoja de otro origen: no aporta nada nuestro
    }
    for (const regla of css) {
      if (regla.selectorText?.includes('bpmn')) reglas.push(regla.cssText)
    }
  }
  const estilos = reglas.join('\n')

  return [...document.querySelectorAll('.hoja .lienzo')].map((lienzo) => {
    const svg = lienzo.querySelector('svg')
    const figura = lienzo.querySelector('.bpmn')
    const w = Number(svg.getAttribute('width'))
    const h = Number(svg.getAttribute('height'))

    // Copia autónoma para el archivo .svg: con las clases de la paleta en el
    // nodo raíz, las reglas copiadas aplican igual que en la página.
    const copia = svg.cloneNode(true)
    copia.removeAttribute('style')
    copia.setAttribute('class', figura.getAttribute('class'))
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    // Las familias tipográficas se nombran explícitamente: el SVG puede acabar
    // abierto en un visor que no tenga las variables CSS del sitio.
    style.textContent = `
      .bpmn-scope text { font-family: "Inter Variable", Inter, system-ui, sans-serif; }
      .bpmn-scope .bpmn-duracion { font-family: "JetBrains Mono Variable", ui-monospace, monospace; }
      ${estilos}
    `
    copia.insertBefore(style, copia.firstChild)

    // Fondo explícito: un SVG es transparente, y sobre el fondo de una diapositiva
    // o de un documento oscuro el diagrama en tinta negra desaparecería.
    const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    fondo.setAttribute('width', '100%')
    fondo.setAttribute('height', '100%')
    fondo.setAttribute('fill', '#ffffff')
    copia.insertBefore(fondo, style.nextSibling)

    // El nombre del archivo sale del id del proceso, que ya es el que usa la
    // web; el título lleva tildes y paréntesis.
    return { id: lienzo.dataset.proceso, w, h, svg: copia.outerHTML }
  })
})

// El PNG se rasteriza desde el SVG ya exportado, no desde la hoja: así la
// imagen y el archivo vectorial no pueden divergir, y la captura no depende del
// tamaño al que la hoja hubiera encogido el diagrama.
const fuentes = Object.fromEntries(
  await Promise.all(
    Object.entries({
      'Inter Variable': 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
      'JetBrains Mono Variable':
        'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
    }).map(async ([familia, ruta]) => [familia, (await readFile(join(root, ruta))).toString('base64')]),
  ),
)
const caras = Object.entries(fuentes)
  .map(
    ([familia, b64]) =>
      `@font-face{font-family:"${familia}";font-weight:100 900;src:url(data:font/woff2;base64,${b64}) format("woff2")}`,
  )
  .join('')

const lienzo = await browser.newPage({ deviceScaleFactor: escala })
for (const d of diagramas) {
  const svgPath = join(salida, `${d.id}-vertical.svg`)
  const pngPath = join(salida, `${d.id}-vertical.png`)

  await writeFile(svgPath, `<?xml version="1.0" encoding="UTF-8"?>\n${d.svg}\n`, 'utf8')

  await lienzo.setViewportSize({ width: d.w, height: d.h })
  await lienzo.setContent(`<style>${caras}html,body{margin:0;background:#fff}</style>${d.svg}`)
  await lienzo.locator('svg').first().screenshot({ path: pngPath, scale: 'device' })

  console.log(`✓ ${d.id.padEnd(16)} ${d.w}×${d.h} px  →  ${d.id}-vertical.svg · ${d.id}-vertical.png (${escala}x)`)
}

await browser.close()
if (dev) {
  process.kill(-dev.pid, 'SIGTERM')
  console.log('· Servidor de desarrollo detenido')
}
console.log(`\nListos en ${salida}`)
