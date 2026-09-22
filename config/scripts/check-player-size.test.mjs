import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { checkPlayerSize, MAX_PLAYER_BYTES } from './check-player-size.mjs'

let root
let artifact
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'canvaslide player 크기 % '))
  artifact = join(root, 'src/renderer/src/generated/player.iife.js')
  mkdirSync(dirname(artifact), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

test('accepts the exact raw limit and reports gzip without using it as the budget', () => {
  const source = Buffer.alloc(MAX_PLAYER_BYTES, 'a')
  writeFileSync(artifact, source)
  assert.deepEqual(checkPlayerSize(artifact), {
    raw: MAX_PLAYER_BYTES,
    gzip: gzipSync(source).length
  })
  writeFileSync(artifact, Buffer.alloc(MAX_PLAYER_BYTES + 1, 'a'))
  assert.throws(
    () => checkPlayerSize(artifact),
    new RegExp(`${MAX_PLAYER_BYTES + 1} B raw > ${MAX_PLAYER_BYTES} B limit`)
  )
})

test('counts encoded bytes, not JavaScript string length', () => {
  const source = '가'.repeat(Math.floor(MAX_PLAYER_BYTES / 3) + 1)
  assert.ok(source.length < MAX_PLAYER_BYTES)
  writeFileSync(artifact, source)
  assert.throws(
    () => checkPlayerSize(artifact),
    new RegExp(`${Buffer.byteLength(source)} B raw > ${MAX_PLAYER_BYTES} B limit`)
  )
})

test('missing and empty artifacts fail instead of reporting a zero-byte success', () => {
  assert.throws(() => checkPlayerSize(artifact), { code: 'ENOENT' })
  writeFileSync(artifact, '')
  assert.throws(() => checkPlayerSize(artifact), /empty artifact/)
})

test('CLI resolves its own checkout from another cwd and exits nonzero for every failure', () => {
  const script = join(root, 'config/scripts/check-player-size.mjs')
  mkdirSync(dirname(script), { recursive: true })
  writeFileSync(script, readFileSync(new URL('./check-player-size.mjs', import.meta.url)))
  const run = () => spawnSync(process.execPath, [script], { cwd: tmpdir(), encoding: 'utf8' })
  for (const source of [null, '', 'a'.repeat(MAX_PLAYER_BYTES + 1)]) {
    if (source !== null) {
      writeFileSync(artifact, source)
    }
    const result = run()
    assert.equal(result.error, undefined)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /ENOENT|empty artifact|raw > .* limit/)
    assert.equal(result.stdout, '')
  }
  writeFileSync(artifact, '(() => {})()')
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    new RegExp(`12 B raw / ${MAX_PLAYER_BYTES} B limit; \\d+ B gzip \\(report only\\)`)
  )
})
