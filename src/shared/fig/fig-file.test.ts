/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync } from 'fflate'
import { readFigFile } from './fig-file'
import { figPages } from './fig-scene'

const fixture = new Uint8Array(readFileSync('tests/fixtures/figma-basic.fig'))

test('reads a real binary ZIP and its raw fig-kiwi payload, excluding hidden pages', () => {
  const file = readFigFile(fixture)
  expect(file.name).toBe('Synthetic Figma fixture')
  expect(figPages(file).map((page) => page.name)).toEqual(['First page', 'Second page'])
  const raw = unzipSync(fixture)['canvas.fig']!
  expect(readFigFile(raw).nodes).toEqual(file.nodes)
})

test('rejects malformed files and tolerates invalid optional metadata', () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([1, 2, 3]),
    zipSync({ 'other.txt': new Uint8Array([1]) })
  ]) {
    expect(() => readFigFile(bytes)).toThrow()
  }
  const archive = unzipSync(fixture)
  expect(() => readFigFile(archive['canvas.fig']!.subarray(0, 24))).toThrow()
  archive['meta.json'] = new TextEncoder().encode('{')
  expect(readFigFile(zipSync(archive), 'Fallback').name).toBe('Fallback')
})
