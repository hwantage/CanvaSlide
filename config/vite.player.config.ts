import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Why: the standalone player is inlined into exported HTML, so it must be one self-contained IIFE.
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../src/shared') }
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, '../src/player/player-main.ts'),
      name: 'CanvaSlidePlayer',
      formats: ['iife'],
      fileName: () => 'player.iife.js'
    },
    outDir: resolve(import.meta.dirname, '../src/renderer/src/generated'),
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    target: 'safari15'
  },
  logLevel: 'warn'
})
