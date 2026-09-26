import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkedStep, jobsOf, needsOf, stepsOf } from './workflow-structure.mjs'

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

// Split shell invocations before collecting flags so another command cannot lend its --project.
function e2eInvocations(script) {
  return (
    script
      .replace(/\\\r?\n\s*/g, ' ')
      .match(/\b(?:pnpm\s+(?:run\s+)?test:e2e|(?:pnpm\s+exec\s+)?playwright\s+test)\b[^\n;&|]*/g) ??
    []
  )
}

const projectsOf = (command) =>
  [...command.matchAll(/--project(?:=| +)([\w-]+)/g)].map(([, name]) => name)

function explicitProjects(commands) {
  assert.ok(commands.length > 0)
  for (const command of commands) {
    assert.ok(projectsOf(command).length > 0, command)
  }
  return commands.flatMap(projectsOf)
}

test('E2E project selection is checked separately for multiline and chained commands', () => {
  for (const separator of ['\n', '; ', ' && ', ' || ']) {
    const script = `pnpm test:e2e --project=chromium${separator}pnpm test:e2e`
    assert.throws(() => explicitProjects(e2eInvocations(script)), /pnpm test:e2e/)
  }
  assert.deepEqual(explicitProjects(e2eInvocations('pnpm test:e2e --project=chromium\n')), [
    'chromium'
  ])
  const command = 'pnpm test:e2e --project=chromium\n'
  assert.doesNotThrow(() => checkedStep({ steps: [{ run: command }] }, command))
})

test('every E2E invocation selects projects explicitly, covering each configured project once', () => {
  const jobs = jobsOf(ci)
  const commands = Object.values(jobs)
    .flatMap(stepsOf)
    .flatMap((step) => e2eInvocations(step.run ?? ''))
  const selected = explicitProjects(commands)
  const projects = playwrightConfig.slice(playwrightConfig.indexOf('\n  projects: ['))
  const configured = [...projects.matchAll(/\bname: '([^']+)'/g)].map(([, name]) => name)
  assert.deepEqual(
    selected.sort((a, b) => a.localeCompare(b)),
    configured.sort((a, b) => a.localeCompare(b))
  )
  for (const id of ['e2e', 'e2e-webkit']) {
    const job = jobs[id]
    const step = job.steps.find((step) => step.run?.startsWith('pnpm test:e2e '))
    checkedStep(job, step.run)
    assert.ok(step.run.includes('--shard=${{ matrix.shard }}/${{ strategy.job-total }}'))
    const { shard, ...otherDimensions } = job.strategy.matrix
    assert.deepEqual(otherDimensions, {})
    assert.deepEqual(
      shard,
      shard.map((_, index) => index + 1)
    )
    assert.ok(shard.length > 1)
    assert.equal(job.strategy['fail-fast'], false)
    const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    assert.ok(upload.with.name.includes('${{ matrix.shard }}'))
  }
})

test('WebKit runs in two required macOS shards with the @webkit scenarios', () => {
  const jobs = jobsOf(ci)
  const job = jobs['e2e-webkit']
  assert.equal(job['runs-on'], 'macos-latest')
  assert.deepEqual(job.strategy.matrix, { shard: [1, 2] })
  assert.ok(needsOf(jobs.passed).includes('e2e-webkit'))
  const step = checkedStep(
    job,
    'pnpm test:e2e --project=webkit --shard=${{ matrix.shard }}/${{ strategy.job-total }}'
  )
  const flag = /process\.env\.(\w+) \? \/[^/\n]*@webkit/.exec(playwrightConfig)[1]
  assert.equal(step.env[flag], '1')
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
