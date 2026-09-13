import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, isPreview }) => ({
  root: import.meta.dirname,
  base: process.env.WEBSITE_BASE_PATH ?? (command === 'serve' && !isPreview ? '/' : '/CanvaSlide/'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': resolve(import.meta.dirname, '../src/renderer/src'),
      '@shared': resolve(import.meta.dirname, '../src/shared')
    }
  },
  server: { host: '127.0.0.1', port: 1421, strictPort: true },
  preview: { host: '127.0.0.1', port: 1422, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        docs: resolve(import.meta.dirname, 'docs/index.html')
      }
    }
  }
}))
