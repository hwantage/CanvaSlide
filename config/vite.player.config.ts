import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { assertPlayerModules } from './scripts/player-module-boundary.mjs'

// Why: the standalone player is inlined into exported HTML, so it must be one self-contained IIFE.
export default defineConfig({
  plugins: [
    {
      name: 'player-runtime-boundary',
      generateBundle(_options, bundle) {
        const modules = Object.values(bundle).flatMap((entry) =>
          entry.type === 'chunk'
            ? Object.entries(entry.modules).map(([id, module]) => ({
                id,
                renderedLength: module.renderedLength
              }))
            : []
        )
        assertPlayerModules(modules.map(({ id }) => id))
        this.emitFile({
          type: 'asset',
          fileName: 'player.modules.json',
          source: JSON.stringify(modules, null, 2)
        })
      }
    }
  ],
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
