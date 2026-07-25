import { describe, expect, it } from 'vitest'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// Paridad de diccionarios. `en.ts` ya se declara `satisfies typeof es`
// (TypeScript rompe en build si falta una clave), pero eso no detecta claves
// SOBRANTES en inglés ni traducciones olvidadas (valor idéntico al español).
// Este test cubre justo esos dos huecos.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

function collectPaths(obj: Json, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  if (Array.isArray(obj)) {
    return obj.flatMap((item, i) => collectPaths(item as Json, `${prefix}[${i}]`))
  }
  return Object.entries(obj).flatMap(([k, v]) => collectPaths(v, prefix ? `${prefix}.${k}` : k))
}

function getPath(obj: Json, path: string): Json {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  return parts.reduce((acc: any, key) => acc?.[key], obj)
}

describe('paridad del diccionario es/en', () => {
  const esPaths = collectPaths(es as unknown as Json).sort()
  const enPaths = collectPaths(en as unknown as Json).sort()

  it('no hay claves en español sin su par en inglés', () => {
    const missing = esPaths.filter((p) => !enPaths.includes(p))
    expect(missing).toEqual([])
  })

  it('no hay claves en inglés que sobren (sin su par en español)', () => {
    const extra = enPaths.filter((p) => !esPaths.includes(p))
    expect(extra).toEqual([])
  })

  it('ningún valor string en inglés es idéntico al español (traducción olvidada)', () => {
    const identical = esPaths.filter((p) => {
      const esVal = getPath(es as unknown as Json, p)
      const enVal = getPath(en as unknown as Json, p)
      if (typeof esVal !== 'string' || esVal.length < 4) return false
      // Nombres propios / marca que sí deben ser idénticos a propósito.
      // Jerga técnica, marcas y nombres propios que son legítimamente iguales
      // en los dos idiomas — no son traducciones olvidadas.
      const ALLOWED_IDENTICAL = new Set([
        'meta.siteName',
        'home.title',
        'home.hero.stackLine1',
        'home.hero.stackLine2',
        'home.bento.github.user',
        'home.hud.title',
        'home.hud.boot',
        'home.hud.build',
        'home.hud.pipeline',
        'home.hud.stack',
        'home.bento.capabilities.items[2]',
        'home.bento.capabilities.items[3]',
        'home.bento.contactMicro.badge',
        'home.bento.contactMicro.cta',
        'home.bento.location.country',
        'home.expertise.items[1].title',
        'home.githubDevProgramValue',
        'home.githubTop3Label',
        'home.githubTop3Value',
        'home.lab.p1strong',
        'home.proceso.steps[3].t',
        'nav.loginAria',
        'notFound.eyebrow',
        'notFound.title',
        'footer.groups.operacion.status',
      ])
      if (ALLOWED_IDENTICAL.has(p)) return false
      return esVal === enVal
    })
    expect(identical).toEqual([])
  })

  it('las interpolaciones/placeholders coinciden entre idiomas (si hubiera)', () => {
    const placeholderRe = /\{[a-zA-Z0-9_]+\}/g
    const mismatched = esPaths.filter((p) => {
      const esVal = getPath(es as unknown as Json, p)
      const enVal = getPath(en as unknown as Json, p)
      if (typeof esVal !== 'string' || typeof enVal !== 'string') return false
      const esPh = [...esVal.matchAll(placeholderRe)].map((m) => m[0]).sort()
      const enPh = [...enVal.matchAll(placeholderRe)].map((m) => m[0]).sort()
      return JSON.stringify(esPh) !== JSON.stringify(enPh)
    })
    expect(mismatched).toEqual([])
  })
})
