import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const workflowDirectory = new URL('../../.github/workflows/', import.meta.url)
const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(new URL(name, workflowDirectory), 'utf8') }))
const release = workflows.find(({ name }) => name === 'release.yml').text
const ci = workflows.find(({ name }) => name === 'ci.yml').text

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
function runScript(step, env) {
  const body = step.slice(step.indexOf('run: |\n') + 'run: |\n'.length).split('\n')
  const end = body.findIndex((line) => line.trim() && !line.startsWith(' '.repeat(10)))
  const script = body
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.slice(10))
    .join('\n')
  return spawnSync('bash', ['-e', '-c', script], {
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

test('E2E runs once, split into shards that together cover the suite', () => {
  const { e2e } = jobsOf(ci)
  assert.equal(ci.match(/test:e2e/g).length, 1)
  assert.match(
    e2e,
    /\n {6}- run: pnpm test:e2e --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}\n/
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
