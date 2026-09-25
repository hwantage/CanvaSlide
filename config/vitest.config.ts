import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, '../src/renderer/src'),
      '@app': resolve(import.meta.dirname, '../src/renderer/src'),
      '@shared': resolve(import.meta.dirname, '../src/shared')
    }
  },
  test: {
    root: resolve(import.meta.dirname, '..'),
    globals: true,
    environment: 'happy-dom',
    setupFiles: [resolve(import.meta.dirname, 'vitest.setup.ts')],
    include: [
      'config/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'examples/**/*.test.ts',
      'website/src/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**', 'src/renderer/src/store/**'],
      reporter: ['text', 'html']
    }
  }
})
