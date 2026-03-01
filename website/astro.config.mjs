import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { resolve } from 'node:path';

export default defineConfig({
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
