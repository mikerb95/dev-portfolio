import { readFile, writeFile } from 'node:fs/promises'

// Cabeceras de seguridad para las páginas PRERENDERIZADAS (/docs/*).
//
// Por qué existe este archivo: src/middleware.ts pone HSTS, CSP y compañía en
// cada respuesta, pero una página prerenderizada es un archivo que sirve el CDN
// y nunca invoca la función, así que nunca pasa por el middleware. Sin esto,
// /docs quedaría publicado sin ninguna cabecera de seguridad.
//
// Y por qué no en vercel.json: con el Build Output API (que es lo que genera
// @astrojs/vercel) la autoridad de routing es .vercel/output/config.json, y el
// adaptador no propaga la sección `headers` de vercel.json hacia allí. Se
// comprobó en el build: las cabeceras declaradas en vercel.json no aparecían en
// config.json. Los `crons` de vercel.json sí siguen funcionando porque no son
// configuración de routing.
//
// Las rutas van con `continue: true` y ANTES de `handle: filesystem`, que es
// donde Vercel compila las cabeceras de vercel.json en un build normal: marcan
// la respuesta y dejan que el archivo se sirva igual.

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

// /docs/presentacion (deck privado) y /docs/testing (lee la base) siguen siendo
// SSR: el middleware ya los cubre, y el deck necesita las cabeceras de ruta
// privada, no estas. Excluirlos aquí evita pisarle la CSP restrictiva.
const RUTAS_SSR = ['presentacion', 'testing']
const SRC_DOCS = `^/docs(?:/(?!(?:${RUTAS_SSR.join('|')})(?:/)?$).*)?$`

export default function staticHeaders() {
  return {
    name: 'static-headers',
    hooks: {
      'astro:build:done': async () => {
        const ruta = new URL('../.vercel/output/config.json', import.meta.url)
        const config = JSON.parse(await readFile(ruta, 'utf-8'))

        // Si el adaptador cambia el formato, es preferible romper el build a
        // desplegar /docs sin cabeceras de seguridad y no enterarse.
        const i = config.routes?.findIndex((r) => r.handle === 'filesystem')
        if (i === undefined || i < 0) {
          throw new Error(
            'static-headers: no se encontró `handle: filesystem` en .vercel/output/config.json. ' +
              'El adaptador de Vercel cambió el formato: revisar antes de desplegar, o /docs saldría sin CSP ni HSTS.'
          )
        }

        config.routes.splice(i, 0, { src: SRC_DOCS, headers: CABECERAS, continue: true })
        await writeFile(ruta, JSON.stringify(config, null, 2))
      },
    },
  }
}
