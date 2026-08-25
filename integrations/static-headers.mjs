import { readFile, writeFile } from 'node:fs/promises'

// Cabeceras de seguridad para las páginas PRERENDERIZADAS.
//
// Por qué existe este archivo: src/middleware.ts pone HSTS, CSP y compañía en
// cada respuesta, pero una página prerenderizada es un archivo que sirve el CDN
// y nunca invoca la función, así que nunca pasa por el middleware. Sin esto,
// toda la parte estática del sitio quedaría publicada sin una sola cabecera de
// seguridad, y en silencio.
//
// Y por qué no en vercel.json: con el Build Output API (que es lo que genera
// @astrojs/vercel) la autoridad de routing es .vercel/output/config.json, y el
// adaptador no propaga la sección `headers` de vercel.json hacia allí. Se
// comprobó en el build: las cabeceras declaradas en vercel.json no aparecían en
// config.json. Los `crons` de vercel.json sí siguen funcionando porque no son
// configuración de routing.
//
// Las rutas se derivan de la lista de páginas prerenderizadas que Astro entrega
// en el hook, no de una lista escrita a mano. Así marcar una página nueva con
// `prerender` la cubre sola, y una que vuelve a SSR deja de aparecer sin que
// nadie se acuerde de tocar este archivo. (No se leen de
// .vercel/output/static: esta integración corre antes de que el adaptador
// copie los archivos allí, y el directorio todavía está vacío.) Van con
// `continue: true` y ANTES de `handle: filesystem`, que es donde Vercel compila
// las cabeceras de vercel.json en un build normal: marcan la respuesta y dejan
// que el archivo se sirva igual.

/** CSP de páginas públicas. Copia literal de la que pone el middleware. */
const CSP_PUBLICA =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; " +
  'report-to csp-endpoint; report-uri /api/security/csp-report;'

const CABECERAS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
  'Reporting-Endpoints': 'csp-endpoint="/api/security/csp-report"',
  'Content-Security-Policy': CSP_PUBLICA,
}

async function htmlsDe(dir) {
  const salida = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) salida.push(...(await htmlsDe(p)))
    else if (entry.name.endsWith('.html')) salida.push(p)
  }
  return salida
}

/** `static/docs/kanban/index.html` → `/docs/kanban`; `static/index.html` → `/` */
function rutaDe(base, archivo) {
  const rel = relative(base, archivo).replaceAll('\\', '/')
  const sinExt = rel.endsWith('/index.html')
    ? rel.slice(0, -'/index.html'.length)
    : rel === 'index.html'
      ? ''
      : rel.slice(0, -'.html'.length)
  return `/${sinExt}`
}

const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default function staticHeaders() {
  return {
    name: 'static-headers',
    hooks: {
      'astro:build:done': async ({ logger }) => {
        const salida = new URL('../.vercel/output/', import.meta.url)
        const estaticos = fileURLToPath(new URL('static/', salida))
        const configPath = new URL('config.json', salida)

        const rutas = (await htmlsDe(estaticos))
          .map((f) => rutaDe(estaticos, f))
          .sort()

        if (rutas.length === 0) {
          logger.warn('static-headers: no hay páginas prerenderizadas, no se inyecta nada.')
          return
        }

        const config = JSON.parse(await readFile(configPath, 'utf-8'))

        // Si el adaptador cambia el formato, es preferible romper el build a
        // desplegar páginas sin cabeceras de seguridad y no enterarse.
        const i = config.routes?.findIndex((r) => r.handle === 'filesystem')
        if (i === undefined || i < 0) {
          throw new Error(
            'static-headers: no se encontró `handle: filesystem` en .vercel/output/config.json. ' +
              'El adaptador de Vercel cambió el formato: revisar antes de desplegar, o las páginas ' +
              'estáticas saldrían sin CSP ni HSTS.'
          )
        }

        // `/` sale como cadena vacía en la alternancia; el `/?` final la cubre.
        const alternancia = rutas.map((r) => escapa(r.slice(1))).join('|')
        config.routes.splice(i, 0, {
          src: `^/(?:${alternancia})/?$`,
          headers: CABECERAS,
          continue: true,
        })

        await writeFile(configPath, JSON.stringify(config, null, 2))
        logger.info(`cabeceras de seguridad inyectadas en ${rutas.length} páginas estáticas`)
      },
    },
  }
}
