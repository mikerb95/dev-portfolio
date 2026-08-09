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
      // en los dos idiomas - no son traducciones olvidadas.
      const ALLOWED_IDENTICAL = new Set([
        'meta.siteName',
        // Jerga y marcas de las maquetas de /tools que son iguales en los dos
        // idiomas: 'Open source', 'rollback', 'deploy → health check', rutas
        // ficticias y el nombre de una métrica.
        'githubProjects.eyebrow',
        'toolMock.chaos.flags[0].route',
        'toolMock.chaos.flags[1].k',
        'toolMock.pipeline.rollback',
        'toolMock.pipeline.step',
        'toolMock.security.overhead',
        // '/architecture' es una ruta, no prosa. 'commit' es préstamo técnico
        // igual en los dos idiomas. 'Engineering Log' es el nombre de la página.
        'demo.footnoteLinkLabel',
        'log.title',
        'log.h1',
        'log.oneCommit',
        'log.nCommits',
        // 'Status' y 'Security Operations' son nombres de página/sección ya en
        // inglés en el original español (jerga SRE de uso corriente); 'Error
        // budget' idem; 'uptimeShort' es solo un placeholder de número.
        'status.title',
        'status.securityCard.title',
        'status.errorBudget',
        'status.uptimeShort',
        'project.linksHeading',
        // Jerga técnica del LAB idéntica en los dos idiomas: nombres de
        // herramientas ('Load testing (k6)', 'Mutation testing'), términos
        // adoptados ('rollback', 'fail-open', 'tests') y el nombre propio de
        // la sección 'Security Operations'.
        'lab.cards.securityTitle',
        'lab.kpi.mutationScore',
        'lab.methodology.failOpenWord',
        'lab.pipeline.badgeRollback',
        'lab.pipeline.testsLabel',
        'lab.upcoming.k6Title',
        'lab.upcoming.mutationTitle',
        // 'device fingerprinting' es el término técnico, igual en ambos idiomas.
        'fingerprint.introStrong',
        'siteCheck.errorPrefix',
        // 'bits' es la unidad, igual en los dos idiomas.
        'fpRoom.bits',
        // 'Stack' y el título de la landing del evento son iguales en ambos
        // idiomas ('Platzi Conf' es nombre propio).
        'platziconf.stackHeading',
        'platziconf.title',
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
        // Solo placeholders y separadores: "{branch}@{sha} · {conclusion}".
        'home.bento.now.meta.deploy',
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
        'engineering.pipeline.commitLabel',
        'engineering.pipeline.testsLabel',
        'engineering.uptime.mttr',
        'security.commitPrefix',
        'security.secops.categoryLabels.path_traversal',
        'contact.eyebrow',
        'contact.form.emailLabel',
        'contact.form.messageCharCount',
        'contact.form.okShort',
        'contact.linkedinLabel',
        'contact.whatsappLabel',
        'certifications.fullProfile.linkedinLabel',
        'certifications.fullProfile.platziLabel',
        'architecture.footnoteLinkLabel',
        'architecture.layers[1].title',
        'architecture.layers[2].title',
        'architecture.layers[3].title',
        'architecture.layers[0].nodes[1].name',
        'architecture.layers[1].nodes[1].name',
        'architecture.layers[1].nodes[2].name',
        'architecture.layers[2].nodes[1].name',
        'architecture.externals[1].name',
        'architecture.externals[2].name',
        'architecture.externals[3].name',
        'architecture.externals[4].name',
        'architecture.externals[0].name',
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
