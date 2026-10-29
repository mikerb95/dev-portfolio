import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REPO_URL,
  ordenarIds,
  reescribirEnlaces,
  reescribirHref,
  resolverRuta,
  separarTitulo,
  tituloDesdeMarkdown,
} from '../src/lib/wiki'

describe('resolverRuta', () => {
  it('sube y baja directorios', () => {
    expect(resolverRuta('docs/wiki', '../../src/middleware.ts')).toBe('src/middleware.ts')
    expect(resolverRuta('docs/wiki', '../plan-lab.md')).toBe('docs/plan-lab.md')
    expect(resolverRuta('docs/wiki', './02-arquitectura.md')).toBe('docs/wiki/02-arquitectura.md')
  })

  it('no deja salir de la raíz del repo', () => {
    expect(resolverRuta('docs/wiki', '../../../etc/passwd')).toBeNull()
  })
})

describe('reescribirHref', () => {
  it('lleva las páginas hermanas al panel, con su ancla', () => {
    expect(reescribirHref('08-seguridad-micro-siem.md#4-rate-limiting')).toBe(
      '/admin/wiki/08-seguridad-micro-siem#4-rate-limiting'
    )
    expect(reescribirHref('README.md')).toBe('/admin/wiki')
  })

  it('manda el resto del repo a GitHub', () => {
    expect(reescribirHref('../../src/middleware.ts')).toBe(`${REPO_URL}/blob/main/src/middleware.ts`)
    expect(reescribirHref('../wiki/')).toBe(`${REPO_URL}/tree/main/docs/wiki`)
    expect(reescribirHref('../../')).toBe(`${REPO_URL}/tree/main/`)
  })

  it('no toca enlaces absolutos, anclas ni correo', () => {
    for (const href of ['https://codebymike.net', '/status', '#indice', 'mailto:a@b.co']) {
      expect(reescribirHref(href)).toBe(href)
    }
  })

  it('deja igual un relativo que se sale del repo', () => {
    expect(reescribirHref('../../../x.md')).toBe('../../../x.md')
  })
})

describe('reescribirEnlaces', () => {
  it('reescribe los href y abre GitHub en otra pestaña', () => {
    const html = '<p><a href="02-arquitectura.md">a</a> <a href="../../package.json">b</a></p>'
    const out = reescribirEnlaces(html)
    expect(out).toContain('<a href="/admin/wiki/02-arquitectura">')
    expect(out).toContain(`<a href="${REPO_URL}/blob/main/package.json" target="_blank" rel="noopener noreferrer">`)
  })
})

describe('separarTitulo', () => {
  it('saca el primer h1 para que el layout no pinte dos', () => {
    const { titulo, cuerpo } = separarTitulo('<h1 id="x">07 · <code>Accesos</code></h1>\n<p>hola</p>')
    expect(titulo).toBe('07 · Accesos')
    expect(cuerpo).toBe('\n<p>hola</p>')
  })

  it('sin h1 devuelve el cuerpo intacto', () => {
    expect(separarTitulo('<p>x</p>')).toEqual({ titulo: null, cuerpo: '<p>x</p>' })
  })
})

describe('índice', () => {
  it('pone la portada primero y ordena por número', () => {
    expect(ordenarIds(['10-dinero', '02-arquitectura', 'readme', '01-vision'])).toEqual([
      'readme',
      '01-vision',
      '02-arquitectura',
      '10-dinero',
    ])
  })

  it('toma el título del primer encabezado', () => {
    expect(tituloDesdeMarkdown('# 13 · Base de `datos`\n\ntexto', 'x')).toBe('13 · Base de datos')
    expect(tituloDesdeMarkdown(undefined, '13-base')).toBe('13-base')
  })
})

// Contra los archivos reales: un enlace a una página que no existe se vería
// bien en el editor y daría 404 en el panel.
describe('enlaces de docs/wiki', () => {
  const dir = join(process.cwd(), 'docs/wiki')
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.md'))
  const ids = new Set(archivos.map((f) => f.replace(/\.md$/, '').toLowerCase()))

  it('cada enlace entre páginas apunta a una página que existe', () => {
    const rotos: string[] = []
    for (const f of archivos) {
      const md = readFileSync(join(dir, f), 'utf8')
      for (const [, href] of md.matchAll(/\]\(([^)\s]+)\)/g)) {
        const nuevo = reescribirHref(href)
        if (!nuevo.startsWith('/admin/wiki')) continue
        const id = nuevo.replace(/^\/admin\/wiki\/?/, '').replace(/#.*/, '') || 'readme'
        if (!ids.has(id)) rotos.push(`${f}: ${href}`)
      }
    }
    expect(rotos).toEqual([])
  })
})
