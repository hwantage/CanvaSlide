import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const workflowDirectory = new URL('../../.github/workflows/', import.meta.url)
const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(new URL(name, workflowDirectory), 'utf8') }))
const release = workflows.find(({ name }) => name === 'release.yml').text
const ci = workflows.find(({ name }) => name === 'ci.yml').text
const releaseNotes = workflows.find(({ name }) => name === 'release-notes.yml').text
const playwrightConfig = readFileSync(
  new URL('../../tests/playwright.config.ts', import.meta.url),
  'utf8'
)

// Each job's lines, keyed by job id, from a workflow whose jobs sit at two-space indent.
function jobsOf(workflow) {
  const jobs = {}
  let current = null
  for (const line of workflow.slice(workflow.indexOf('\njobs:\n')).split('\n').slice(2)) {
    const id = /^ {2}([\w-]+):\s*$/.exec(line)?.[1]
    if (id) {
      current = jobs[id] = []
    } else if (current && !/^ {2}#/.test(line)) {
      current.push(line)
    }
  }
  return Object.fromEntries(Object.entries(jobs).map(([id, lines]) => [id, lines.join('\n')]))
}

// The `permissions:` map at the given indent, as its entry lines; null when the block is absent.
function permissionsAt(text, indent) {
  const block = new RegExp(`\\n${indent}permissions:\\n((?:${indent}  .*\\n)*)`).exec(text)
  return (
    block &&
    block[1]
      .trimEnd()
      .split('\n')
      .map((line) => line.trim())
  )
}

// Steps split at their `- ` marker, so each keeps its own `with:`, `env:` and `run:`.
const stepsOf = (job) => job.split(/\n(?= {6}- )/).slice(1)

test('every action is pinned to a full commit SHA with its version in a comment', () => {
  for (const { name, text } of workflows) {
    for (const [, reference] of text.matchAll(/^\s*(?:- )?uses:\s*(.+)$/gm)) {
      assert.match(reference, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # \S+$/, `${name}: ${reference}`)
    }
  }
})

test('no checkout leaves the job token in the working copy', () => {
  for (const { name, text } of workflows) {
    for (const step of stepsOf(text).filter((step) => step.includes('actions/checkout@'))) {
      assert.match(step, /\n\s+persist-credentials: false\b/, `${name}: ${step}`)
    }
  }
})

test('only the release sign job receives the updater key, from the release environment', () => {
  const jobs = jobsOf(release)
  assert.deepEqual(Object.keys(jobs), ['gate', 'build', 'sign', 'publish'])
  for (const { name, text } of workflows.filter(({ name }) => name !== 'release.yml')) {
    assert.doesNotMatch(text, /TAURI_SIGNING/, name)
  }
  assert.doesNotMatch(jobs.build + jobs.publish, /TAURI_SIGNING|secrets\./)
  assert.match(jobs.sign, /\n {4}environment: release\n/)
  const keySteps = stepsOf(jobs.sign).filter((step) => step.includes('TAURI_SIGNING'))
  assert.equal(keySteps.length, 1)
  assert.match(keySteps[0], /\n\s+node_modules\/\.bin\/tauri signer sign "\$file"\n/)
  assert.doesNotMatch(keySteps[0], /\b(pnpm|npm|npx|node) /)
  for (const install of jobs.sign.match(/pnpm install[^\n]*/g)) {
    assert.match(install, /--ignore-scripts\b/)
  }
})

test('the release build runs without secrets or write access, and only publish can write', () => {
  const jobs = jobsOf(release)
  // Build and sign inherit the workflow-level map, so it must hold nothing beyond read access.
  assert.deepEqual(permissionsAt(release, ''), ['contents: read'])
  assert.doesNotMatch(jobs.build + jobs.sign, /permissions:|github\.token|GITHUB_TOKEN/)
  assert.match(jobs.build, /\n\s+- run: pnpm tauri build [^\n]*--no-sign\n/)
  assert.deepEqual(permissionsAt(`\n${jobs.publish}\n`, '    '), ['contents: write'])
  const tokenSteps = stepsOf(jobs.publish).filter((step) => step.includes('github.token'))
  assert.ok(tokenSteps.some((step) => /gh release create/.test(step)))
  for (const step of tokenSteps) {
    assert.doesNotMatch(step, /\b(pnpm|npm|npx|node) /, step)
  }
})

// A step's `run: |` script, run by bash with `-e` as Actions does, with `env` added.
function runScript(step, env, cwd) {
  const body = step.slice(step.indexOf('run: |\n') + 'run: |\n'.length).split('\n')
  const end = body.findIndex((line) => line.trim() && !line.startsWith(' '.repeat(10)))
  const script = body
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.slice(10))
    .join('\n')
  return spawnSync('bash', ['-e', '-c', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10_000
  })
}

