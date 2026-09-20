import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exampleAssetPath, exampleCatalog, findExample } from './example-catalog'
import { parseDocumentFile } from './canvas/document-file'

it('ships unique catalog IDs backed by valid documents within the hosting limit', () => {
  expect(new Set(exampleCatalog.map((example) => example.id)).size).toBe(exampleCatalog.length)
  for (const example of exampleCatalog) {
    expect(example.id).toMatch(/^[a-z0-9-]+$/)
    expect(example.source).not.toContain('..')
    const file = readFileSync(resolve(import.meta.dirname, '../../examples', example.source))
    expect(file.byteLength).toBeLessThanOrEqual(25 * 1024 * 1024)
    const result = parseDocumentFile(file)
    expect(result.ok, example.id).toBe(true)
    expect(exampleAssetPath(example.id)).toBe(`examples/${example.id}.canvaslide`)
    expect(findExample(example.id)).toBe(example)
  }
})
