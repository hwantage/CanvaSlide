import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('the only tauri build script skips signing, so it runs without the updater key', () => {
  const scripts = Object.entries(JSON.parse(read('package.json')).scripts)
  assert.deepEqual(
    scripts.filter(([, command]) => /\btauri build\b/.test(command)),
    [['bundle:local', 'tauri build --no-sign']]
  )
})

test('CI bundle jobs build unsigned and never receive the updater signing key', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.doesNotMatch(ci, /TAURI_SIGNING/)
  const tauriSteps = ci.split(/\n\s*- /).filter((step) => step.includes('tauri-apps/tauri-action'))
  assert.ok(tauriSteps.length > 0)
  for (const step of tauriSteps) {
    assert.match(step, /\n\s*args: [^#\n]*--no-sign\b/)
  }
})