// Why: the scripts run on Linux runners; the fakes below are POSIX executables and `gh --jq` is jq.
const shellSkip =
  process.platform === 'win32'
    ? 'runs workflow scripts with POSIX executables'
    : spawnSync('jq', ['--version']).error && 'needs jq to stand in for gh --jq'

// Why: a job or step that is skipped or may fail without failing its job lets a failed check through.
const bypassesFailure = /\n\s+(-\s+)?(if|continue-on-error):/

test('the required CI passed check depends on every other CI job, even failed ones', () => {
  const jobs = jobsOf(ci)
  const passed = `\n${jobs.passed}\n`
  assert.match(passed, /\n {4}name: CI passed\n/)
  // Why: a skipped required check counts as passing, so this job must run even when a need failed.
  assert.match(passed, /\n {4}if: always\(\)\n/)
  assert.doesNotMatch(passed.replace('\n    if: always()\n', '\n'), bypassesFailure)
  const needs = /\n {4}needs: \[([^\]]*)\]\n/.exec(passed)[1].split(/,\s*/)
  assert.deepEqual(
    needs.toSorted(),
    Object.keys(jobs)
      .filter((id) => id !== 'passed')
      .toSorted()
  )
})

test('the required CI passed check fails unless every job succeeded', { skip: shellSkip }, () => {
  const [step] = stepsOf(jobsOf(ci).passed)
  assert.match(step, /\n\s+RESULTS: \$\{\{ join\(needs\.\*\.result, ' '\) \}\}\n/)
  const outcome = (results) => runScript(step, { RESULTS: results }).status
  assert.equal(outcome('success success success'), 0)
  for (const results of ['success failure success', 'success success skipped', 'cancelled']) {
    assert.notEqual(outcome(results), 0, results)
  }
})

test('every CI job has a time limit', () => {
  for (const [id, job] of Object.entries(jobsOf(ci))) {
    assert.match(`\n${job}\n`, /\n {4}timeout-minutes: \d+\n/, id)
  }
})

// The step whose `run:` is exactly `command`, failing unless exactly one exists and nothing lets it
// or its job be skipped or fail without failing the run.
function checkedStep(job, command) {
  // Why: job keys may follow `steps:`, and only they sit at four spaces.
  assert.doesNotMatch(job, /\n {4}(if|continue-on-error):/)
  const steps = stepsOf(job).filter(
    (step) => step.startsWith(`      - run: ${command}\n`) || step === `      - run: ${command}`
  )
  assert.equal(steps.length, 1, command)
  assert.doesNotMatch(steps[0], bypassesFailure, command)
  return steps[0]
}

