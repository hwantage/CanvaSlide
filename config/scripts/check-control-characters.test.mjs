import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  checkControlCharacters,
  findControlCharacters,
  textFiles
} from './check-control-characters.mjs'

const script = fileURLToPath(new URL('./check-control-characters.mjs', import.meta.url))
let root

// Hooks and worktree rebases export GIT_DIR or GIT_INDEX_FILE, which would aim fixtures here.
for (const name of Object.keys(process.env).filter((key) => key.startsWith('GIT_'))) {
  delete process.env[name]
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide 제어 문자 % '))
  // A temp directory inside another checkout must not stand in for a fixture without .git.
  process.env.GIT_CEILING_DIRECTORIES = dirname(root)
  git(['init', '--quiet', '--template='])
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

// Keep the developer's global ignores and line-ending settings out of fixture setup.
function git(args, input) {
  const env = {
    ...process.env,
    // Why: Git reads a missing file as empty config; Git for Windows cannot open `os.devNull`.
    GIT_CONFIG_GLOBAL: join(root, '.config', 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    XDG_CONFIG_HOME: join(root, '.config')
  }
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env, input })
}

function write(file, content) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function track(...files) {
  git(['add', '--force', '--', ...files])
}

test('every C0 byte except tab, LF and CR is reported, and so is DEL', () => {
  const allowed = new Set([0x09, 0x0a, 0x0d])
  for (let byte = 0; byte < 0x80; byte += 1) {
    const expected = (byte < 0x20 && !allowed.has(byte)) || byte === 0x7f
    const found = findControlCharacters(Buffer.from([0x61, byte, 0x62]))
    assert.equal(found?.count ?? 0, expected ? 1 : 0, `byte 0x${byte.toString(16)}`)
  }
  assert.deepEqual(findControlCharacters(Buffer.from([0x00])), {
    line: 1,
    codePoint: 'U+0000',
    count: 1
  })
  assert.equal(findControlCharacters(Buffer.from([0x7f])).codePoint, 'U+007F')
})

test('the first control character is located by LF-counted line, as max-lines counts', () => {
  assert.equal(findControlCharacters(Buffer.from('한글 🎨 é \u0085  \n')), null)
  assert.equal(findControlCharacters(Buffer.alloc(0)), null)
  assert.deepEqual(findControlCharacters(Buffer.from('a\r\nb\nc\td\x1be\n\nf\x00')), {
    line: 3,
    codePoint: 'U+001B',
    count: 2
  })
})

test('tracked text files are checked; untracked and binary files are not', () => {
  write('.gitignore', 'ignored/\n')
  write('src/tracked.ts', 'const key = `a\0b`\n')
  write('LICENSE', 'form\ffeed\nbell\x07\n')
  write('ignored/generated.js', '\0')
  write('assets/image.png', '\0')
  write('assets/UPPER.PNG', '\0')
  write('assets/archive.zip', '\0\0\0')
  write('src/clean.ts', 'export const text = "\\x00\\u0000"\n')
  write('docs/guide.md', '# Guide\n\x1b[0m\n')
  write('docs/안내 é.md', '\x0b')
  write('assets/icon.svg', '<svg>\0</svg>\n')
  write('src/.clean.ts.swp', '\0')
  write('scratch.ts', '\x07')
  track(
    'src/tracked.ts',
    'LICENSE',
    'ignored/generated.js',
    'assets/image.png',
    'assets/UPPER.PNG',
    'assets/archive.zip',
    'src/clean.ts',
    'docs/guide.md',
    'docs/안내 é.md',
    'assets/icon.svg'
  )
  assert.deepEqual(checkControlCharacters(root).sort(), [
    'LICENSE:1: U+000C and 1 more',
    'assets/archive.zip:1: U+0000 and 2 more',
    'assets/icon.svg:1: U+0000',
    'docs/guide.md:2: U+001B',
    'docs/안내 é.md:1: U+000B',
    'ignored/generated.js:1: U+0000',
    'src/tracked.ts:1: U+0000'
  ])
})

