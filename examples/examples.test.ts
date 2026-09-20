import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDocumentFile,
  parseDocument,
  serializeDocument
} from '../src/shared/canvas/document-file.ts'
import { orderedFrames } from '../src/shared/canvas/presentation-sequence.ts'

const examplesDir = import.meta.dirname

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else if (entry.endsWith('.canvaslide')) {
      yield full
    }
  }
}

/** Guards the shipped samples against schema drift: every file must open and present. */
describe('examples/*.canvaslide', () => {
  const files = [...walk(examplesDir)]

  it('ships at least five samples', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it.each(files)('%s parses and has frames to present', (file) => {
    const parsed = parseDocumentFile(readFileSync(file))
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(orderedFrames(parsed.document).length).toBeGreaterThan(0)
    for (const id of parsed.document.order) {
      expect(parsed.document.elements[id], `order references ${id}`).toBeDefined()
    }
    for (const element of Object.values(parsed.document.elements)) {
      if (element.type === 'connector') {
        for (const end of [element.start, element.end]) {
          if (end.elementId) {
            expect(
              parsed.document.elements[end.elementId],
              `connector host ${end.elementId}`
            ).toBeDefined()
          }
        }
      }
    }
  })
})

it('keeps the authoring guide JSON loadable and editable after saving', () => {
  const guide = readFileSync(join(examplesDir, 'README.md'), 'utf8')
  const snippets = [...guide.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)]
  expect(snippets.length).toBeGreaterThan(0)
  for (const [, json] of snippets) {
    const parsed = parseDocumentFile(new TextEncoder().encode(json))
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true)
    if (!parsed.ok) {
      continue
    }
    const document = parsed.document
    expect(orderedFrames(document).length).toBeGreaterThan(0)
    expect([...document.order].sort()).toEqual(Object.keys(document.elements).sort())
    for (const [id, element] of Object.entries(document.elements)) {
      expect(element.id).toBe(id)
    }
    expect(parseDocument(serializeDocument(document))).toEqual(parsed)
  }
})
