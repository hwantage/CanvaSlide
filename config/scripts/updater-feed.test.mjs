import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildUpdaterFeed, requiredPlatforms, verifyUpdaterSignature } from './updater-feed.mjs'

const tauriCli = fileURLToPath(
  new URL('../../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)
)
const script = fileURLToPath(new URL('./updater-feed.mjs', import.meta.url))
const releaseFiles = [
  'CanvaSlide_1.2.3_universal.dmg',
  'CanvaSlide_universal.app.tar.gz',
  'CanvaSlide_1.2.3_x64-setup.exe',
  'CanvaSlide_1.2.3_x64_en-US.msi'
]
let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide updater feed '))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

// The real signer, so the verifier follows whatever format the release workflow produces.
function tauri(args, password) {
  // A maintainer's own key in the environment would conflict with --private-key-path.
  const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password }
  delete env.TAURI_SIGNING_PRIVATE_KEY
  delete env.TAURI_SIGNING_PRIVATE_KEY_PATH
  execFileSync(process.execPath, [tauriCli, 'signer', ...args], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'pipe']
  })
}

function generateKey(name, password = '') {
  tauri(['generate', '--ci', '--password', password, '--write-keys', name, '--force'], password)
  return readFileSync(join(root, `${name}.pub`), 'utf8')
}

function signedRelease(key, files = releaseFiles, password = '') {
  for (const name of files) {
    writeFileSync(join(root, name), `contents of ${name}`)
    if (!name.endsWith('.dmg')) {
      tauri(['sign', '--private-key-path', key, name], password)
    }
  }
}

function feed(publicKey) {
  return buildUpdaterFeed({
    directory: root,
    tag: 'v1.2.3',
    repository: 'owner/CanvaSlide',
    publicKeys: [publicKey],
    now: new Date('2026-01-02T03:04:05.678Z')
  })
}

const signatureOf = (name) => readFileSync(join(root, `${name}.sig`), 'utf8')
const download = (name) => `https://github.com/owner/CanvaSlide/releases/download/v1.2.3/${name}`

test('the feed lists every signed file under the platform keys installed apps look up', () => {
  const publicKey = generateKey('release.key')
  signedRelease('release.key')
  const mac = { signature: signatureOf(releaseFiles[1]), url: download(releaseFiles[1]) }
  const nsis = { signature: signatureOf(releaseFiles[2]), url: download(releaseFiles[2]) }
  const msi = { signature: signatureOf(releaseFiles[3]), url: download(releaseFiles[3]) }
  assert.deepEqual(feed(publicKey), {
    version: '1.2.3',
    pub_date: '2026-01-02T03:04:05.678Z',
    platforms: {
      'darwin-aarch64': mac,
      'darwin-x86_64': mac,
      'darwin-aarch64-app': mac,
      'darwin-x86_64-app': mac,
      'windows-x86_64-nsis': nsis,
      'windows-x86_64': msi,
      'windows-x86_64-msi': msi
    }
  })
})

test('a password-protected key signs files the feed accepts', () => {
  const publicKey = generateKey('protected.key', 'correct horse')
  signedRelease('protected.key', releaseFiles, 'correct horse')
  assert.equal(Object.keys(feed(publicKey).platforms).length, 7)
})

test('a signature from a key other than the configured one is rejected', () => {
  const configuredKey = generateKey('configured.key')
  generateKey('other.key')
  signedRelease('other.key')
  assert.throws(
    () => feed(configuredKey),
    /signed with a key other than the one installed apps trust/
  )
})

test('every updater file changed after signing is rejected', () => {
  const publicKey = generateKey('release.key')
  signedRelease('release.key')
  for (const name of releaseFiles.filter((name) => !name.endsWith('.dmg'))) {
    const original = readFileSync(join(root, name))
    writeFileSync(join(root, name), 'replaced after signing')
    assert.throws(() => feed(publicKey), new RegExp(`${name}: signature does not match the file`))
    writeFileSync(join(root, name), original)
  }
  assert.doesNotThrow(() => feed(publicKey))
})

test('a tampered trusted comment is rejected', () => {
  const publicKey = generateKey('release.key')
  signedRelease('release.key')
  const data = readFileSync(join(root, releaseFiles[1]))
  const lines = Buffer.from(signatureOf(releaseFiles[1]), 'base64').toString('utf8').split('\n')
  lines[2] = lines[2].replace('file:', 'file:x')
  const tampered = Buffer.from(lines.join('\n')).toString('base64')
  assert.doesNotThrow(() => verifyUpdaterSignature(data, signatureOf(releaseFiles[1]), [publicKey]))
  assert.throws(() => verifyUpdaterSignature(data, tampered, [publicKey]), /does not match/)
})

// Hand-built minisign files for layouts the Tauri signer does not produce.
function minisignFixture(
  data,
  { algorithm = 'ED', keyAlgorithm = 'Ed', comment = 'trusted comment: t' } = {}
) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const keyId = randomBytes(8)
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')
  const base64 = (bytes) => Buffer.from(bytes).toString('base64')
  const key = Buffer.from(
    `untrusted comment: key\n${base64(Buffer.concat([Buffer.from(keyAlgorithm), keyId, raw]))}\n`
  )
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data
  const signed = sign(null, message, privateKey)
  const trusted = Buffer.from(comment.replace(/^trusted comment: /, ''))
  const lines = [
    'untrusted comment: signature',
    base64(Buffer.concat([Buffer.from(algorithm), keyId, signed])),
    comment,
    base64(sign(null, Buffer.concat([signed, trusted]), privateKey))
  ]
  return { publicKey: base64(key), lines, encode: (text) => base64(Buffer.from(text)) }
}

