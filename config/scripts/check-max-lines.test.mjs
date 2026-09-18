import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkMaxLines, countLines, limitFor, lintedFiles } from './check-max-lines.mjs'

const config = JSON.parse(readFileSync(new URL('../../.oxlintrc.json', import.meta.url), 'utf8'))
const oxlint = resolve(
  dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))),
  'bin/oxlint'
)
let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide 줄 수 % '))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  writeFileSync(join(root, '.oxlintrc.json'), JSON.stringify(config))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(file, source) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, source)
}

function diagnostics() {
  const result = spawnSync(
    process.execPath,
    [oxlint, '--format', 'json', '-A', 'unicorn/no-empty-file'],
    {
      cwd: root,
      encoding: 'utf8'
    }
  )
  assert.equal(result.error, undefined)
  assert.ok(result.status === 0 || result.status === 1, result.stderr)
  const { diagnostics } = JSON.parse(result.stdout)
  assert.ok(
    diagnostics.every((entry) => entry.code === 'eslint(max-lines)'),
    result.stdout
  )
  return diagnostics
}

function setLimit(max) {
  const fixtureConfig = structuredClone(config)
  for (const override of fixtureConfig.overrides) {
    const rule = override.rules['max-lines']
    if (Array.isArray(rule)) {
      rule[1].max = max
    }
  }
  write('.oxlintrc.json', JSON.stringify(fixtureConfig))
}

test('ordinary TS and TSX use 800; all four test suffixes use 1000, wherever they live', () => {
  const files = [
    ['src/module.ts', 800],
    ['src/component.tsx', 800],
    ['config/config.ts', 800],
    ['website/src/view.tsx', 800],
    ['src/module.test.ts', 1000],
    ['src/component.test.tsx', 1000],
    ['tests/e2e/flow.spec.ts', 1000],
    ['website/tests/view.spec.tsx', 1000],
    ['examples/example.test.ts', 1000],
    ['tests/e2e/fixture.ts', 800]
  ]
  for (const [file, max] of files) {
    assert.equal(limitFor(file, config), max)
    write(file, '// counted\n'.repeat(max))
  }
  assert.deepEqual(checkMaxLines(root), [])
  assert.deepEqual(diagnostics(), [])
  for (const [file, max] of files) {
    write(file, '// counted\n'.repeat(max + 1))
  }
  assert.equal(checkMaxLines(root).length, files.length)
  assert.equal(diagnostics().length, files.length)
})

test('blank lines, block comments, inline comments and string content match oxlint counts', () => {
  const sources = [
    ['// comment\n\n/* block\n\nend */\nexport {}\n', 6],
    ['export {} /* inline\nend */\n', 2],
    ['export const url = "https://example.test/* text */"\n', 1],
    ['export const template = `first\n// string content\nlast`\n', 3],
    ['export const pattern = /\\/\\//\n', 1],
    ['export const element = <div>\n{/* JSX comment */}\n</div>\n', 3],
    ['export const text = "max-lines"\n', 1],
    ['export {}\r\n\r\n// last\r\n', 3],
    ['export {}\n// no final newline', 2],
    ['\n\n', 2],
    ['', 1]
  ]
  for (const [source, expected] of sources) {
    assert.equal(countLines(source), expected)
    write('src/sample.tsx', source)
    setLimit(expected)
    assert.deepEqual(checkMaxLines(root), [])
    assert.deepEqual(diagnostics(), [])
    setLimit(expected - 1)
    assert.equal(checkMaxLines(root).length, 1)
    assert.match(diagnostics()[0].message, new RegExp(`\\(${expected}\\)`))
  }
})

test('only the actual flat locale directory is exempt', () => {
  const files = [
    'src/renderer/src/i18n/locales/en.ts',
    'src/renderer/src/i18n/locales/pt-BR.ts',
    'src/renderer/src/i18n/locales/nested/en.ts',
    'website/src/i18n/locales/en.ts'
  ]
  for (const file of files) {
    write(file, '// resource\n'.repeat(1001))
  }
  assert.equal(checkMaxLines(root).length, 2)
  assert.equal(diagnostics().length, 2)
})

test('discovery includes untracked code across the repo and honors git/config ignores', () => {
  write('.gitignore', 'ignored/\n')
  const included = [
    'src/source.ts',
    'tests/flow.spec.ts',
    'examples/sample.ts',
    'new area/view.tsx'
  ]
  const ignored = [
    'ignored/file.ts',
    'node_modules/file.ts',
    'dist/file.ts',
    'src-tauri/target/file.ts',
    'coverage/file.ts'
  ]
  for (const file of [...included, ...ignored]) {
    write(file, '// counted\n'.repeat(1001))
  }
  write('src/plain.js', '// not TypeScript\n'.repeat(1001))
  assert.deepEqual(lintedFiles(root).sort(), included.sort())
  assert.equal(checkMaxLines(root).length, included.length)
  assert.equal(diagnostics().length, included.length)
})

test('the independent count catches oversize files even with inline disables', () => {
  for (const prefix of [
    '// oxlint-disable max-lines',
    '/* eslint-disable max-lines */',
    '/* oxlint-disable */'
  ]) {
    write('src/oversize.ts', `${prefix}\n${'// counted\n'.repeat(800)}`)
    assert.deepEqual(diagnostics(), [])
    assert.deepEqual(checkMaxLines(root), ['src/oversize.ts: 801 lines > 800'])
  }
})

test('configuration changes drive both checks, and unsupported counting policies fail explicitly', () => {
  setLimit(3)
  write('src/sample.ts', '// counted\n'.repeat(4))
  assert.deepEqual(checkMaxLines(root), ['src/sample.ts: 4 lines > 3'])
  assert.equal(diagnostics().length, 1)
  const invalid = structuredClone(config)
  invalid.overrides.find((entry) => entry.files.includes('**/*.ts')).rules[
    'max-lines'
  ][1].skipComments = true
  write('.oxlintrc.json', JSON.stringify(invalid))
  assert.throws(() => checkMaxLines(root), /count blank lines and comments/)
})

test('discovery failures fail the guard instead of silently accepting an empty file list', () => {
  write('.oxlintrc.json', '{invalid')
  assert.throws(() => lintedFiles(root))
})

test('the CLI resolves its own checkout from another cwd and fails on suppressed violations', () => {
  write(
    'config/scripts/check-max-lines.mjs',
    readFileSync(new URL('./check-max-lines.mjs', import.meta.url))
  )
  symlinkSync(
    fileURLToPath(new URL('../../node_modules', import.meta.url)),
    join(root, 'node_modules'),
    'junction'
  )
  const run = () =>
    spawnSync(process.execPath, [join(root, 'config/scripts/check-max-lines.mjs')], {
      cwd: tmpdir(),
      encoding: 'utf8'
    })
  write('src/source.ts', 'export {}\n')
  const passing = run()
  assert.equal(passing.status, 0, passing.stderr)
  assert.match(passing.stdout, /max-lines: ok/)
  write('src/source.ts', `/* oxlint-disable */\n${'// counted\n'.repeat(800)}`)
  const failing = run()
  assert.equal(failing.status, 1, failing.stderr)
  assert.match(failing.stderr, /src\/source\.ts: 801 lines > 800/)
})
