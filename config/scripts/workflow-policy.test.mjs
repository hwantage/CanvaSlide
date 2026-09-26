import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { stringify } from 'yaml'
import { checkedStep, checkRequiredJobs, workflowOf } from './workflow-structure.mjs'
import {
  checkCiPlatforms,
  checkDeployment,
  checkReleaseIsolation,
  checkWorkflowSecurity
} from './workflow-policy.mjs'

const directory = new URL('../../.github/workflows/', import.meta.url)
const workflows = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => [name, workflowOf(readFileSync(new URL(name, directory), 'utf8'))])
)
const ci = workflows['ci.yml']
const release = workflows['release.yml']
const trials = JSON.parse(
  readFileSync(new URL('../../.github/ci-trial-jobs.json', import.meta.url), 'utf8')
)

for (const [name, workflow] of Object.entries(workflows)) {
  test(`${name}: SHA pins, checkout credentials, secret isolation and artifact expiry`, () => {
    checkWorkflowSecurity(name, workflow)
    // YAML comments, indentation, quoting and block/list style do not change the policy.
    checkWorkflowSecurity(
      name,
      workflowOf(stringify(workflow, { indent: 4, collectionStyle: 'flow' }))
    )
  })
}

test('CI passed covers required jobs and trials cannot block their dependency chains', () => {
  checkRequiredJobs(ci, trials)
  const candidate = structuredClone(ci)
  candidate.jobs.trial = {
    'continue-on-error': true,
    'runs-on': 'ubuntu-latest',
    steps: [{ run: 'exit 1' }]
  }
  assert.throws(() => checkRequiredJobs(candidate, trials))
  checkRequiredJobs(candidate, { ...trials, trial: 'Observe runner stability; issue #233' })
  candidate.jobs.verify.needs = ['trial']
  assert.throws(() => checkRequiredJobs(candidate, { ...trials, trial: 'runner trial' }))
  assert.throws(() => checkRequiredJobs(ci, { absent: 'unknown job' }))
  assert.throws(() => checkRequiredJobs(ci, { verify: 'cannot also be required' }))
})

test(
  'CI passed executes even after failure and rejects every non-success result',
  { skip: process.platform === 'win32' },
  () => {
    assert.equal(ci.jobs.passed.if, 'always()')
    assert.equal(ci.jobs.passed.steps.length, 1)
    const [step] = ci.jobs.passed.steps
    assert.equal(step.if, undefined)
    assert.ok(!step['continue-on-error'])
    assert.equal(step.env.RESULTS, "${{ join(needs.*.result, ' ') }}")
    const run = (value) =>
      spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
        env: { ...process.env, RESULTS: value }
      }).status
    assert.equal(run('success success'), 0)
    for (const result of ['failure', 'skipped', 'cancelled', 'unknown']) {
      assert.notEqual(run(`success ${result}`), 0, result)
    }
  }
)

test('security invariants reject concrete credential and artifact regressions', () => {
  for (const mutate of [
    (w) => {
      w.jobs.publish.steps.push({ env: { GH_TOKEN: '${{ github.token }}' }, run: 'pnpm build:web' })
    },
    (w) => {
      w.jobs.sign.steps.find((s) => s.uses?.startsWith('pnpm/action-setup')).with = {
        run_install: true
      }
    },
    (w) => {
      w.jobs.build.env = { KEY: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}' }
    },
    (w) => {
      w.jobs.sign.steps.push({ run: 'pnpm build:web' })
    },
    (w) => {
      w.jobs.sign.steps.find((s) => s.run?.includes('pnpm install')).run =
        'pnpm install --frozen-lockfile'
    },
    (w) => {
      w.jobs.build.steps[0].with['persist-credentials'] = true
    },
    (w) => {
      w.jobs.build.steps[0].uses = 'actions/checkout@v4'
    },
    (w) => {
      w.jobs.build.steps.find((s) => s.uses?.includes('upload-artifact')).with['retention-days'] = 0
    }
  ]) {
    const broken = structuredClone(release)
    mutate(broken)
    assert.throws(() => checkWorkflowSecurity('release.yml', broken))
  }
})

test('build jobs keep read-only permissions and releases propagate every failure', () => {
  checkReleaseIsolation(release)
  for (const mutate of [
    (w) => {
      w.jobs.gate.steps[0]['continue-on-error'] = true
    },
    (w) => {
      w.jobs.build['continue-on-error'] = true
    }
  ]) {
    const broken = structuredClone(release)
    mutate(broken)
    assert.throws(() => checkReleaseIsolation(broken))
  }
})

test('CI keeps complete platform coverage and mandatory checks', () => {
  assert.deepEqual(ci.on, { push: { branches: ['main'] }, pull_request: null })
  checkCiPlatforms(ci)
  const wrongHost = structuredClone(ci)
  wrongHost.jobs.verify['runs-on'] = 'ubuntu-latest'
  assert.throws(() => checkCiPlatforms(wrongHost))
  for (const command of ['lint', 'format:check', 'typecheck', 'test']) {
    checkedStep(ci.jobs.verify, `pnpm ${command}`)
  }
  checkedStep(ci.jobs.website, 'pnpm test:site')
  for (const command of [
    'cargo fmt --manifest-path src-tauri/Cargo.toml --check',
    'cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings',
    'cargo test --manifest-path src-tauri/Cargo.toml'
  ]) {
    checkedStep(ci.jobs.rust, command)
  }
  for (const job of Object.values(ci.jobs)) {
    assert.ok(job['timeout-minutes'] > 0)
  }
  assert.equal(
    ci.concurrency.group,
    "ci-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}"
  )
  assert.equal(ci.concurrency['cancel-in-progress'], true)
})

for (const name of ['deploy-website.yml', 'deploy-web-editor.yml']) {
  test(`${name}: build and deploy consume the gated workflow revision`, () => {
    const workflow = workflows[name]
    checkDeployment(workflow)
    assert.equal(workflow.concurrency['cancel-in-progress'], false)
    assert.deepEqual(workflow.on.workflow_run, {
      workflows: [ci.name],
      types: ['completed'],
      branches: ['main']
    })
    const broken = structuredClone(workflow)
    broken.jobs.build.steps[0].with.ref = '${{ github.event.workflow_run.head_sha }}'
    assert.throws(() => checkDeployment(broken))
    const writableBuild = structuredClone(workflow)
    writableBuild.jobs.build.permissions = { contents: 'write' }
    assert.throws(() => checkDeployment(writableBuild))
  })
}

test('verify runs pinned external validators without hiding failures', () => {
  const steps = ci.jobs.verify.steps
  for (const command of ['bash config/scripts/check-actionlint.sh', 'pnpm validate:renovate']) {
    const step = steps.find((step) => step.run === command)
    assert.ok(step, command)
    assert.equal(step.if, "runner.os == 'Linux'")
    assert.ok(!step['continue-on-error'])
  }
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.scripts['validate:renovate'], /--package=renovate@\d+\.\d+\.\d+ /)
  assert.ok(pkg.scripts['validate:renovate'].includes('--strict --no-global .github/renovate.json'))
})
