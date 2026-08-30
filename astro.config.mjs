// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const excludedSocialPaths = new Set([
  '/tirage-au-sort-instagram',
  '/tirage-au-sort-facebook',
  '/tirage-au-sort-x',
  '/tirage-au-sort-tiktok',
]);

// https://astro.build/config
export default defineConfig({
  site: 'https://tiragesimple.fr',
  output: 'static',
  integrations: [sitemap({
    filter: (page) => !excludedSocialPaths.has(new URL(page).pathname.replace(/\/$/u, '')),
  })],
  build: {
    inlineStylesheets: 'auto',
  },
});
