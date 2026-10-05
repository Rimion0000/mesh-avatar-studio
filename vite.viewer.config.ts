import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Only viewer code is published. Never copy samples/ or projects/ into this build.
export default defineConfig({
  root: fileURLToPath(new URL('./src/viewer/', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [{
    name: 'viewer-development-csp',
    apply: 'serve',
    // Vite injects development styles and HMR. The static build keeps its CSP.
    transformIndexHtml(html) { return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, ''); },
  }],
  build: { outDir: '../../dist/viewer', emptyOutDir: true },
});
