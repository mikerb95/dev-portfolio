import { readFile, writeFile } from 'node:fs/promises'

// La MISMA lista que consulta el middleware, no una copia.
import { HOSTS_A_REDIRIGIR, HOST_CANONICO, EXENTOS } from '../src/lib/canonical-host.ts'

// Redirect del dominio viejo al canónico, en el BORDE.
//
// Por qué existe además del middleware: una página prerenderizada (`/docs`,
// `/notes`, `/pay`, `/log`... 47 en total) es un archivo que sirve el CDN y
// nunca invoca la función, así que nunca pasa por src/middleware.ts. Sin esto,
// el dominio viejo redirigía sus páginas SSR y seguía publicando una copia
// entera de la parte estática del sitio, indexable y en silencio. Es el mismo
// agujero que resuelve integrations/static-headers.mjs para las cabeceras de
// seguridad, y por la misma razón no se puede arreglar desde vercel.json: con
// el Build Output API la autoridad de routing es .vercel/output/config.json y
// el adaptador no propaga hacia allí la sección `redirects`.
//
// El middleware se queda igualmente: cubre `astro dev`, los previews y
// cualquier ruta SSR si esta inyección fallara. Dos capas, una sola lista.
//
// `EXENTOS` se respeta aquí tal cual: un 308 sobre /api rompe los webhooks
// firmados de Wompi (POST) y los crons con Authorization (la cabecera se cae al
// cambiar de host). Ver src/lib/canonical-host.ts.

const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Inserta los redirects en `config.routes`, ANTES de `handle: filesystem` (que
 * es donde el borde decide servir el archivo estático). Puro y exportado para
 * poder probar la forma de las rutas sin escribir en disco.
 *
 * Lanza si no encuentra el marcador: es preferible romper el build a desplegar
 * un dominio viejo que sigue sirviendo una copia entera del sitio.
 */
export function inyectaRedirects(config) {
  const i = config.routes?.findIndex((r) => r.handle === 'filesystem')
  if (i === undefined || i < 0) {
    throw new Error(
      'canonical-redirect: no se encontró `handle: filesystem` en .vercel/output/config.json. ' +
        'El adaptador de Vercel cambió el formato: revisar antes de desplegar, o el dominio ' +
        'viejo volvería a servir una copia completa del sitio estático.'
    )
  }

  // El grupo captura la ruta entera para pegarla al destino. La query la
  // conserva Vercel sola, igual que en un redirect de vercel.json.
  const exentos = EXENTOS.map(escapa).join('|')
  for (const host of HOSTS_A_REDIRIGIR) {
    config.routes.splice(i, 0, {
      src: `^(?!${exentos})(/.*)$`,
      has: [{ type: 'host', value: escapa(host) }],
      headers: { Location: `https://${HOST_CANONICO}$1` },
      status: 308,
    })
  }
  return HOSTS_A_REDIRIGIR.size
}

export default function canonicalRedirect() {
  return {
    name: 'canonical-redirect',
    hooks: {
      'astro:build:done': async ({ logger }) => {
        const configPath = new URL('../.vercel/output/config.json', import.meta.url)
        const config = JSON.parse(await readFile(configPath, 'utf-8'))

        const rutas = inyectaRedirects(config)

        await writeFile(configPath, JSON.stringify(config, null, 2))
        logger.info(`redirect 308 hacia ${HOST_CANONICO} inyectado para ${rutas} hosts heredados`)
      },
    },
  }
}
