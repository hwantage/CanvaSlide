import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const cli = require.resolve('@playwright/test/cli')
const playwrightTest = fileURLToPath(import.meta.resolve('@playwright/test'))
const configs = ['tests/playwright.config.ts', 'website/playwright.config.ts']

// Runs `body` as the only spec under `config`, keeping every option but where tests live and the
// server they need, so the guards are checked as CI would load them without starting the app.
function runSpec(config, body, env) {
  const dir = mkdtempSync(join(tmpdir(), 'playwright-guards-'))
  try {
    // Why: the configs use `import.meta`, which Playwright only keeps when it loads them as ESM.
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n')
    writeFileSync(
      join(dir, 'guard.spec.ts'),
      `import { test } from ${JSON.stringify(playwrightTest)}\n${body}\n`
    )
    writeFileSync(
      join(dir, 'playwright.config.ts'),
      `import base from ${JSON.stringify(join(repoRoot, config))}
export default {
  ...base,
  testDir: ${JSON.stringify(dir)},
  outputDir: ${JSON.stringify(join(dir, 'results'))},
  globalSetup: undefined,
  webServer: undefined,
  reporter: [['list']]
}
`
    )
    const result = spawnSync(
      process.execPath,
      [cli, 'test', '--config', join(dir, 'playwright.config.ts')],
      { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, CI: '', ...env }, timeout: 60_000 }
    )
    assert.equal(result.signal, null, 'Playwright did not finish')
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const focused = `test.only('focused', () => {})\ntest('other', () => {})`

for (const config of configs) {
  test(`${config} fails CI when a test.only is committed`, () => {
    const ci = runSpec(config, focused, { CI: 'true' })
    assert.notEqual(ci.status, 0, ci.output)
    assert.match(ci.output, /item focused with '\.only' is not allowed/)
    // Why: focusing a test while working on it locally stays allowed.
    const local = runSpec(config, focused)
    assert.equal(local.status, 0, local.output)
    assert.match(local.output, /1 passed/)
  })

  test(`${config} stops CI after 10 failures instead of running every test`, () => {
    const failing = `for (let i = 0; i < 15; i++) test(\`fails \${i}\`, () => { throw new Error('broken') })`
    const ci = runSpec(config, failing, { CI: 'true' })
    assert.notEqual(ci.status, 0, ci.output)
    assert.match(ci.output, /\b10 failed\b/)
    assert.match(ci.output, /\b5 did not run\b/)
  })
}
