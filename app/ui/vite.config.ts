import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Offline app: every asset is bundled; no CDN or remote URL is allowed (INV-01, INV-10).
export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  // the design documents include the project's DFMEA and reliability texts from ../../docs
  server: { port: 1420, strictPort: true, fs: { allow: ['.', '../../docs'] } },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
