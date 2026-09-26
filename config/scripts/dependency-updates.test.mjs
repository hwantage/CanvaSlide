import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { jobsOf, stepsOf, workflowOf } from './workflow-structure.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: read(`.github/workflows/${name}`) }))
const packageJson = JSON.parse(read('package.json'))
const cargoToml = read('src-tauri/Cargo.toml')
const renovate = JSON.parse(read('.github/renovate.json'))

const allJobs = workflows.flatMap(({ name, text }) =>
  Object.entries(jobsOf(text)).map(([id, job]) => ({ label: `${name} ${id}`, job }))
)
const versionParts = (version) => version.split('.').map(Number)
function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)]
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      return (x[i] ?? 0) - (y[i] ?? 0)
    }
  }
  return 0
}

test('every workflow installs the Node.js version pinned in .node-version', () => {
  let setups = 0
  for (const { label, job } of allJobs) {
    const steps = stepsOf(job)
    const checkout = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'))
    steps.forEach((step, index) => {
      if (!step.uses?.startsWith('actions/setup-node@')) {
        return
      }
      setups++
      assert.equal(step.with['node-version-file'], '.node-version', label)
      assert.equal(step.with['node-version'], undefined, label)
      // Why: setup-node reads the file from the working copy.
      assert.ok(checkout !== -1 && checkout < index, `${label}: checkout before setup-node`)
    })
  }
  assert.ok(setups > 0)
})

test('.node-version is an exact release that engines and @types/node agree with', () => {
  const pinned = read('.node-version')
  assert.match(pinned, /^\d+\.\d+\.\d+\n$/)
  const minimum = /^>=(\d+\.\d+\.\d+)$/.exec(packageJson.engines.node)[1]
  assert.ok(compareVersions(pinned.trim(), minimum) >= 0, `${pinned.trim()} < ${minimum}`)
  // Why: Renovate leaves @types/node majors to the change that raises the Node.js major.
  const typesMajor = /^\^(\d+)\./.exec(packageJson.devDependencies['@types/node'])[1]
  assert.equal(typesMajor, pinned.split('.')[0])
})

test('every job that builds Rust first installs the toolchain rust-toolchain.toml pins', () => {
  const buildsRust = /Swatinem\/rust-cache@|tauri-apps\/tauri-action@|tauri build|\bcargo /
  let builders = 0
  for (const { label, job } of allJobs) {
    assert.doesNotMatch(JSON.stringify(job), /dtolnay\/rust-toolchain|"toolchain":/, label)
    // Why: this job builds with the declared rust-version on purpose; its own test covers it.
    if (label === 'rust-dependencies.yml rust-version') {
      continue
    }
    const steps = stepsOf(job)
    const firstBuild = steps.findIndex((step) => buildsRust.test(step.uses ?? step.run ?? ''))
    if (firstBuild === -1) {
      continue
    }
    builders++
    assert.doesNotMatch(
      JSON.stringify(job),
      /RUSTUP_TOOLCHAIN|rustup (default|override)|cargo \+/,
      label
    )
    // Without a toolchain name, rustup installs the one rust-toolchain.toml names.
    const install = steps.findIndex((step) =>
      step.run?.split('\n').includes('rustup toolchain install --no-self-update')
    )
    assert.ok(install !== -1 && install < firstBuild, `${label}: rustup before the build`)
  }
  assert.ok(builders >= 3, `${builders} Rust jobs`)
})

// The Rust targets a `tauri build` argument list compiles for.
function buildTargets(args) {
  const target = /--target (\S+)/.exec(args)?.[1]
  if (target === 'universal-apple-darwin') {
    return ['aarch64-apple-darwin', 'x86_64-apple-darwin']
  }
  return target ? [target] : []
}

test('each bundle and release build adds the Rust targets its --target needs', () => {
  const builds = [
    ['ci.yml', 'bundle'],
    ['release.yml', 'build']
  ]
  for (const [name, id] of builds) {
    const job = jobsOf(workflows.find((workflow) => workflow.name === name).text)[id]
    for (const entry of job.strategy.matrix.include) {
      assert.deepEqual(
        (entry.targets ?? '').split(/\s+/).filter(Boolean),
        buildTargets(entry.args ?? ''),
        name
      )
    }
    const install = stepsOf(job).find((step) => step.run?.includes('rustup toolchain install'))
    assert.equal(install.env.TARGETS, '${{ matrix.targets }}', name)
    // Why: rustup takes targets as separate arguments, so the list must stay unquoted.
    assert.match(install.run, /rustup target add \$TARGETS/, name)
  }
})

test('rust-toolchain.toml pins an exact release no older than rust-version', () => {
  const toolchain = read('rust-toolchain.toml')
  const channel = /^channel = "(\d+\.\d+\.\d+)"$/m.exec(toolchain)?.[1]
  assert.ok(channel, 'channel is an exact x.y.z version')
  // Why: CI runs `cargo fmt` and `cargo clippy` with this toolchain.
  assert.match(toolchain, /^components = \[.*"clippy".*\]$/m)
  assert.match(toolchain, /^components = \[.*"rustfmt".*\]$/m)
  const rustVersion = /^rust-version = "(\d+\.\d+(?:\.\d+)?)"$/m.exec(cargoToml)[1]
  assert.ok(compareVersions(channel, rustVersion) >= 0, `${channel} < ${rustVersion}`)
})

const shellSkip = process.platform === 'win32' && 'runs the workflow script with POSIX fakes'

