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
  // /admin/slides pasó a ser /admin/presentations (hub de presentaciones). Los
  // enlaces viejos siguen vivos en marcadores y en pestañas de proyección
  // abiertas, así que se redirigen en vez de romperse.
  redirects: {
    '/admin/slides': '/admin/presentations',
    '/admin/slides/[id]/control': '/admin/presentations/[id]/control',
    '/admin/slides/[id]/present': '/admin/presentations/[id]/present',
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