test('missing paths and submodules are skipped; conflicted paths are checked once', () => {
  write('gone.ts', 'export {}\n')
  write('sparse.ts', 'export {}\n')
  write('folder/inside.ts', 'export {}\n')
  write('conflict.ts', 'a\x07\n')
  track('gone.ts', 'sparse.ts', 'folder/inside.ts')
  rmSync(join(root, 'gone.ts'))
  git(['update-index', '--skip-worktree', 'sparse.ts'])
  rmSync(join(root, 'sparse.ts'))
  rmSync(join(root, 'folder'), { recursive: true })
  write('folder', 'a file where a directory was\n')
  const blob = git(['hash-object', '-w', 'conflict.ts']).trim()
  const stages = [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\tconflict.ts`).join('\n')
  git(['update-index', '--index-info'], `${stages}\n`)
  mkdirSync(join(root, 'module'))
  git(['update-index', '--add', '--cacheinfo', `160000,${blob},module`])
  assert.deepEqual(checkControlCharacters(root), ['conflict.ts:1: U+0007'])
})

test('a tracked file name that is not UTF-8 fails the check instead of being skipped', () => {
  write('clean.ts', 'export {}\n')
  const blob = git(['hash-object', '-w', 'clean.ts']).trim()
  const entry = [Buffer.from(`100644 ${blob}\tlatin1-`), Buffer.from([0xe9]), Buffer.from('.ts\n')]
  git(['update-index', '--index-info'], Buffer.concat(entry))
  assert.throws(() => checkControlCharacters(root), /tracked file name is not UTF-8/)
})

test(
  'a symlink is not followed to a file outside the check',
  { skip: process.platform === 'win32' },
  () => {
    write('outside.bin', '\0')
    symlinkSync('outside.bin', join(root, 'link.ts'))
    track('link.ts')
    assert.deepEqual(textFiles(root), ['link.ts'])
    assert.deepEqual(checkControlCharacters(root), [])
  }
)

test('the repository has no control characters in its tracked text files', () => {
  assert.deepEqual(checkControlCharacters(), [])
})

test('the CLI resolves its own checkout from another cwd and fails on a control character', () => {
  write('config/scripts/check-control-characters.mjs', readFileSync(script))
  track('config/scripts/check-control-characters.mjs')
  // Git's messages are translated; the C locale keeps the one asserted below stable.
  const run = () =>
    spawnSync(process.execPath, [join(root, 'config/scripts/check-control-characters.mjs')], {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', LANGUAGE: '' }
    })
  write('src/source.ts', 'export {}\n')
  track('src/source.ts')
  const passing = run()
  assert.equal(passing.status, 0, passing.stderr)
  assert.match(passing.stdout, /control-characters: ok/)
  write('src/source.ts', 'export const key = `a\0b`\n')
  write('src/other.ts', '\n\x08\n')
  track('src/other.ts')
  const failing = run()
  assert.equal(failing.status, 1, failing.stderr)
  assert.match(failing.stderr, /^src\/other\.ts:2: U\+0008$/m)
  assert.match(failing.stderr, /^src\/source\.ts:1: U\+0000$/m)
  assert.match(failing.stderr, /write these as escapes/)
  rmSync(join(root, '.git'), { recursive: true })
  const outside = run()
  assert.equal(outside.status, 1)
  assert.match(outside.stderr, /^control-characters: .*not a git repository/s)
  assert.equal(outside.stderr.match(/fatal:/g)?.length, 1, outside.stderr)
  assert.doesNotMatch(outside.stderr, /at .*check-control-characters\.mjs/)
})

test('importing the module runs no check', () => {
  const imported = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`],
    { cwd: tmpdir(), encoding: 'utf8' }
  )
  assert.equal(imported.status, 0, imported.stderr)
  assert.equal(imported.stdout, '')
  assert.equal(imported.stderr, '')
})
