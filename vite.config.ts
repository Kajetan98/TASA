import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' pozwala serwować zbudowaną stronę z dowolnego katalogu (np. GitHub Pages, serwer lokalny).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
