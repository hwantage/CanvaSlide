import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertPlayerModules } from './player-module-boundary.mjs'

test('keeps packages, schema validation and renderer code out of the built playback graph', () => {
  assert.doesNotThrow(() =>
    assertPlayerModules([
      '/repo/src/player/player-main.ts',
      '/repo/src/shared/canvas/element-runtime.ts',
      '/repo/src/shared/presentation/presentation.css?inline'
    ])
  )
  for (const id of [
    '/repo/node_modules/zod/index.js',
    '/repo/node_modules/react/index.js',
    'C:\\repo\\node_modules\\zustand\\index.js',
    '/repo/src/renderer/src/i18n/ui-strings.ts',
    '/repo/src/shared/canvas/element-types.ts'
  ]) {
    assert.throws(() => assertPlayerModules([id]), /player runtime boundary/)
  }
})
