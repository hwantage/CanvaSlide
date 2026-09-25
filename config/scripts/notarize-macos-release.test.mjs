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
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./notarize-macos-release.sh', import.meta.url))
const credentials = {
  APPLE_CERTIFICATE: Buffer.from('p12 bytes').toString('base64'),
  APPLE_CERTIFICATE_PASSWORD: 'certificate password',
  APPLE_SIGNING_IDENTITY: 'Developer ID Application: Test (TEAM123)',
  APPLE_ID: 'maintainer@example.test',
  APPLE_PASSWORD: 'app-specific password',
  APPLE_TEAM_ID: 'TEAM123'
}
// Why: the search list is restored exactly, including paths with spaces.
const originalKeychains = ['/home/test/login.keychain-db', '/home/test/Work Certs.keychain-db']

// Stand-ins for Apple's tools: a disk image is a tar of its volume, attaching unpacks it into the
// mount point, signing and stapling leave files in the bundle, and every call is logged in order.
// `tar` is logged with its COPYFILE_DISABLE setting and then run for real.
const fakeTool = `
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const [tool, ...args] = [path.basename(process.argv[1]), ...process.argv.slice(2)]
const state = path.join(__dirname, 'state')
const logged = tool === 'tar' ? [tool, 'COPYFILE_DISABLE=' + process.env.COPYFILE_DISABLE, ...args] : [tool, ...args]
fs.appendFileSync(path.join(state, 'calls'), JSON.stringify(logged) + '\\n')
const realTar = process.env.FAKE_REAL_TAR
const after = (flag) => args[args.indexOf(flag) + 1]
const mounts = path.join(state, 'mounts.json')
const readMounts = () => (fs.existsSync(mounts) ? JSON.parse(fs.readFileSync(mounts, 'utf8')) : {})
if (tool === 'security') {
  if (args[0] === 'list-keychains' && !args.includes('-s')) {
    process.stdout.write(${JSON.stringify(originalKeychains.map((path) => `    "${path}"\n`).join(''))})
  } else if (args[0] === 'import') {
    fs.copyFileSync(args[1], path.join(state, 'imported-certificate'))
  }
} else if (tool === 'hdiutil') {
  if (args[0] === 'convert') {
    fs.copyFileSync(args[1], after('-o'))
  } else if (args[0] === 'attach') {
    execFileSync(realTar, ['-xf', args[1], '-C', after('-mountpoint')])
    fs.mkdirSync(path.join(after('-mountpoint'), '.fseventsd'))
    fs.writeFileSync(mounts, JSON.stringify({ ...readMounts(), [after('-mountpoint')]: args[1] }))
  } else if (args[0] === 'detach') {
    const image = readMounts()[args[1]]
    execFileSync(realTar, ['-cf', image, '-C', args[1], '.'])
    for (const entry of fs.readdirSync(args[1])) {
      fs.rmSync(path.join(args[1], entry), { recursive: true })
    }
  }
} else if (tool === 'codesign' && !args.includes('--verify')) {
  const target = args.at(-1)
  if (fs.statSync(target).isDirectory()) {
    fs.mkdirSync(path.join(target, 'Contents/_CodeSignature'), { recursive: true })
    fs.writeFileSync(path.join(target, 'Contents/_CodeSignature/CodeResources'), 'signed')
  }
} else if (tool === 'ditto') {
  fs.writeFileSync(args.at(-1), 'zip')
} else if (tool === 'xcrun' && args[0] === 'notarytool' && args[1] === 'submit') {
  const status = args[2].endsWith('.dmg') ? process.env.FAKE_IMAGE_STATUS : process.env.FAKE_APP_STATUS
  process.stdout.write(JSON.stringify({ id: 'submission-1', status }))
} else if (tool === 'xcrun' && args[0] === 'stapler') {
  const target = args.at(-1)
  if (fs.statSync(target).isDirectory()) {
    fs.writeFileSync(path.join(target, 'Contents/CodeResources'), 'ticket')
  }
} else if (tool === 'plutil') {
  process.stdout.write(String(JSON.parse(fs.readFileSync(0, 'utf8'))[args[1]]))
} else if (tool === 'uuidgen') {
  process.stdout.write('keychain-password\\n')
} else if (tool === 'tar') {
  execFileSync(realTar, args, { stdio: 'inherit' })
}
`
const tools = [
  'security',
  'hdiutil',
  'codesign',
  'ditto',
  'xcrun',
  'spctl',
  'plutil',
  'uuidgen',
  'tar'
]
const realTar = spawnSync('sh', ['-c', 'command -v tar'], { encoding: 'utf8' }).stdout.trim()

