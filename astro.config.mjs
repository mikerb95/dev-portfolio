// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import auth from 'auth-astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://codebymike.tech',
  output: 'server',
  adapter: vercel({ imageService: true }),
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    // 'manual': el middleware propio (clasificador de amenazas, rate limit,
    // gates de auth) debe correr ANTES que cualquier ruteo de idioma. Con el
    // modo automático de Astro, su middleware de i18n se inyecta por delante
    // del nuestro. Ver docs/plan-i18n-en.md §2.2.
    routing: 'manual',
  },
  // Historia de la sección de presentaciones: /admin/slides → /admin/presentations
  // → /admin/presentaciones. Las dos primeras etapas siguen vivas en marcadores
  // y en pestañas abiertas, así que se redirigen en vez de romperse. Las rutas
  // por id de aquellos sistemas ya no tienen equivalente (el modelo cambió de
  // "imágenes de un proyecto" a "deck HTML + sesión efímera"), así que caen en
  // la biblioteca, que es de donde se sale a presentar.
  redirects: {
    '/admin/slides': '/admin/presentaciones',
    '/admin/slides/[id]/control': '/admin/presentaciones',
    '/admin/slides/[id]/present': '/admin/presentaciones',
    '/admin/presentations': '/admin/presentaciones',
    '/admin/presentations/[id]/control': '/admin/presentaciones',
    '/admin/presentations/[id]/present': '/admin/presentaciones',
  },
  image: {
    // Autoriza optimizar imágenes remotas alojadas en Vercel Blob
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },
  integrations: [auth()],
  vite: {
    plugins: [tailwindcss()]
  },
});