// Android build (Capacitor): the same UI plus the backend in the page (src/android/bridge.js).
// The desktop backend modules are reused; their Node-only imports are pointed at Android versions.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname);
const A = (f) => path.join(here, 'src/android', f);
const REDIRECT = { './db.js': A('db.js'), './state.js': A('state.js'), 'node:fs': A('shims/fs.js'), 'node:module': A('shims/module.js') };

const androidBackend = {
  name: 'dsa-android-backend',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !importer.includes(path.sep + 'electron' + path.sep)) return null;
    return REDIRECT[source] || null;
  }
};

// CSP for the Android page: WebAssembly (sql.js), blob: images, plain-HTTP sync to the laptop on the
// local network, and 'unsafe-inline' scripts because Capacitor may inject its bridge as an inline script.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' http: https:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
const androidCsp = { name: 'dsa-android-csp', transformIndexHtml: (html) => html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*"/, `$1${CSP}"`) };

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [androidBackend, androidCsp, react()],
  define: { __ANDROID__: 'true', __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version) },
  build: { outDir: '../dist-android', emptyOutDir: true, target: 'chrome110', chunkSizeWarningLimit: 4000 },
  server: { port: 5198, strictPort: true, fs: { allow: ['..'] } }
});
