import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'chrome130', chunkSizeWarningLimit: 2500 },
  server: { port: 5199, strictPort: true, fs: { allow: ['..'] } }
});
