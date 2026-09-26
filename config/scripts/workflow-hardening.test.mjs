import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
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
import { jobsOf, stepsOf } from './workflow-structure.mjs'

const workflowDirectory = new URL('../../.github/workflows/', import.meta.url)
const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(new URL(name, workflowDirectory), 'utf8') }))
const release = workflows.find(({ name }) => name === 'release.yml').text
const releaseNotes = workflows.find(({ name }) => name === 'release-notes.yml').text
const website = workflows.find(({ name }) => name === 'deploy-website.yml').text
const webEditor = workflows.find(({ name }) => name === 'deploy-web-editor.yml').text

// A step's `run: |` script, run by bash with `-e` as Actions does, with `env` added.
function runScript(step, env, cwd) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
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

function runGate(responses, step = stepsOf(jobsOf(release).gate)[0]) {
  const bin = mkdtempSync(join(tmpdir(), 'release-gate-'))
  const calls = join(bin, 'calls.json')
  const sleeps = join(bin, 'sleeps')
  const outputs = join(bin, 'outputs')
  try {
    writeFileSync(join(bin, 'responses.json'), JSON.stringify(responses))
    writeFileSync(calls, '[]')
    writeFileSync(sleeps, '')
    writeFileSync(outputs, '')
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
      GITHUB_OUTPUT: outputs,
      SHA: 'abc123'
    })
    assert.equal(result.signal, null, 'the gate script did not finish')
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: JSON.parse(readFileSync(calls, 'utf8')),
      sleeps: readFileSync(sleeps, 'utf8').split('\n').filter(Boolean),
      outputs: readFileSync(outputs, 'utf8')
    }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

