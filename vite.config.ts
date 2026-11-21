import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Build do jednego pliku: skrypt, style i czcionki trafiają do dist/index.html.
 * Taki plik działa po dwukliku (file://), gdzie przeglądarka blokuje skrypty modułowe
 * ładowane z osobnych plików, oraz na dowolnym serwerze statycznym (np. GitHub Pages).
 */
function singleFile(): Plugin {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    name: 'tasa-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const htmlFile = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!htmlFile || htmlFile.type !== 'asset') return;
      let html = String(htmlFile.source);
      for (const [key, f] of Object.entries(bundle)) {
        if (f.type === 'chunk') {
          const re = new RegExp(`<script[^>]*src="[^"]*${esc(f.fileName)}"[^>]*></script>`);
          if (!re.test(html)) continue;
          const code = f.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(re, () => `<script type="module">${code}</script>`);
          delete bundle[key];
        } else if (f.type === 'asset' && f.fileName.endsWith('.css')) {
          const re = new RegExp(`<link[^>]*href="[^"]*${esc(f.fileName)}"[^>]*>`);
          if (!re.test(html)) continue;
          html = html.replace(re, () => `<style>${String(f.source)}</style>`);
          delete bundle[key];
        }
      }
      htmlFile.source = html;
    },
  };
}

// base './' pozwala serwować stronę z dowolnego katalogu (GitHub Pages, serwer lokalny, file://).
export default defineConfig({
  base: './',
  plugins: [react(), singleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000, // czcionki i obrazy jako data URI w jednym pliku
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
