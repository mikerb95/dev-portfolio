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
  image: {
    // Autoriza optimizar imágenes remotas alojadas en Vercel Blob
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },
  integrations: [auth()],
  vite: {
    plugins: [tailwindcss()]
  },
});