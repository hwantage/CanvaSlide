import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { jobsOf, needsOf, stepsOf } from './workflow-structure.mjs'

const jobs = jobsOf(
  readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')
)
const dependencies = (id) => needsOf(jobs[id])

// Model the string comparisons and status functions used here, including implicit success().
// GitHub semantics: https://docs.github.com/en/actions/reference/workflows-and-actions/expressions
function evaluate(condition, context, status, implicitSuccess = true) {
  const expression = (condition ?? 'true').replace(/^\$\{\{\s*|\s*\}\}$/g, '')
  if (
    implicitSuccess &&
    !/\b(success|failure|cancelled|always)\s*\(/.test(expression) &&
    !status.success()
  ) {
    return false
  }
  return runInNewContext(
    expression,
    { ...context, ...status, always: () => true },
    { timeout: 100 }
  )
}

function ancestors(id) {
  return [
    ...new Set(dependencies(id).flatMap((dependency) => [dependency, ...ancestors(dependency)]))
  ]
}

function contextFor(id, results, value) {
  return {
    vars: { MACOS_NOTARIZE: value.toLowerCase() },
    needs: Object.fromEntries(
      dependencies(id).map((dependency) => [dependency, { result: results[dependency] }])
    )
  }
}

function jobRuns(id, results, value, cancelled = false) {
  const upstream = ancestors(id).map((dependency) => results[dependency])
  assert.ok(upstream.every(Boolean), `${id} must wait for all prerequisites`)
  return evaluate(jobs[id].if, contextFor(id, results, value), {
    success: () => !cancelled && upstream.every((result) => result === 'success'),
    failure: () => upstream.includes('failure'),
    // A cancelled dependency does not imply that the workflow itself was cancelled.
    cancelled: () => cancelled
  })
}

function releaseRun(value, outcomes = {}) {
  const results = {}
  const visiting = new Set()
  function finish(id) {
    if (results[id]) {
      return
    }
    assert.ok(!visiting.has(id), `cyclic dependency: ${id}`)
    visiting.add(id)
    for (const dependency of dependencies(id)) {
      finish(dependency)
    }
    results[id] = jobRuns(id, results, value) ? (outcomes[id] ?? 'success') : 'skipped'
    visiting.delete(id)
  }
  for (const id of Object.keys(jobs)) {
    finish(id)
  }
  return results
}

function downloadedArtifacts(id, results, value, available) {
  return stepsOf(jobs[id])
    .filter((step) => step.uses?.startsWith('actions/download-artifact@'))
    .filter((step) =>
      evaluate(step.if, contextFor(id, results, value), {
        success: () => true,
        failure: () => false,
        cancelled: () => false
      })
    )
    .flatMap((step) => {
      assert.equal(step.with['path'], 'release-assets')
      const reference = step.with['name']
      const name = reference?.startsWith('${{')
        ? evaluate(reference, contextFor(id, results, value), {}, false)
        : reference
      if (name) {
        assert.ok(available.includes(name), `missing artifact ${name}`)
        return [name]
      }
      assert.equal(step.with['pattern'], 'release-*')
      assert.equal(step.with['merge-multiple'], true)
      return available.filter((artifact) => artifact.startsWith('release-'))
    })
}

test('notarization is opt-in at job level while both release paths finish', () => {
  for (const value of ['', 'false', '0', '1', 'yes', 'true ', 'true', 'TRUE']) {
    const enabled = value.toLowerCase() === 'true'
    assert.deepEqual(
      releaseRun(value),
      {
        gate: 'success',
        build: 'success',
        notarize: enabled ? 'success' : 'skipped',
        sign: 'success',
        publish: 'success'
      },
      `MACOS_NOTARIZE=${JSON.stringify(value)}`
    )
  }
})

test('sign waits for build and notarization, and publish waits for signing and its notarization output', () => {
  assert.deepEqual(dependencies('notarize'), ['build'])
  assert.deepEqual(new Set(dependencies('sign')), new Set(['build', 'notarize']))
  assert.deepEqual(new Set(dependencies('publish')), new Set(['notarize', 'sign']))
})

test('failed or cancelled prerequisites never reach signing or publishing', () => {
  for (const value of ['', 'true']) {
    for (const result of ['failure', 'cancelled']) {
      for (const failed of ['gate', 'build', ...(value ? ['notarize'] : []), 'sign']) {
        const results = releaseRun(value, { [failed]: result })
        assert.equal(results[failed], result)
        for (const id of ['notarize', 'sign', 'publish']) {
          if (ancestors(id).includes(failed)) {
            assert.equal(results[id], 'skipped', `${failed} ${result} -> ${id}`)
          }
        }
      }
    }
    const results = releaseRun(value)
    for (const id of ['sign', 'publish']) {
      assert.equal(jobRuns(id, results, value, true), false, `${id} after cancellation`)
    }
    assert.equal(
      jobRuns('sign', { gate: 'success', build: 'skipped', notarize: 'skipped' }, value),
      false
    )
    assert.equal(
      jobRuns(
        'publish',
        { gate: 'success', build: 'success', notarize: 'skipped', sign: 'skipped' },
        value
      ),
      false
    )
  }
})

for (const id of ['sign', 'publish']) {
  test(`${id} only accepts successful or skipped notarization while the workflow remains active`, () => {
    for (const notarize of ['success', 'skipped', 'failure', 'cancelled']) {
      const results = { gate: 'success', build: 'success', notarize, sign: 'success' }
      assert.equal(
        jobRuns(id, results, 'true', false),
        notarize === 'success' || notarize === 'skipped',
        `${id}: notarize=${notarize}, workflow not cancelled`
      )
    }
  })
}

test('both consumers select exactly one macOS artifact and keep Windows files and signatures', () => {
  for (const [value, staleArtifact] of [
    ['', false],
    ['', true],
    ['true', false]
  ]) {
    const results = releaseRun(value)
    const available = ['macos-build', 'release-windows-latest']
    // A rerun may retain a processed artifact from an earlier enabled attempt.
    if (value || staleArtifact) {
      available.push('release-macos-latest')
    }
    const macOS = value ? 'release-macos-latest' : 'macos-build'
    assert.deepEqual(
      downloadedArtifacts('sign', results, value, available).sort(),
      [macOS, 'release-windows-latest'].sort()
    )
    available.push('release-updater-signatures')
    assert.deepEqual(
      downloadedArtifacts('publish', results, value, available).sort(),
      [macOS, 'release-windows-latest', 'release-updater-signatures'].sort()
    )
  }
})
