import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const rendererRoot = resolve(import.meta.dirname, '../src/renderer')
const host = process.env.TAURI_DEV_HOST

// Why: Tauri watches src-tauri itself; Vite must not restart on Rust changes.
export default defineConfig({
  root: rendererRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(rendererRoot, 'src'),
      '@shared': resolve(import.meta.dirname, '../src/shared')
    }
  },
  clearScreen: false,
  // Why: discovering pdfjs-dist on first use makes the dev server re-bundle and reload the page
  // mid-import; pre-bundling it keeps a PDF drop (and the E2E for it) uninterrupted.
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    outDir: resolve(import.meta.dirname, '../dist'),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG)
  }
})