test('E2E runs each Playwright project once, splitting Linux into shards', () => {
  const { e2e } = jobsOf(ci)
  const projectsOf = (args) => [...args.matchAll(/--project=(\S+)/g)].map(([, name]) => name)
  const runs = [...ci.matchAll(/\n {6}- run: pnpm test:e2e (.+)\n/g)].map(([, args]) => args)
  assert.equal(runs.length, ci.match(/test:e2e/g).length)
  const projects = playwrightConfig.slice(playwrightConfig.indexOf('\n  projects: ['))
  const configured = [...projects.matchAll(/\bname: '([^']+)'/g)].map(([, name]) => name)
  assert.ok(configured.length > 1)
  assert.deepEqual(runs.flatMap(projectsOf).toSorted(), configured.toSorted())
  const [shardRun] = runs.filter((args) => args.includes('--shard='))
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

test('WebKit runs on macOS with the @webkit scenarios', () => {
  const [job, ...others] = Object.values(jobsOf(ci)).filter((job) =>
    /\n {6}- run: pnpm test:e2e [^\n]*--project=webkit\b/.test(job)
  )
  assert.ok(job && others.length === 0)
  assert.match(job, /\n {4}runs-on: macos-latest\n/)
  const step = checkedStep(job, 'pnpm test:e2e --project=webkit')
  // Why: the flag CI sets must be the one the config reads to add the `@webkit` scenarios.
  const flag = /process\.env\.(\w+) \? \/[^/\n]*@webkit/.exec(playwrightConfig)[1]
  assert.match(`${step}\n`, new RegExp(`\\n {10}${flag}: '1'\\n`))
  assert.match(job, /\n\s+name: playwright-traces-webkit\n/)
})

test('Rust is checked on Linux, macOS and Windows, the scripts on Linux and Windows', () => {
  const { verify, rust } = jobsOf(ci)
  const osMatrix = (job) => /\n {8}os: \[([^\]]*)\]\n/.exec(`${job}\n`)[1].split(/,\s*/)
  for (const job of [verify, rust]) {
    assert.match(job, /\n {4}runs-on: \$\{\{ matrix\.os \}\}\n/)
    assert.match(job, /\n {6}fail-fast: false\n/)
  }
  assert.deepEqual(osMatrix(verify), ['ubuntu-latest', 'windows-latest'])
  for (const script of ['lint', 'format:check', 'typecheck', 'test']) {
    checkedStep(verify, `pnpm ${script}`)
  }
  assert.deepEqual(osMatrix(rust), ['ubuntu-latest', 'macos-latest', 'windows-latest'])
  for (const command of [
    'cargo fmt --manifest-path src-tauri/Cargo.toml --check',
    // Why: without `--all-targets`, the platform-specific tests are never linted.
    'cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings',
    'cargo test --manifest-path src-tauri/Cargo.toml'
  ]) {
    checkedStep(rust, command)
  }
})

test('CI artifacts expire instead of keeping the 90-day default', () => {
  const uploads = stepsOf(ci).filter((step) => step.includes('actions/upload-artifact@'))
  assert.ok(uploads.length > 0)
  for (const step of uploads) {
    // Why: 0 means "use the repository default" to upload-artifact.
    assert.match(step, /\n\s+retention-days: [1-9]\d*\n/, step)
  }
})

test('a new push cancels superseded pull request checks but never a run on main', () => {
  const block = /\nconcurrency:\n((?: {2}.*\n)+)/.exec(ci)[1]
  const group = /^ {2}group: ci-\$\{\{ (.+) \}\}$/m.exec(block)[1]
  assert.equal(group, "github.event_name == 'pull_request' && github.ref || github.run_id")
  assert.match(block, /^ {2}cancel-in-progress: true$/m)
})

test('the release builds only after the gate job, which reads CI runs and runs no code', () => {
  const jobs = jobsOf(release)
  assert.match(jobs.build, /\n {4}needs: gate\n/)
  for (const id of ['gate', 'build', 'sign', 'publish']) {
    assert.doesNotMatch(`\n${jobs[id]}`, bypassesFailure, id)
  }
  assert.deepEqual(permissionsAt(`\n${jobs.gate}\n`, '    '), ['actions: read'])
  assert.doesNotMatch(jobs.gate, /actions\/checkout@|secrets\.|\b(pnpm|npm|npx|node) /)
})

// The gate step, with `gh` answering from `responses` in order (the last one repeats; `{ error }`
// fails like an HTTP error) and `sleep` returning at once, failing once the gate polls endlessly.
function runGate(responses) {
  const [step] = stepsOf(jobsOf(release).gate)
  const bin = mkdtempSync(join(tmpdir(), 'release-gate-'))
  const calls = join(bin, 'calls.json')
  const sleeps = join(bin, 'sleeps')
  try {
    writeFileSync(join(bin, 'responses.json'), JSON.stringify(responses))
    writeFileSync(calls, '[]')
    writeFileSync(sleeps, '')
    writeFileSync(
      join(bin, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const calls = JSON.parse(fs.readFileSync(${JSON.stringify(calls)}, 'utf8'))
calls.push(process.argv.slice(2))
fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify(calls))
const responses = JSON.parse(fs.readFileSync(${JSON.stringify(join(bin, 'responses.json'))}, 'utf8'))
const response = responses[Math.min(calls.length, responses.length) - 1]
if (response.error) {
  process.stdout.write(JSON.stringify({ message: response.error }))
  process.stderr.write('gh: ' + response.error + '\\n')
  process.exit(1)
}
const jq = process.argv[process.argv.indexOf('--jq') + 1]
process.stdout.write(execFileSync('jq', ['-r', jq], { input: JSON.stringify(response) }))
`
    )
    writeFileSync(
      join(bin, 'sleep'),
      `#!/bin/sh\necho "$1" >> ${JSON.stringify(sleeps)}\n[ "$(wc -l < ${JSON.stringify(sleeps)})" -le 50 ]\n`
    )
    chmodSync(join(bin, 'gh'), 0o755)
    chmodSync(join(bin, 'sleep'), 0o755)
    const result = runScript(step, {
      PATH: `${bin}:${process.env.PATH}`,
      GH_REPO: 'owner/repo',
      SHA: 'abc123'
    })
    assert.equal(result.signal, null, 'the gate script did not finish')
    return {
      status: result.status,
      stderr: result.stderr,
      calls: JSON.parse(readFileSync(calls, 'utf8')),
      sleeps: readFileSync(sleeps, 'utf8').split('\n').filter(Boolean)
    }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

const noRun = { workflow_runs: [] }
const runOf = (status, conclusion) => ({
  workflow_runs: [{ status, conclusion, html_url: 'https://example.test/run' }]
})

test(
  'the release gate asks for CI pushed to main on the tagged commit',
  { skip: shellSkip },
  () => {
    const { status, calls, sleeps } = runGate([runOf('completed', 'success')])
    assert.equal(status, 0)
    assert.equal(sleeps.length, 0)
    const [args] = calls
    assert.equal(args[args.indexOf('-X') + 1], 'GET')
    assert.ok(args.includes('repos/owner/repo/actions/workflows/ci.yml/runs'))
    for (const field of ['head_sha=abc123', 'event=push', 'branch=main', 'per_page=1']) {
      assert.ok(args.includes(field), field)
    }
  }
)

test('the release gate waits for CI to start and finish', { skip: shellSkip }, () => {
  const running = runOf('in_progress', null)
  const responses = [noRun, noRun, runOf('queued', null), running, running]
  const { status, calls, sleeps } = runGate([...responses, runOf('completed', 'success')])
  assert.equal(status, 0)
  assert.deepEqual(sleeps, ['30', '30', '30', '30', '30'])
  assert.equal(calls.length, 6)
  for (const args of calls) {
    assert.deepEqual(args, calls[0])
  }
})

test(
  'the release gate fails when CI on the tagged commit did not succeed',
  { skip: shellSkip },
  () => {
    const conclusions = ['failure', 'cancelled', 'timed_out', 'skipped', 'startup_failure']
    for (const conclusion of [...conclusions, 'action_required', 'neutral', 'stale', 'unknown']) {
      const { status, stderr } = runGate([
        runOf('in_progress', null),
        runOf('completed', conclusion)
      ])
      assert.notEqual(status, 0, conclusion)
      assert.match(stderr, new RegExp(`finished with ${conclusion}`))
    }
  }
)

test('the release gate stops when the Actions API fails', { skip: shellSkip }, () => {
  for (const responses of [
    [{ error: 'HTTP 502' }, runOf('completed', 'success')],
    [runOf('in_progress', null), { error: 'HTTP 502' }, runOf('completed', 'success')]
  ]) {
    const { status, stderr, calls } = runGate(responses)
    assert.notEqual(status, 0)
    assert.match(stderr, /gh: HTTP 502/)
    assert.equal(calls.length, responses.length - 1)
  }
})

test(
  'the release gate fails when main never ran CI on the tagged commit',
  { skip: shellSkip },
  () => {
    const { status, stderr, sleeps } = runGate([noRun])
    assert.notEqual(status, 0)
    assert.equal(sleeps.length, 20)
    assert.match(stderr, /No CI run from a push to main for abc123/)
  }
)

test('the release draft starts without notes and passes the feed script only flags it accepts', () => {
  const upload = stepsOf(jobsOf(release).publish).find((step) => /gh release create/.test(step))
  // Why: the published body becomes the update notice's notes, so no placeholder may start it.
  assert.match(upload, /\n\s+--title "CanvaSlide \$TAG" --notes ''\n/)
  const feedStep = stepsOf(jobsOf(release).publish).find((step) =>
    step.includes('updater-feed.mjs')
  )
  // The step's only other command is `git show`, so every flag in it is one for the feed script.
  const flags = [...new Set(feedStep.match(/(?<=[\s(])--[\w-]+/g))]
  assert.deepEqual(flags.toSorted(), ['--repository', '--tag', '--trusted-config'])
  const script = fileURLToPath(new URL('./updater-feed.mjs', import.meta.url))
  const args = ['missing-directory', ...flags.flatMap((flag) => [flag, 'x'])]
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stderr, /usage|Unknown option/)
})

test('release notes are copied only from a published release, and only steps without code get the token', () => {
  assert.match(
    releaseNotes,
    /\non:\n {2}release:\n {4}types: \[published, edited\]\n {2}workflow_dispatch:\n/
  )
  assert.match(releaseNotes, /\n {6}tag:\n {8}description: [^\n]+\n {8}required: true\n/)
  assert.match(
    releaseNotes,
    /\nconcurrency:\n {2}group: release-notes-\$\{\{ github\.event\.release\.tag_name \|\| inputs\.tag \}\}\n {2}cancel-in-progress: false\n/
  )
  assert.deepEqual(permissionsAt(releaseNotes, ''), ['contents: read'])
  const jobs = jobsOf(releaseNotes)
  assert.deepEqual(Object.keys(jobs), ['notes'])
  assert.match(
    jobs.notes,
    /\n {4}if: github\.event_name == 'workflow_dispatch' \|\| !github\.event\.release\.draft\n/
  )
  assert.match(
    jobs.notes,
    /\n {4}env:\n {6}TAG: \$\{\{ github\.event\.release\.tag_name \|\| inputs\.tag \}\}\n {4}steps:\n/
  )
  assert.deepEqual(permissionsAt(`\n${jobs.notes}\n`, '    '), ['contents: write'])
  assert.doesNotMatch(releaseNotes, /secrets\./)
  const steps = stepsOf(jobs.notes).filter((step) => step.includes('run: |'))
  // Why: counting the whole file also catches a token moved up to the job or workflow env.
  assert.equal(releaseNotes.match(/github\.token/g).length, 2)
  assert.equal(releaseNotes.match(/GH_TOKEN/g).length, 2)
  assert.deepEqual(
    steps.map((step) => /\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/.test(step)),
    [true, false, true]
  )
  for (const step of [steps[0], steps[2]]) {
    assert.doesNotMatch(step, /\b(pnpm|npm|npx|node) /, step)
  }
})

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const publishedFeed = {
  version: '1.2.3',
  notes: 'See the assets below to download this version and install.',
  pub_date: '2026-01-02T03:04:05.678Z',
  platforms: { 'darwin-aarch64': { signature: 'c2ln', url: 'https://example.test/app.tar.gz' } }
}
const publishedRelease = (overrides = {}) => ({
  isDraft: false,
  body: 'Notes',
  assets: [
    { id: 11, name: 'CanvaSlide.dmg', content: 'dmg' },
    { id: 12, name: 'latest.json', content: JSON.stringify(publishedFeed) }
  ],
  ...overrides
})

// The release-notes steps in order against a fake `gh` that keeps `release` (isDraft, body and
// assets) for tag v1.2.3 and fails the first `failOn` call ('upload', 'DELETE' or 'PATCH').
function runReleaseNotes(release, failOn) {
  const temp = mkdtempSync(join(tmpdir(), 'release-notes-'))
  const bin = join(temp, 'bin')
  const runnerTemp = join(temp, 'runner')
  const state = join(temp, 'state.json')
  try {
    mkdirSync(bin)
    mkdirSync(runnerTemp)
    writeFileSync(state, JSON.stringify({ release, failOn, calls: [] }))
    writeFileSync(
      join(bin, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const args = process.argv.slice(2)
const state = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const { release } = state
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(state))
const fail = (message) => {
  save()
  process.stderr.write(message + '\\n')
  process.exit(1)
}
state.calls.push(args.join(' '))
const operation = args[0] === 'api' ? args[args.indexOf('-X') + 1] : args[1]
if (operation === state.failOn) {
  state.failOn = null
  if (operation === 'upload') {
    // --clobber deletes the asset of the same name before the upload fails.
    release.assets = release.assets.filter(({ name }) => name !== path.basename(args[3]))
  }
  fail('gh: HTTP 502')
}
if (args[0] === 'release' && args[2] !== 'v1.2.3') {
  fail('release not found')
}
if (operation === 'view') {
  const assets = release.assets.map(({ id, name }) => ({
    name,
    apiUrl: 'https://api.github.com/repos/owner/repo/releases/assets/' + id
  }))
  const input = JSON.stringify({ isDraft: release.isDraft, body: release.body, assets })
  process.stdout.write(execFileSync('jq', ['-r', args[args.indexOf('--jq') + 1]], { input }))
} else if (operation === 'download') {
  const asset = release.assets.find(({ name }) => name === args[args.indexOf('--pattern') + 1])
  if (!asset) {
    fail('no assets match the file pattern')
  }
  fs.writeFileSync(args[args.indexOf('--output') + 1], asset.content)
} else if (operation === 'upload') {
  const name = path.basename(args[3])
  release.assets = release.assets.filter((asset) => asset.name !== name)
  const id = Math.max(0, ...release.assets.map((asset) => asset.id)) + 1
  release.assets.push({ id, name, content: fs.readFileSync(args[3], 'utf8') })
} else if (operation === 'DELETE' || operation === 'PATCH') {
  const id = Number(/^repos\\/owner\\/repo\\/releases\\/assets\\/(\\d+)$/.exec(args[3])?.[1])
  const asset = release.assets.find((asset) => asset.id === id)
  if (!asset) {
    fail('gh: Not Found (HTTP 404)')
  }
  if (operation === 'DELETE') {
    release.assets = release.assets.filter((other) => other !== asset)
  } else {
    const name = args[args.indexOf('-f') + 1].replace(/^name=/, '')
    if (release.assets.some((other) => other.name === name)) {
      fail('gh: Validation Failed (HTTP 422)')
    }
    asset.name = name
  }
} else {
  fail('unexpected gh call')
}
save()
`
    )
    chmodSync(join(bin, 'gh'), 0o755)
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: runnerTemp,
      TAG: 'v1.2.3',
      GH_REPO: 'owner/repo'
    }
    let result
    for (const step of stepsOf(jobsOf(releaseNotes).notes).filter((step) =>
      step.includes('run: |')
    )) {
      result = runScript(step, env, repositoryRoot)
      if (result.status !== 0) {
        break
      }
    }
    const final = JSON.parse(readFileSync(state, 'utf8'))
    return {
      status: result.status,
      stderr: result.stderr,
      calls: final.calls,
      release: final.release
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

// The release's feed names and the notes of its live latest.json.
const feedState = ({ assets }) => ({
  names: assets.map(({ name }) => name).toSorted(),
  notes: JSON.parse(assets.find(({ name }) => name === 'latest.json')?.content ?? '{}').notes
})

test(
  'publishing a release replaces its latest.json notes with the Release body',
  { skip: shellSkip },
  () => {
    const before = publishedRelease({ body: '## What is new\r\n\r\n- Export as PDF\r\n' })
    const { status, stderr, calls, release } = runReleaseNotes(before)
    assert.equal(status, 0, stderr)
    assert.deepEqual(release.assets[0], before.assets[0])
    assert.deepEqual(release.assets.map(({ name }) => name).toSorted(), [
      'CanvaSlide.dmg',
      'latest.json'
    ])
    const feed = JSON.parse(release.assets.find(({ name }) => name === 'latest.json').content)
    assert.deepEqual(feed, { ...publishedFeed, notes: '## What is new\n\n- Export as PDF' })
    for (const call of calls.filter((call) => call.startsWith('release '))) {
      assert.match(call, /^release \w+ v1\.2\.3 /)
    }
    assert.ok(calls.includes('api -X DELETE repos/owner/repo/releases/assets/12'), calls.join('\n'))
  }
)

test('a release without a body gets a latest.json without notes', { skip: shellSkip }, () => {
  for (const body of [null, '']) {
    const { status, stderr, release } = runReleaseNotes(publishedRelease({ body }))
    assert.equal(status, 0, stderr)
    const feed = JSON.parse(release.assets.find(({ name }) => name === 'latest.json').content)
    assert.equal('notes' in feed, false, String(body))
    assert.deepEqual(feed.platforms, publishedFeed.platforms)
  }
})

test('a draft or a latest.json for another version is left unchanged', { skip: shellSkip }, () => {
  const draft = runReleaseNotes(publishedRelease({ isDraft: true }))
  assert.notEqual(draft.status, 0)
  assert.match(draft.stderr, /Release v1\.2\.3 is a draft/)
  assert.deepEqual(draft.release, publishedRelease({ isDraft: true }))
  const otherFeed = JSON.stringify({ ...publishedFeed, version: '1.2.2' })
  const otherRelease = publishedRelease({
    assets: [{ id: 12, name: 'latest.json', content: otherFeed }]
  })
  const other = runReleaseNotes(otherRelease)
  assert.notEqual(other.status, 0)
  assert.match(other.stderr, /latest\.json is for version 1\.2\.2, not 1\.2\.3/)
  assert.deepEqual(other.release, otherRelease)
})

test(
  'a failed replacement never removes the live latest.json, or is repaired by running again',
  { skip: shellSkip },
  () => {
    const placeholder = { names: ['CanvaSlide.dmg', 'latest.json'], notes: publishedFeed.notes }
    const replaced = { names: ['CanvaSlide.dmg', 'latest.json'], notes: 'Notes' }
    for (const [failOn, afterFailure] of [
      ['upload', placeholder],
      ['DELETE', { ...placeholder, names: ['CanvaSlide.dmg', 'latest.json', 'latest.next.json'] }],
      // Why: only a failed rename right after the delete leaves no latest.json, until the next run.
      ['PATCH', { names: ['CanvaSlide.dmg', 'latest.next.json'], notes: undefined }]
    ]) {
      const failed = runReleaseNotes(publishedRelease(), failOn)
      assert.notEqual(failed.status, 0, failOn)
      assert.deepEqual(feedState(failed.release), afterFailure, failOn)
      const rerun = runReleaseNotes(failed.release)
      assert.equal(rerun.status, 0, `${failOn}: ${rerun.stderr}`)
      assert.deepEqual(feedState(rerun.release), replaced, failOn)
    }
  }
)
