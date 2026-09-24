import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
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
  assert.deepEqual(Object.keys(jobs), ['build', 'sign', 'publish'])
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
  const script = step
    .slice(step.indexOf('run: |\n') + 'run: |\n'.length)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
  return spawnSync('bash', ['-e', '-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

// Why: the scripts run with bash on Linux runners.
const shellSkip = process.platform === 'win32' && 'runs workflow scripts with bash'

test('the required CI passed check depends on every other CI job, even failed ones', () => {
  const jobs = jobsOf(ci)
  const passed = `\n${jobs.passed}\n`
  assert.match(passed, /\n {4}name: CI passed\n/)
  // Why: a skipped required check counts as passing, so this job must run even when a need failed.
  assert.match(passed, /\n {4}if: always\(\)\n/)
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