// A release directory as the macOS build job leaves it, with the image's hidden layout files,
// optionally with a second disk image or a second app in the image.
function writeRelease(directory, root, { extraImage = false, extraApp = false }) {
  const volume = join(root, 'volume-source')
  for (const app of extraApp ? ['CanvaSlide.app', 'Other.app'] : ['CanvaSlide.app']) {
    mkdirSync(join(volume, app, 'Contents/MacOS'), { recursive: true })
    writeFileSync(join(volume, app, 'Contents/MacOS/canvaslide'), 'binary')
  }
  writeFileSync(join(volume, '.DS_Store'), 'layout')
  writeFileSync(join(volume, '.VolumeIcon.icns'), 'icon')
  symlinkSync('/Applications', join(volume, 'Applications'))
  mkdirSync(directory)
  spawnSync('tar', ['-cf', join(directory, 'CanvaSlide_1.2.3_universal.dmg'), '-C', volume, '.'])
  writeFileSync(join(directory, 'CanvaSlide_universal.app.tar.gz'), 'unsigned archive')
  if (extraImage) {
    writeFileSync(join(directory, 'CanvaSlide_1.2.2_universal.dmg'), 'older image')
  }
}

function runNotarize(
  env,
  { appStatus = 'Accepted', imageStatus = 'Accepted', extraImage, extraApp } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'notarize-macos-'))
  const bin = join(root, 'bin')
  const directory = join(root, 'release')
  try {
    mkdirSync(join(bin, 'state'), { recursive: true })
    writeFileSync(join(bin, 'state/calls'), '')
    for (const tool of tools) {
      writeFileSync(join(bin, tool), `#!${process.execPath}\n${fakeTool}`)
      chmodSync(join(bin, tool), 0o755)
    }
    writeRelease(directory, root, { extraImage, extraApp })
    const before = listRelease(directory)
    const output = join(root, 'github-output')
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('APPLE_'))
    )
    // Why: run inside the temporary root, so a stray file the script writes shows up as a leftover.
    const result = spawnSync('bash', [script, directory], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...inherited,
        ...env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        FAKE_APP_STATUS: appStatus,
        FAKE_IMAGE_STATUS: imageStatus,
        FAKE_REAL_TAR: realTar,
        TMPDIR: root
      },
      timeout: 30_000
    })
    const calls = readFileSync(join(bin, 'state/calls'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const imported = join(bin, 'state/imported-certificate')
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls,
      before,
      after: listRelease(directory),
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
      imported: existsSync(imported) ? readFileSync(imported, 'utf8') : null,
      // Why: the script's work directory holds the decoded certificate and the keychain.
      leftovers: readdirSync(root).filter(
        (name) => !['bin', 'release', 'volume-source', 'github-output'].includes(name)
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// Each release file's entry names when it is a tar, or its text when it is not.
function listRelease(directory) {
  const files = {}
  for (const name of ['CanvaSlide_1.2.3_universal.dmg', 'CanvaSlide_universal.app.tar.gz']) {
    const path = join(directory, name)
    const listing = spawnSync('tar', ['-tf', path], { encoding: 'utf8' })
    files[name] =
      listing.status === 0
        ? listing.stdout
            .split('\n')
            .map((entry) => entry.replace(/^\.\//, ''))
            .filter(Boolean)
            .toSorted()
        : readFileSync(path, 'utf8')
  }
  return files
}

const skip = process.platform === 'win32' && 'runs the signing script with POSIX executables'

test('without Apple credentials the build is released unsigned', { skip }, () => {
  const run = runNotarize({})
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^::warning::No Apple credentials/m)
  assert.equal(run.output, 'notarized=false\n')
  assert.deepEqual(run.after, run.before)
  assert.deepEqual(run.calls, [])
})

test('a partial set of Apple credentials fails before signing anything', { skip }, () => {
  for (const name of Object.keys(credentials)) {
    const run = runNotarize({ ...credentials, [name]: '' })
    assert.notEqual(run.status, 0, name)
    assert.equal(run.stderr.trim(), `Missing Apple credentials: ${name}`)
    assert.equal(run.output, '')
    assert.deepEqual(run.after, run.before)
    assert.deepEqual(run.calls, [])
  }
})

// The logged calls with the script's temporary paths cut down to their names under its work
// directory, leaving out the tools that only read values.
function callsOf(run) {
  const work =
    /^.*\/(?=(volume|release|writable\.dmg|signed\.dmg|app\.zip|app\.tar\.gz|signing\.keychain-db|certificate\.p12)\b)/
  return run.calls
    .filter(([tool]) => tool !== 'plutil' && tool !== 'uuidgen')
    .map((call) => call.map((arg) => arg.replace(work, '')))
}

// Fails unless the calls are exactly as many as `expected` and each begins with its entry there.
function assertCallsStartWith(calls, expected) {
  assert.deepEqual(
    calls.map((call, i) => call.slice(0, expected[i]?.length ?? 0)),
    expected.slice(0, calls.length)
  )
  assert.equal(calls.length, expected.length)
}

const identity = credentials.APPLE_SIGNING_IDENTITY
const keychain = 'signing.keychain-db'
const app = 'volume/CanvaSlide.app'
const notary = [
  '--apple-id',
  credentials.APPLE_ID,
  '--password',
  credentials.APPLE_PASSWORD,
  '--team-id',
  credentials.APPLE_TEAM_ID,
  '--wait',
  '--timeout',
  '1h'
]
const throughAppSubmission = [
  ['security', 'list-keychains', '-d', 'user'],
  ['security', 'create-keychain', '-p', 'keychain-password', keychain],
  ['security', 'set-keychain-settings', '-lut', '10800', keychain],
  ['security', 'unlock-keychain', '-p', 'keychain-password', keychain],
  [
    'security',
    'import',
    'certificate.p12',
    '-k',
    keychain,
    '-P',
    'certificate password',
    '-T',
    '/usr/bin/codesign'
  ],
  ['security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k'],
  ['security', 'list-keychains', '-d', 'user', '-s', keychain, ...originalKeychains],
  ['hdiutil', 'convert', 'release/CanvaSlide_1.2.3_universal.dmg', '-format', 'UDRW'],
  ['hdiutil', 'attach', 'writable.dmg', '-mountpoint', 'volume'],
  ['codesign', '--force', '--options', 'runtime', '--timestamp', '--keychain', keychain],
  ['codesign', '--verify', '--strict', '--deep', app],
  ['ditto', '-c', '-k', '--keepParent', app, 'app.zip'],
  ['xcrun', 'notarytool', 'submit', 'app.zip', ...notary]
]
const throughImageSubmission = [
  ...throughAppSubmission,
  ['xcrun', 'stapler', 'staple', app],
  ['spctl', '--assess', '--type', 'execute', app],
  // Why: without these the archive would carry AppleDouble entries and extended attributes.
  [
    'tar',
    'COPYFILE_DISABLE=1',
    '--no-xattrs',
    '--no-acls',
    '-czf',
    'app.tar.gz',
    '--',
    'CanvaSlide.app'
  ],
  ['hdiutil', 'detach', 'volume'],
  ['hdiutil', 'convert', 'writable.dmg', '-format', 'UDZO', '-imagekey', 'zlib-level=9'],
  ['codesign', '--force', '--timestamp', '--keychain', keychain, '--sign', identity, 'signed.dmg'],
  ['xcrun', 'notarytool', 'submit', 'signed.dmg', ...notary]
]
const cleanup = [
  ['security', 'list-keychains', '-d', 'user', '-s', ...originalKeychains],
  ['security', 'delete-keychain', keychain]
]

test('the app and disk image are signed, notarized and stapled', { skip }, () => {
  const run = runNotarize(credentials)
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.output, 'notarized=true\n')
  assert.equal(run.imported, 'p12 bytes')
  const calls = callsOf(run)
  assertCallsStartWith(calls, [
    ...throughImageSubmission,
    ['xcrun', 'stapler', 'staple', 'signed.dmg'],
    ['spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', 'signed.dmg'],
    ...cleanup
  ])
  // Why: the app is signed with the hardened runtime, which notarization requires.
  assert.deepEqual(calls[9].slice(-3), ['--sign', identity, app])
  const signedApp = [
    'CanvaSlide.app/',
    'CanvaSlide.app/Contents/',
    'CanvaSlide.app/Contents/CodeResources',
    'CanvaSlide.app/Contents/MacOS/',
    'CanvaSlide.app/Contents/MacOS/canvaslide',
    'CanvaSlide.app/Contents/_CodeSignature/',
    'CanvaSlide.app/Contents/_CodeSignature/CodeResources'
  ]
  assert.deepEqual(run.after, {
    'CanvaSlide_1.2.3_universal.dmg': [
      '.DS_Store',
      '.VolumeIcon.icns',
      'Applications',
      ...signedApp
    ].toSorted(),
    'CanvaSlide_universal.app.tar.gz': signedApp
  })
  assert.deepEqual(run.leftovers, [])
})

test('a rejected notarization of the app fails and leaves the build as it was', { skip }, () => {
  const run = runNotarize(credentials, { appStatus: 'Invalid' })
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /Notarization of app\.zip finished with Invalid/)
  assert.equal(run.output, '')
  assert.deepEqual(run.after, run.before)
  assertCallsStartWith(callsOf(run), [
    ...throughAppSubmission,
    ['xcrun', 'notarytool', 'log', 'submission-1', ...notary.slice(0, 6)],
    ['hdiutil', 'detach', 'volume', '-force'],
    ...cleanup
  ])
  assert.deepEqual(run.leftovers, [])
})

test(
  'a rejected notarization of the disk image fails and leaves the build as it was',
  { skip },
  () => {
    const run = runNotarize(credentials, { imageStatus: 'Invalid' })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /Notarization of signed\.dmg finished with Invalid/)
    assert.equal(run.output, '')
    assert.deepEqual(run.after, run.before)
    assertCallsStartWith(callsOf(run), [
      ...throughImageSubmission,
      ['xcrun', 'notarytool', 'log', 'submission-1', ...notary.slice(0, 6)],
      ...cleanup
    ])
    assert.deepEqual(run.leftovers, [])
  }
)

test('a release with two disk images or an image with two apps is not signed', { skip }, () => {
  const images = runNotarize(credentials, { extraImage: true })
  assert.notEqual(images.status, 0)
  assert.match(images.stderr, /Expected one \*\.dmg in /)
  assert.deepEqual(images.calls, [])
  const apps = runNotarize(credentials, { extraApp: true })
  assert.notEqual(apps.status, 0)
  assert.match(apps.stderr, /Expected one app in CanvaSlide_1\.2\.3_universal\.dmg/)
  assert.deepEqual(apps.after, apps.before)
  assertCallsStartWith(callsOf(apps), [
    ...throughAppSubmission.slice(0, 9),
    ['hdiutil', 'detach', 'volume', '-force'],
    ...cleanup
  ])
  assert.deepEqual(apps.leftovers, [])
})
