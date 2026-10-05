import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Offline app: every asset is bundled; no CDN or remote URL is allowed (INV-01, INV-10).
export default defineConfig({
  plugins: [preact()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
