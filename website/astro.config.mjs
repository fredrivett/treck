import { resolve } from 'node:path';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  adapter: vercel({
    includeFiles: [
      './public/showcases/tldraw.json',
      './public/showcases/treck.json',
      './public/showcases/cal-com.json',
      '../dist/index.mjs',
    ],
  }),
  site: 'https://treck.dev',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@viewer': resolve(import.meta.dirname, '../src/server/viewer'),
        '@treck/graph': resolve(import.meta.dirname, '../src/graph'),
        // The viewer's own @ alias (used by UI components like sheet.tsx, drawer.tsx)
        '@/lib/utils': resolve(import.meta.dirname, '../src/server/viewer/lib/utils'),
      },
    },
  },
});
