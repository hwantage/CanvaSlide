import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { withReleaseNotes } from './updater-feed-notes.mjs'

const script = fileURLToPath(new URL('./updater-feed-notes.mjs', import.meta.url))
const platforms = {
  'darwin-aarch64': { signature: 'c2ln', url: 'https://example.test/CanvaSlide.app.tar.gz' }
}
const feed = { version: '1.2.3', pub_date: '2026-01-02T03:04:05.678Z', platforms }

test('the published Release body becomes the notes and nothing else in the feed changes', () => {
  const body = '## What is new\r\n\r\n- **Rotate** shapes\r\n- Export as PDF\r\n'
  assert.deepEqual(withReleaseNotes(feed, { tag: 'v1.2.3', body }), {
    ...feed,
    notes: '## What is new\n\n- **Rotate** shapes\n- Export as PDF'
  })
  assert.equal(withReleaseNotes(feed, { tag: '1.2.3', body: 'a\rb' }).notes, 'a\nb')
})

test('notes already in the feed are replaced, and an empty body leaves the feed without notes', () => {
  const placeholder = {
    ...feed,
    notes: 'See the assets below to download this version and install.'
  }
  assert.equal(
    withReleaseNotes(placeholder, { tag: 'v1.2.3', body: 'Real notes' }).notes,
    'Real notes'
  )
  for (const body of ['', '\n', ' \r\n\t']) {
    assert.deepEqual(
      withReleaseNotes(placeholder, { tag: 'v1.2.3', body }),
      feed,
      JSON.stringify(body)
    )
  }
})

test("a feed for another version is refused, so one release's notes never land in another's", () => {
  for (const other of [{ ...feed, version: '1.2.4' }, { platforms }, null, []]) {
    assert.throws(
      () => withReleaseNotes(other, { tag: 'v1.2.3', body: 'Notes' }),
      /latest\.json is for version .*, not 1\.2\.3/
    )
  }
})

test('the command writes the feed with the notes from the body file', () => {
  const root = mkdtempSync(join(tmpdir(), 'canvaslide feed notes '))
  try {
    const feedPath = join(root, 'latest.json')
    const bodyPath = join(root, 'body.md')
    writeFileSync(feedPath, JSON.stringify(feed))
    writeFileSync(bodyPath, 'Notes\r\n')
    const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    for (const args of [
      [feedPath, '--tag', 'v1.2.3'],
      [feedPath, '--body', bodyPath],
      ['--tag', 'v1.2.3', '--body', bodyPath],
      [feedPath, feedPath, '--tag', 'v1.2.3', '--body', bodyPath]
    ]) {
      const usage = run(args)
      assert.equal(usage.status, 1, args.join(' '))
      assert.match(usage.stderr, /usage: updater-feed-notes\.mjs/)
    }
    const written = run([feedPath, '--tag', 'v1.2.3', '--body', bodyPath])
    assert.equal(written.status, 0, written.stderr)
    assert.deepEqual(JSON.parse(written.stdout), { ...feed, notes: 'Notes' })
    const mismatch = run([feedPath, '--tag', 'v9.9.9', '--body', bodyPath])
    assert.equal(mismatch.status, 1)
    assert.equal(mismatch.stdout, '')
    assert.match(mismatch.stderr, /latest\.json is for version 1\.2\.3, not 9\.9\.9/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
