import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkedStep, jobsOf } from './workflow-structure.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const cli = require.resolve('@playwright/test/cli')
const playwrightTest = fileURLToPath(import.meta.resolve('@playwright/test'))
const configs = ['tests/playwright.config.ts', 'website/playwright.config.ts']

// Runs `body` as the fixture specs under `config`, keeping every option but where tests live and the
// server they need, so the guards are checked as CI would load them without starting the app.
function runSpec(config, body, env, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'playwright-guards-'))
  try {
    // Why: the configs use `import.meta`, which Playwright only keeps when it loads them as ESM.
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n')
    for (const [index, source] of [body].flat().entries()) {
      writeFileSync(
        join(dir, `guard-${index}.spec.ts`),
        `import { test, expect } from ${JSON.stringify(playwrightTest)}\n${source}\n`
      )
    }
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
      [cli, 'test', '--config', join(dir, 'playwright.config.ts'), ...args],
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

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const playwrightConfig = readFileSync(
  new URL('../../tests/playwright.config.ts', import.meta.url),
  'utf8'
)

test('E2E selects each Playwright project once across the Linux and macOS jobs', () => {
  const { e2e } = jobsOf(ci)
  const projectsOf = (args) => [...args.matchAll(/--project=(\S+)/g)].map(([, name]) => name)
  const runs = [...ci.matchAll(/\n {6}- run: pnpm test:e2e (.+)\n/g)].map(([, args]) => args)
  assert.equal(runs.length, ci.match(/test:e2e/g).length)
  const projects = playwrightConfig.slice(playwrightConfig.indexOf('\n  projects: ['))
  const configured = [...projects.matchAll(/\bname: '([^']+)'/g)].map(([, name]) => name)
  assert.ok(configured.length > 1)
  const byName = (a, b) => a.localeCompare(b)
  assert.deepEqual(runs.flatMap(projectsOf).toSorted(byName), configured.toSorted(byName))
  const [shardRun] = runs.filter((args) => args.includes('--project=chromium'))
  checkedStep(e2e, `pnpm test:e2e ${shardRun}`)
  assert.match(
    shardRun,
    /^(--project=\S+ )+--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/
  )
  // Why: `job-total` is the shard count only while the matrix has no other dimension.
  const matrix = /\n {6}matrix:\n((?: {8}.*\n)+)/.exec(`${e2e}\n`)[1]
  const keys = matrix.split('\n').filter((line) => /^ {8}[\w-]+:/.test(line))
  assert.equal(keys.length, 1, matrix)
  const shards = /^ {8}shard: \[([^\]]*)\]$/.exec(keys[0])[1].split(/,\s*/).map(Number)
  assert.ok(shards.length > 1)
  assert.deepEqual(
    shards,
    shards.map((_, i) => i + 1)
  )
  // Why: a failing shard must not cancel the others, or their failures go unreported.
  assert.match(e2e, /\n {6}fail-fast: false\n/)
  assert.match(e2e, /\n\s+name: playwright-traces-\$\{\{ matrix\.shard \}\}\n/)
})

test('WebKit runs in two required macOS shards with the @webkit scenarios', () => {
  const [job, ...others] = Object.values(jobsOf(ci)).filter((job) =>
    /\n {6}- run: pnpm test:e2e [^\n]*--project=webkit\b/.test(job)
  )
  assert.ok(job && others.length === 0)
  assert.match(job, /\n {4}runs-on: macos-latest\n/)
  const step = checkedStep(
    job,
    'pnpm test:e2e --project=webkit --shard=${{ matrix.shard }}/${{ strategy.job-total }}'
  )
  const matrix = /\n {6}matrix:\n((?: {8}.*\n)+)/.exec(`${job}\n`)[1]
  assert.deepEqual(
    matrix.split('\n').filter((line) => /^ {8}[\w-]+:/.test(line)),
    ['        shard: [1, 2]']
  )
  assert.match(job, /\n {6}fail-fast: false\n/)
  assert.doesNotMatch(job, /max-parallel:/)
  assert.match(
    job,
    /name: e2e \(webkit, macOS, \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}\)/
  )
  assert.match(jobsOf(ci).passed, /needs: \[[^\]\n]*\be2e-webkit\b/)

  // Why: the flag CI sets must be the one the config reads to add the `@webkit` scenarios.
  const flag = /process\.env\.(\w+) \? \/[^/\n]*@webkit/.exec(playwrightConfig)[1]
  assert.match(`${step}\n`, new RegExp(`\\n {10}${flag}: '1'\\n`))
  assert.match(job, /\n\s+name: playwright-traces-webkit-\$\{\{ matrix\.shard \}\}\n/)
})

test('WebKit shards keep all selected scenarios exactly once with one CI worker', () => {
  const specs = Array.from({ length: 4 }, (_, index) =>
    ['@core-interaction', '@webkit', 'untagged']
      .map(
        (tag) => `test('${tag} case ${index}', ({}, testInfo) => {
          expect(testInfo.config.workers).toBe(1)
          console.log('SELECTED:${index}:${tag}')
        })`
      )
      .join('\n')
  )
  const selected = []
  for (const shard of ['1/2', '2/2']) {
    const result = runSpec(configs[0], specs, { CI: 'true', CANVASLIDE_E2E_WEBKIT: '1' }, [
      '--project=webkit',
      `--shard=${shard}`
    ])
    assert.equal(result.status, 0, result.output)
    const cases = [...result.output.matchAll(/SELECTED:(\d+:@[^\s]+)/g)].map(([, id]) => id)
    assert.ok(cases.length > 0, result.output)
    assert.doesNotMatch(result.output, /SELECTED:.*untagged/)
    selected.push(...cases)
  }
  assert.deepEqual(
    selected.toSorted((a, b) => a.localeCompare(b)),
    Array.from({ length: 4 }, (_, index) =>
      ['@core-interaction', '@webkit'].map((tag) => `${index}:${tag}`)
    )
      .flat()
      .toSorted((a, b) => a.localeCompare(b))
  )
})
