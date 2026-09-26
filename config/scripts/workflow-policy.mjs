import assert from 'node:assert/strict'
import { needsOf, stepsOf } from './workflow-structure.mjs'

const hasSecrets = (value) => /\bsecrets\s*[.[]/.test(JSON.stringify(value) ?? '')
const hasToken = (value) => /github\s*\.\s*token/.test(JSON.stringify(value) ?? '')
const environmentName = (job) => job.environment?.name ?? job.environment

export function checkWorkflowSecurity(name, workflow) {
  const { jobs, ...topLevel } = workflow
  assert.ok(!hasSecrets(topLevel) && !hasToken(topLevel), `${name}: workflow-level secrets`)
  for (const [id, job] of Object.entries(jobs)) {
    const label = `${name}/${id}`
    const { steps = [], ...jobFields } = job
    assert.ok(!hasSecrets(jobFields) && !hasToken(jobFields), `${label}: job-level secrets`)
    if (job.uses) {
      assert.match(job.uses, /@[a-f0-9]{40}$/, label)
    }
    for (const step of steps) {
      if (hasToken(step)) {
        assert.ok(!hasToken({ ...step, env: undefined }), `${label}: token only in step env`)
        assert.doesNotMatch(
          step.run ?? '',
          /\b(?:pnpm|npm|npx|yarn|bun|node|cargo)\s/,
          `${label}: no package code with token`
        )
      }
      if (step.uses) {
        assert.match(step.uses, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/, label)
      }
      if (step.uses?.startsWith('actions/checkout@')) {
        assert.equal(step.with?.['persist-credentials'], false, label)
      }
      if (/^actions\/upload-(?:pages-)?artifact@/.test(step.uses ?? '')) {
        const days = step.with?.['retention-days']
        assert.ok(Number.isInteger(days) && days > 0 && days <= 90, `${label}: artifact expiry`)
      }
      if (/TAURI_SIGNING/.test(JSON.stringify(step))) {
        assert.equal(label, 'release.yml/sign', 'updater keys only in sign')
        assert.equal(environmentName(job), 'release')
      }
      if (/secrets\s*(?:\.APPLE_|\[['"]APPLE_)/.test(JSON.stringify(step))) {
        assert.equal(label, 'release.yml/notarize', 'Apple keys only in notarize')
        assert.equal(environmentName(job), 'release')
      }
    }
    if (hasSecrets(steps)) {
      assert.ok(
        ['release.yml/sign', 'release.yml/notarize', 'deploy-web-editor.yml/deploy'].includes(
          label
        ),
        `${label}: unexpected secret consumer`
      )
      for (const step of steps) {
        // Installs may fetch pinned tools, but lifecycle scripts must never run beside credentials.
        assert.ok(!step.with?.run_install, `${label}: action must not run package scripts`)
        const run = step.run ?? ''
        const safeInstall = run.trim() === 'pnpm install --frozen-lockfile --ignore-scripts'
        if (!safeInstall) {
          assert.doesNotMatch(run, /\b(?:pnpm|npm|npx|yarn|bun|node|cargo)\s/, label)
        }
        if (hasSecrets(step)) {
          assert.ok(!safeInstall && step.run, `${label}: secrets only on the consuming command`)
          assert.ok(
            !hasSecrets({ ...step, env: undefined }),
            `${label}: secrets must be in step env`
          )
        }
      }
    }
  }
}

export function checkDeployment(workflow) {
  const { gate, build, deploy } = workflow.jobs
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(build.permissions ?? workflow.permissions, { contents: 'read' })
  assert.equal(build.environment, undefined)
  assert.ok(!hasToken(build) && !hasSecrets(build), 'deployment build must not receive credentials')
  for (const job of [gate, build, deploy]) {
    assert.ok(!job['continue-on-error'])
    for (const step of stepsOf(job)) {
      assert.ok(!step['continue-on-error'])
    }
  }
  assert.equal(gate.if, "github.ref == 'refs/heads/main'")
  const choose = gate.steps.find((step) => step.id === 'revision')
  assert.equal(choose.env.SHA, '${{ github.workflow_sha }}')
  assert.equal(gate.outputs.sha, '${{ steps.revision.outputs.sha }}')
  assert.ok(needsOf(build).includes('gate'))
  assert.equal(build.if, "needs.gate.outputs.sha != ''")
  assert.ok(needsOf(deploy).includes('build'))
  for (const job of [build, deploy]) {
    for (const step of stepsOf(job).filter((step) => step.uses?.startsWith('actions/checkout@'))) {
      assert.ok(needsOf(job).includes('gate'))
      assert.equal(step.with.ref, '${{ needs.gate.outputs.sha }}')
    }
  }
}

export function checkReleaseIsolation(workflow) {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  for (const job of Object.values(workflow.jobs)) {
    assert.ok(!job['continue-on-error'], 'release jobs must propagate failures')
    for (const step of stepsOf(job)) {
      assert.ok(!step['continue-on-error'], 'release steps must propagate failures')
    }
  }
  for (const id of ['build', 'notarize', 'sign']) {
    assert.equal(workflow.jobs[id].permissions, undefined)
    assert.ok(!hasToken(workflow.jobs[id]), `${id}: no explicit job token`)
  }
  assert.equal(workflow.jobs.build.environment, undefined)
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: 'write' })
  assert.deepEqual(workflow.jobs.gate.permissions, { actions: 'read' })
  assert.equal(workflow.jobs.build.needs, 'gate')
  for (const id of ['gate', 'build']) {
    assert.equal(workflow.jobs[id].if, undefined)
  }
  assert.ok(!hasSecrets(workflow.jobs.gate))
}

export function checkCiPlatforms(workflow) {
  for (const id of ['verify', 'rust']) {
    assert.equal(workflow.jobs[id]['runs-on'], '${{ matrix.os }}')
    assert.equal(workflow.jobs[id].strategy['fail-fast'], false)
  }
  assert.deepEqual(workflow.jobs.verify.strategy.matrix.os, ['ubuntu-latest', 'windows-latest'])
  assert.deepEqual(workflow.jobs.rust.strategy.matrix.os, [
    'ubuntu-latest',
    'macos-latest',
    'windows-latest'
  ])
}