const noRun = { workflow_runs: [] }
const runOf = (status, conclusion) => ({
  workflow_runs: [{ head_sha: 'abc123', status, conclusion, html_url: 'https://example.test/run' }]
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

const passedOn = (sha) => ({
  workflow_runs: [{ head_sha: sha, status: 'completed', conclusion: 'success' }]
})

for (const [name, source] of [
  ['website', website],
  ['web editor', webEditor]
]) {
  const gate = () => jobsOf(source).gate.steps[0]
  test(
    `${name} deploys only successful CI for its own workflow revision`,
    { skip: shellSkip },
    () => {
      const { status, stderr, calls, outputs } = runGate([passedOn('abc123')], gate())
      assert.equal(status, 0, stderr)
      assert.equal(outputs, 'sha=abc123\n')
      assert.equal(calls.length, 1)
      const [args] = calls
      assert.equal(args[args.indexOf('-X') + 1], 'GET')
      assert.ok(args.includes('repos/owner/repo/actions/workflows/ci.yml/runs'))
      for (const field of ['head_sha=abc123', 'branch=main', 'event=push', 'per_page=1']) {
        assert.ok(args.includes(field), field)
      }
      assert.ok(!args.includes('status=success'), 'the latest attempt must succeed, not an old one')
    }
  )

  test(
    `${name} leaves deployment unchanged for old, absent, pending or failed CI`,
    { skip: shellSkip },
    () => {
      for (const response of [
        passedOn('older-commit-without-node-version'),
        noRun,
        runOf('in_progress', null),
        runOf('completed', 'failure'),
        runOf('completed', 'cancelled')
      ]) {
        const { status, outputs } = runGate([response], gate())
        assert.equal(status, 0)
        assert.equal(outputs, '', JSON.stringify(response))
      }
    }
  )

  test(`${name} stops on GitHub API errors`, { skip: shellSkip }, () => {
    const { status, stderr, outputs } = runGate([{ error: 'HTTP 502' }], gate())
    assert.notEqual(status, 0)
    assert.match(stderr, /gh: HTTP 502/)
    assert.equal(outputs, '')
  })
}

const pagesConfig = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
// A `key = "value"` of wrangler.toml's section `table` ('' for the top level), or undefined.
function pagesSetting(table, key) {
  const text = `\n${pagesConfig}`
  const header = table ? `\n[${table}]\n` : '\n'
  const start = text.indexOf(header)
  const body = text.slice(start + header.length).split(/\n\[/)[0]
  return start === -1 ? undefined : new RegExp(`^${key} = "([^"]*)"$`, 'm').exec(body)?.[1]
}

function runPublish(env, wranglerStatus = 0) {
  const step = stepsOf(jobsOf(webEditor).deploy).find((step) =>
    JSON.stringify(step.env ?? {}).includes('secrets.')
  )
  const temp = mkdtempSync(join(tmpdir(), 'web-editor-publish-'))
  const recorded = join(temp, 'arguments')
  try {
    mkdirSync(join(temp, 'node_modules', '.bin'), { recursive: true })
    const wrangler = join(temp, 'node_modules', '.bin', 'wrangler')
    writeFileSync(
      wrangler,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(recorded)}\nexit ${wranglerStatus}\n`
    )
    chmodSync(wrangler, 0o755)
    const result = runScript(step, { SHA: 'def456', ...env }, temp)
    const args = existsSync(recorded) ? readFileSync(recorded, 'utf8').trimEnd().split('\n') : null
    return { status: result.status, stdout: result.stdout, args }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

const cloudflare = { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' }

test(
  'the web editor publishes the gated commit to production with Wrangler',
  { skip: process.platform === 'win32' && 'runs the publish step with POSIX executables' },
  () => {
    const { status, args } = runPublish(cloudflare)
    assert.equal(status, 0)
    // Why: the Pages project's production branch is main; any other branch makes a preview.
    assert.deepEqual(args, ['pages', 'deploy', '--branch', 'main', '--commit-hash', 'def456'])
    assert.notEqual(runPublish(cloudflare, 1).status, 0)
  }
)

test(
  'the web editor skips publishing with a warning until Cloudflare credentials exist',
  { skip: process.platform === 'win32' && 'runs the publish step with POSIX executables' },
  () => {
    const skipped = runPublish({ CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' })
    assert.equal(skipped.status, 0)
    assert.equal(skipped.args, null)
    assert.match(skipped.stdout, /^::warning title=Web editor not published::/m)
    // Why: one credential without the other is a broken setup, not one still to be done.
    for (const missing of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
      const { status, stdout, args } = runPublish({ ...cloudflare, [missing]: '' })
      assert.notEqual(status, 0, missing)
      assert.equal(args, null, missing)
      assert.match(stdout, new RegExp(`^::error title=Web editor not published::.*${missing}`, 'm'))
    }
  }
)

test('wrangler.toml binds production KV, keeps it from previews, and is what dev:cloud reads', () => {
  const shareApi = readFileSync(
    new URL('../../src/cloud-share/share-api.ts', import.meta.url),
    'utf8'
  )
  const binding = /\n {2}(\w+)\?: \{\n {4}get:/.exec(shareApi)[1]
  const namespaces = (table) =>
    [...pagesConfig.matchAll(new RegExp(`\\n\\[\\[${table}\\]\\]\\n((?:\\w+ = .*\\n)+)`, 'g'))].map(
      ([, body]) =>
        Object.fromEntries(
          body
            .trimEnd()
            .split('\n')
            .map((line) => line.split(' = '))
        )
    )
  const [local, ...otherLocal] = namespaces('kv_namespaces')
  const [production, ...otherProduction] = namespaces('env\\.production\\.kv_namespaces')
  assert.deepEqual([otherLocal, otherProduction], [[], []])
  assert.equal(local.binding, `"${binding}"`)
  assert.equal(production.binding, `"${binding}"`)
  assert.match(production.id, /^"[0-9a-f]{32}"$/)
  assert.notEqual(local.id, production.id)
  // Why: without its own section a preview would inherit the local namespace.
  assert.match(pagesConfig, /\n\[env\.preview\]\nkv_namespaces = \[\]\n/)
  assert.doesNotMatch(pagesConfig, /\[\[env\.preview\.kv_namespaces\]\]/)
  // Why: a non-inheritable key set in an environment replaces the top level's, so each lists vars.
  const pnpmMajor = /^pnpm@(\d+)\./.exec(
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).packageManager
  )[1]
  const nodeVersion = readFileSync(new URL('../../.node-version', import.meta.url), 'utf8')
  const [nodeMajor] = nodeVersion.split('.')
  for (const env of ['production', 'preview']) {
    assert.equal(pagesSetting(`env.${env}.vars`, 'NODE_VERSION'), nodeMajor, env)
    assert.equal(pagesSetting(`env.${env}.vars`, 'PNPM_VERSION'), pnpmMajor, env)
  }
  assert.match(pagesSetting('', 'compatibility_date'), /^\d{4}-\d{2}-\d{2}$/)
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const devCloud = JSON.parse(packageJson).scripts['dev:cloud']
  assert.match(devCloud, /\bwrangler pages dev\b/)
  assert.doesNotMatch(devCloud, /--(kv|compatibility-date|d1|r2|binding)\b|\bpages dev \S*dist\b/)
})

test('the release draft starts without notes and passes the feed script only flags it accepts', () => {
  const upload = stepsOf(jobsOf(release).publish).find((step) => /gh release create/.test(step.run))
  // Why: the published body becomes the update notice's notes, so no placeholder may start it.
  assert.match(upload.run, /\n\s+--title "CanvaSlide \$TAG" --notes ''\n/)
  const feedStep = stepsOf(jobsOf(release).publish).find((step) =>
    step.run?.includes('updater-feed.mjs')
  )
  // The step's only other command is `git show`, so every flag in it is one for the feed script.
  const flags = [...new Set(feedStep.run.match(/(?<=[\s(])--[\w-]+/g))]
  assert.deepEqual(
    flags.toSorted((a, b) => a.localeCompare(b)),
    ['--notarized', '--repository', '--tag', '--trusted-config']
  )
  const script = fileURLToPath(new URL('./updater-feed.mjs', import.meta.url))
  const args = ['missing-directory', ...flags.flatMap((flag) => [flag, 'x'])]
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stderr, /usage|Unknown option/)
})

// The feed step's arguments for the feed script, with `git` and `node` standing in as recorders.
function feedArguments(macosNotarized) {
  const step = stepsOf(jobsOf(release).publish).find((step) =>
    step.run?.includes('updater-feed.mjs')
  )
  const temp = mkdtempSync(join(tmpdir(), 'release-feed-'))
  const bin = join(temp, 'bin')
  const recorded = join(temp, 'arguments')
  try {
    mkdirSync(bin)
    mkdirSync(join(temp, 'release-assets'))
    writeFileSync(join(temp, 'latest-release'), 'v1.2.2\n')
    writeFileSync(join(bin, 'git'), '#!/bin/sh\necho {}\n')
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(recorded)}\n`
    )
    chmodSync(join(bin, 'git'), 0o755)
    chmodSync(join(bin, 'node'), 0o755)
    const result = runScript(
      step,
      {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        TAG: 'v1.2.3',
        REPOSITORY: 'owner/repo',
        KEY_CHANGE_TAG: '',
        MACOS_NOTARIZED: macosNotarized
      },
      temp
    )
    assert.equal(result.status, 0, result.stderr)
    return readFileSync(recorded, 'utf8').trimEnd().split('\n')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

test(
  'the feed marks the macOS update notarized only when the notarize job signed it',
  { skip: process.platform === 'win32' && 'runs the feed step with POSIX executables' },
  () => {
    const { publish } = jobsOf(release)
    const archive = 'CanvaSlide_universal.app.tar.gz'
    assert.equal(
      publish.steps.find((step) => step.env?.MACOS_NOTARIZED).env.MACOS_NOTARIZED,
      '${{ needs.notarize.outputs.notarized }}'
    )
    const notarized = feedArguments('true')
    assert.equal(notarized[notarized.indexOf('--notarized') + 1], archive)
    for (const value of ['false', '']) {
      assert.ok(!feedArguments(value).includes('--notarized'), value)
    }
  }
)

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
      step.run?.includes('\n')
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
    for (const { failOn, afterFailure } of [
      { failOn: 'upload', afterFailure: placeholder },
      {
        failOn: 'DELETE',
        afterFailure: {
          ...placeholder,
          names: ['CanvaSlide.dmg', 'latest.json', 'latest.next.json']
        }
      },
      // Why: only a failed rename right after the delete leaves no latest.json, until the next run.
      {
        failOn: 'PATCH',
        afterFailure: { names: ['CanvaSlide.dmg', 'latest.next.json'], notes: undefined }
      }
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