test('signatures are read as strictly as the in-app updater reads them', () => {
  const data = Buffer.from('update payload')
  const check = (fixture, text, keys = [fixture.publicKey]) =>
    verifyUpdaterSignature(data, fixture.encode(text), keys)
  const prehashed = minisignFixture(data)
  assert.doesNotThrow(() => check(prehashed, `${prehashed.lines.join('\n')}\n`))
  assert.doesNotThrow(() => check(prehashed, `${prehashed.lines.join('\r\n')}\r\n`))
  const legacy = minisignFixture(data, { algorithm: 'Ed', keyAlgorithm: 'ED' })
  assert.doesNotThrow(() => check(legacy, legacy.lines.join('\n')))
  const signature = prehashed.encode(prehashed.lines.join('\n'))
  const rejected = [
    [`${signature}\n`, /not canonical base64/],
    [signature.slice(0, -1), /not canonical base64/],
    [
      prehashed.encode(
        prehashed.lines.map((line, index) => (index === 1 ? `${line} ` : line)).join('\n')
      ),
      /not canonical base64/
    ],
    [
      prehashed.encode(
        prehashed.lines
          .map((line, index) => (index === 3 ? line.replace(/=+$/, '') : line))
          .join('\n')
      ),
      /not canonical base64/
    ],
    [
      prehashed.encode(
        prehashed.lines.map((line, index) => (index === 2 ? 'comment: t' : line)).join('\n')
      ),
      /not a minisign signature/
    ],
    [prehashed.encode(prehashed.lines.slice(0, 3).join('\n')), /not a minisign signature/],
    [
      Buffer.concat([
        Buffer.from([0xff, 0x0a]),
        Buffer.from(prehashed.lines.slice(1).join('\n'))
      ]).toString('base64'),
      /not valid/
    ]
  ]
  for (const [text, error] of rejected) {
    assert.throws(() => verifyUpdaterSignature(data, text, [prehashed.publicKey]), error, text)
  }
  const unknown = minisignFixture(data, { algorithm: 'EX' })
  assert.throws(() => check(unknown, unknown.lines.join('\n')), /unknown signature algorithm EX/)
  const other = minisignFixture(data)
  assert.throws(
    () => check(prehashed, prehashed.lines.join('\n'), [other.publicKey]),
    /other than the one/
  )
  assert.doesNotThrow(() =>
    check(prehashed, prehashed.lines.join('\n'), [other.publicKey, prehashed.publicKey])
  )
})

test('each required platform must have a signed update', () => {
  const publicKey = generateKey('release.key')
  signedRelease('release.key')
  const covered = new Map([
    ['darwin-aarch64', releaseFiles[1]],
    ['darwin-x86_64', releaseFiles[1]],
    ['windows-x86_64-nsis', releaseFiles[2]],
    ['windows-x86_64-msi', releaseFiles[3]]
  ])
  assert.deepEqual([...covered.keys()], requiredPlatforms)
  for (const [platform, name] of covered) {
    const signature = signatureOf(name)
    rmSync(join(root, `${name}.sig`))
    assert.throws(() => feed(publicKey), new RegExp(`no signed update for .*${platform}`))
    writeFileSync(join(root, `${name}.sig`), signature)
  }
})

test('a signed file with no known platform, or two files for one platform, is rejected', () => {
  const publicKey = generateKey('release.key')
  signedRelease('release.key', [...releaseFiles, 'CanvaSlide_1.2.3_amd64.AppImage'])
  assert.throws(() => feed(publicKey), /no updater platform for CanvaSlide_1\.2\.3_amd64\.AppImage/)
  rmSync(join(root, 'CanvaSlide_1.2.3_amd64.AppImage.sig'))
  signedRelease('release.key', ['CanvaSlide_1.2.3_x64_ko-KR.msi'])
  assert.throws(() => feed(publicKey), /windows-x86_64 is provided by more than one file/)
})

test('the command checks signatures against the keys in the trusted tauri.conf.json files', () => {
  const trustedKey = generateKey('trusted.key')
  const otherKey = generateKey('other.key')
  signedRelease('trusted.key')
  const config = (name, pubkey) => {
    writeFileSync(join(root, name), JSON.stringify({ plugins: { updater: { pubkey } } }))
    return join(root, name)
  }
  const trusted = ['--trusted-config', config('trusted.json', trustedKey)]
  const other = ['--trusted-config', config('other.json', otherKey)]
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  const options = { tag: 'v1.2.3', repository: 'owner/CanvaSlide' }
  const flags = (skip) =>
    Object.entries(options).flatMap(([name, value]) => (name === skip ? [] : [`--${name}`, value]))
  for (const args of [
    [root, ...flags()],
    ...Object.keys(options).map((name) => [root, ...flags(name), ...trusted]),
    [...flags(), ...trusted],
    [root, root, ...flags(), ...trusted]
  ]) {
    const usage = run(args)
    assert.equal(usage.status, 1, args.join(' '))
    assert.match(usage.stderr, /usage: updater-feed\.mjs/)
  }
  const accepted = run([root, ...flags(), ...other, ...trusted])
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.equal(JSON.parse(accepted.stdout).version, '1.2.3')
  // Why: the notes are the published Release body, added by release-notes.yml, never a placeholder.
  assert.equal('notes' in JSON.parse(accepted.stdout), false)
  const rejected = run([root, ...flags(), ...other])
  assert.equal(rejected.status, 1)
  assert.equal(rejected.stdout, '')
  assert.match(rejected.stderr, /signed with a key other than the one installed apps trust/)
})
