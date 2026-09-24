import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const workflowDirectory = new URL('../../.github/workflows/', import.meta.url)
const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(new URL(name, workflowDirectory), 'utf8') }))
const release = workflows.find(({ name }) => name === 'release.yml').text

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
  assert.match(release, /\npermissions:\n {2}contents: read\n/)
  assert.doesNotMatch(jobs.build + jobs.sign, /permissions:|github\.token|GITHUB_TOKEN/)
  assert.match(jobs.build, /\n\s+- run: pnpm tauri build [^\n]*--no-sign\n/)
  assert.match(jobs.publish, /\n {4}permissions:\n {6}contents: write\n/)
  const tokenSteps = stepsOf(jobs.publish).filter((step) => step.includes('github.token'))
  assert.ok(tokenSteps.some((step) => /gh release create/.test(step)))
  for (const step of tokenSteps) {
    assert.doesNotMatch(step, /\b(pnpm|npm|npx|node) /, step)
  }
})
