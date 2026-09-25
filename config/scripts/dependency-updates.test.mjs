import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: read(`.github/workflows/${name}`) }))
const packageJson = JSON.parse(read('package.json'))
const cargoToml = read('src-tauri/Cargo.toml')
const renovate = JSON.parse(read('.github/renovate.json'))

// Each job's text, keyed by job id, from a workflow whose jobs sit at two-space indent.
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

const allJobs = workflows.flatMap(({ name, text }) =>
  Object.entries(jobsOf(text)).map(([id, job]) => ({ label: `${name} ${id}`, job }))
)
const stepsOf = (job) => job.split(/\n(?= {6}- )/).slice(1)
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
    const checkout = steps.findIndex((step) => step.includes('actions/checkout@'))
    steps.forEach((step, index) => {
      if (!step.includes('actions/setup-node@')) {
        return
      }
      setups++
      assert.match(`${step}\n`, /\n\s+node-version-file: \.node-version\n/, label)
      assert.doesNotMatch(step, /\n\s+node-version:/, label)
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
  const buildsRust =
    /Swatinem\/rust-cache@|tauri-apps\/tauri-action@|tauri build|\n\s+(- run: )?cargo /
  let builders = 0
  for (const { label, job } of allJobs) {
    assert.doesNotMatch(job, /dtolnay\/rust-toolchain|\n\s+toolchain:/, label)
    // Why: this job builds with the declared rust-version on purpose; its own test covers it.
    if (label === 'rust-dependencies.yml rust-version') {
      continue
    }
    const steps = stepsOf(job)
    const firstBuild = steps.findIndex((step) => buildsRust.test(`\n${step}`))
    if (firstBuild === -1) {
      continue
    }
    builders++
    assert.doesNotMatch(job, /RUSTUP_TOOLCHAIN|rustup (default|override)|cargo \+/, label)
    // Without a toolchain name, rustup installs the one rust-toolchain.toml names.
    const install = steps.findIndex((step) =>
      /\n\s+(- run: )?rustup toolchain install --no-self-update\n/.test(`\n${step}\n`)
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
    const matrix = job.split('\n        include:')[1].split('\n    runs-on:')[0]
    const entries = matrix.split(/\n {10}- /).slice(1)
    assert.equal(entries.length, 2, name)
    for (const entry of entries) {
      const field = (key) =>
        new RegExp(`(?:^|\\n)\\s*${key}: (.*)`).exec(entry)?.[1].replace(/^''$/, '') ?? ''
      assert.deepEqual(
        field('targets').split(/\s+/).filter(Boolean),
        buildTargets(field('args')),
        entry
      )
    }
    const install = stepsOf(job).find((step) => step.includes('rustup toolchain install'))
    assert.match(install, /\n\s+TARGETS: \$\{\{ matrix\.targets \}\}\n/, name)
    // Why: rustup takes targets as separate arguments, so the list must stay unquoted.
    assert.match(install, /\n\s+rustup target add \$TARGETS\n/, name)
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
    const install = steps.find((step) => step.includes('name: Install the Rust version'))
    const check =
      '      - run: cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets'
    assert.ok(steps.some((step) => step.trimEnd() === check))
    const body = install.slice(install.indexOf('run: |\n') + 'run: |\n'.length)
    const script = body
      .split('\n')
      .map((line) => line.slice(10))
      .join('\n')
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
  const audit = workflows.find(({ name }) => name === 'rust-dependencies.yml').text
  assert.match(audit, /\n {2}schedule:\n {4}- cron: '[^']+'\n/)
  for (const path of [
    'src-tauri/**/*.rs',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
    'src-tauri/deny.toml'
  ]) {
    assert.ok(audit.includes(`\n      - ${path}\n`), path)
  }
  const [step] = stepsOf(jobsOf(audit).advisories).filter((s) => s.includes('cargo-deny-action@'))
  assert.match(step, /\n\s+manifest-path: src-tauri\/Cargo\.toml\n/)
  assert.match(step, /\n\s+command-arguments: advisories\n?/)
})

// Renovate's glob subset used in the config: `**` crosses `/`, `*` does not.
const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('**', '\u0000')
      .replaceAll('*', '[^/]*')
      .replaceAll('\u0000', '.*')}$`
  )

test('Renovate updates every Tauri npm package and Rust crate in one group', () => {
  const rules = renovate.packageRules
  const tauri = rules.findIndex((rule) => rule.groupName === 'Tauri')
  assert.ok(tauri !== -1)
  const patterns = rules[tauri].matchPackageNames.map(globToRegExp)
  const npm = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).filter(
    (name) => name.startsWith('@tauri-apps/')
  )
  const crates = [...cargoToml.matchAll(/^(tauri[\w-]*)\s*=/gm)].map(([, name]) => name)
  assert.ok(npm.includes('@tauri-apps/api') && npm.includes('@tauri-apps/cli'))
  assert.ok(crates.includes('tauri') && crates.includes('tauri-build'))
  for (const name of [...npm, ...crates]) {
    assert.ok(
      patterns.some((pattern) => pattern.test(name)),
      name
    )
  }
  // Why: a later rule's groupName wins, and the dev tooling and Rust crate groups match these too.
  for (const group of ['dev tooling', 'Rust crates']) {
    assert.ok(rules.findIndex((rule) => rule.groupName === group) < tauri, group)
  }
  for (const rule of rules.slice(tauri + 1).filter((rule) => rule.groupName)) {
    assert.ok(
      rule.matchManagers?.length && !rule.matchManagers.some((m) => ['npm', 'cargo'].includes(m)),
      `${rule.groupName} could take Tauri packages out of their group`
    )
  }
})