test(
  'the rust-version job builds with the version Cargo.toml declares',
  { skip: shellSkip },
  () => {
    const { 'rust-version': job } = jobsOf(
      workflows.find(({ name }) => name === 'rust-dependencies.yml').text
    )
    const steps = stepsOf(job)
    const install = steps.find(
      (step) => step.name === 'Install the Rust version Cargo.toml declares'
    )
    assert.ok(
      steps.some(
        (step) =>
          step.run === 'cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets'
      )
    )
    const script = install.run
    const bin = mkdtempSync(join(tmpdir(), 'rust-version-'))
    try {
      const calls = join(bin, 'calls')
      const githubEnv = join(bin, 'github-env')
      writeFileSync(join(bin, 'rustup'), `#!/bin/sh\necho "$@" >> "${calls}"\n`)
      chmodSync(join(bin, 'rustup'), 0o755)
      const result = spawnSync('bash', ['-e', '-c', script], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_ENV: githubEnv }
      })
      assert.equal(result.status, 0, result.stderr)
      const declared = /^rust-version = "(.+)"$/m.exec(cargoToml)[1]
      assert.equal(
        readFileSync(calls, 'utf8'),
        `toolchain install ${declared} --profile minimal --no-self-update\n`
      )
      assert.equal(readFileSync(githubEnv, 'utf8'), `RUSTUP_TOOLCHAIN=${declared}\n`)
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  }
)

test('the weekly audit checks the app crate for advisories', () => {
  const audit = workflowOf(workflows.find(({ name }) => name === 'rust-dependencies.yml').text)
  assert.ok(audit.on.schedule.length > 0)
  const step = audit.jobs.advisories.steps.find((step) => step.uses?.includes('cargo-deny-action@'))
  assert.equal(step.with['manifest-path'], 'src-tauri/Cargo.toml')
  assert.equal(step.with['command-arguments'], 'advisories')
})

// These assert maintainer policy only; Renovate's own pinned validator checks the schema/presets.
test('Tauri stays manual after all automerge rules', () => {
  const tauri = renovate.packageRules.at(-1)
  assert.equal(tauri.groupName, 'Tauri')
  assert.equal(tauri.automerge, false)
  assert.deepEqual(tauri.matchPackageNames, [
    '@tauri-apps/**',
    'tauri',
    'tauri-build',
    'tauri-plugin-*'
  ])
})

test('Renovate groups non-major updates before the pre-1.0 and Tauri exceptions', () => {
  const rules = renovate.packageRules
  const grouped = rules.filter((rule) => rule.groupName === 'non-major dependencies')
  assert.equal(grouped.length, 1)
  const [group] = grouped
  assert.deepEqual(
    [...group.matchUpdateTypes].sort((a, b) => a.localeCompare(b)),
    ['digest', 'minor', 'patch', 'pin', 'pinDigest']
  )
  // Extra matchers would silently leave a manager, pre-1.0 package or Playwright outside the group.
  assert.deepEqual(
    Object.keys(group).filter((key) => key.startsWith('match')),
    ['matchUpdateTypes']
  )
  assert.equal(group.groupSlug, 'non-major-dependencies')
  assert.equal(renovate.separateMinorPatch, false)
  assert.equal(group.automerge, true)
  const groupIndex = rules.indexOf(group)
  const preOne = rules.find((rule) => rule.matchCurrentVersion === '<1.0.0')
  assert.ok(rules.indexOf(preOne) > groupIndex)
  assert.deepEqual(preOne.matchUpdateTypes, ['minor'])
  assert.equal(preOne.groupName, null)
  assert.equal(preOne.groupSlug, null)
  assert.equal(preOne.automerge, true)
  const tauri = rules.find((rule) => rule.groupName === 'Tauri')
  assert.ok(rules.indexOf(tauri) > rules.indexOf(preOne))
  for (const rule of rules.filter((rule) => rule.groupName && rule !== group && rule !== tauri)) {
    assert.deepEqual(rule.matchUpdateTypes, ['major'], rule.groupName)
  }
})

test('Renovate automerges eligible non-majors through PRs but keeps lock maintenance manual', () => {
  assert.equal(renovate.automerge, false, 'major and other update types stay manual by default')
  assert.equal(renovate.automergeType, 'pr')
  assert.equal(renovate.platformAutomerge, true)
  assert.equal(renovate.automergeStrategy, 'squash')
  assert.equal(renovate.separateMajorMinor, true)
  assert.equal(renovate.lockFileMaintenance.enabled, true)
  assert.equal(renovate.lockFileMaintenance.automerge, false)
  for (const rule of renovate.packageRules.filter((rule) => rule.automerge)) {
    assert.ok(rule.groupName === 'non-major dependencies' || rule.matchCurrentVersion === '<1.0.0')
    assert.ok(!rule.matchUpdateTypes.includes('major'))
  }
})

test('Renovate retains weekly scheduling, release-age safeguards and toolchain approval', () => {
  assert.equal(renovate.timezone, 'Asia/Seoul')
  for (const preset of [
    'config:recommended',
    'schedule:weekly',
    ':maintainLockFilesWeekly',
    'helpers:pinGitHubActionDigests',
    'security:minimumReleaseAgeNpm',
    'security:minimumReleaseAgeCrate'
  ]) {
    assert.ok(renovate.extends.includes(preset), preset)
  }
  const node = renovate.packageRules.find((rule) => rule.matchManagers?.includes('nodenv'))
  const pnpm = renovate.packageRules.find((rule) => rule.matchDepTypes?.includes('packageManager'))
  for (const rule of [node, pnpm]) {
    assert.deepEqual(rule.matchUpdateTypes, ['major'])
    assert.equal(rule.dependencyDashboardApproval, true)
  }
  const types = renovate.packageRules.find((rule) =>
    rule.matchPackageNames?.includes('@types/node')
  )
  assert.deepEqual(types.matchUpdateTypes, ['major'])
  assert.equal(types.enabled, false)
})
