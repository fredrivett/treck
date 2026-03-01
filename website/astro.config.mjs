import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://treck.dev',
  vite: {
    plugins: [tailwindcss()],
  },
});
