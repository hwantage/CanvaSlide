/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { convertFigFile } from './fig-convert'
import { readFigFile } from './fig-file'
import { canvasDocumentSchema, createEmptyDocument } from './element-types'
import { parseDocument, serializeDocument } from './document-file'

const file = () => readFigFile(new Uint8Array(readFileSync('tests/fixtures/figma-basic.fig')))
const options = {
  pages: ['0:1', '0:2'],
  mode: 'editable' as const,
  origin: { x: 20, y: 30 },
  firstFrameOrder: 3,
  idPrefix: 'test'
}

test('imports selected pages, editable text and shapes, with non-overlapping pages and fresh frame orders', () => {
  const result = convertFigFile(file(), options)
  expect(result.pages).toBe(2)
  expect(result.elements.filter((e) => e.type === 'frame').map((e) => [e.x, e.y, e.order])).toEqual(
    [
      [20, 30, 3],
      [620, 30, 4]
    ]
  )
  expect(result.elements.find((e) => e.type === 'text')).toMatchObject({
    text: 'Hello Figma',
    x: 40,
    y: 60
  })
  expect(result.elements.filter((e) => e.type === 'shape')).toHaveLength(2)
  expect(new Set(result.elements.map((e) => e.id)).size).toBe(result.elements.length)
  expect(convertFigFile(file(), { ...options, pages: ['0:2'] }).elements).toHaveLength(2)
})

test('appearance mode makes self-contained images and produces a valid savable document', () => {
  const result = convertFigFile(file(), { ...options, mode: 'appearance' })
  expect(result.elements.filter((e) => e.type === 'image')).toHaveLength(3)
  const doc = {
    ...createEmptyDocument(),
    elements: Object.fromEntries(result.elements.map((e) => [e.id, e])),
    order: result.elements.map((e) => e.id),
    assets: Object.fromEntries(result.assets.map((a) => [a.id, a]))
  }
  expect(canvasDocumentSchema.safeParse(doc).success).toBe(true)
  expect(parseDocument(serializeDocument(doc))).toEqual({ ok: true, document: doc })
  expect(() => convertFigFile(file(), { ...options, pages: [] })).toThrow('FIG_EMPTY')
})

test('omits empty SVGs while keeping warnings and visible children of unsupported layers', () => {
  const decoded = file()
  decoded.nodes.push({
    guid: { sessionID: 0, localID: 500 },
    type: 'UNSUPPORTED',
    parentIndex: { guid: { sessionID: 0, localID: 1 }, position: 'z' },
    size: { x: 40, y: 40 }
  })
  const result = convertFigFile(decoded, options)
  expect(result.elements).toHaveLength(5)
  expect(result.assets).toEqual([])
  expect(result.warnings.unsupported).toBe(1)
  decoded.nodes.push({
    guid: { sessionID: 0, localID: 501 },
    type: 'RECTANGLE',
    parentIndex: { guid: { sessionID: 0, localID: 500 } },
    size: { x: 10, y: 10 },
    fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
  })
  const visible = convertFigFile(decoded, options)
  expect(visible.elements).toHaveLength(6)
  expect(visible.assets).toHaveLength(1)
  expect(atob(visible.assets[0]!.data.split(',')[1]!)).toContain('rgba(255,0,0,1)')
})

test('separates nested and mixed-style text from frame backgrounds without duplicate outlined text', () => {
  const decoded = readFigFile(new Uint8Array(readFileSync('tests/fixtures/figma-nested-text.fig')))
  const result = convertFigFile(decoded, options)
  const texts = result.elements.filter((element) => element.type === 'text')
  expect(texts.map((element) => element.text)).toEqual(['Nested styled text', 'Partially clipped'])
  expect(texts[0]).toMatchObject({ x: 50, y: 70, width: 270 })
  expect(texts[0]!.textStyle.lineHeight).toBeCloseTo(1.2)
  expect(texts[1]).toMatchObject({
    x: 340,
    y: 130,
    clip: { left: 0, right: 0.5, top: 0, bottom: 0 }
  })
  expect(result.warnings.text).toBe(1)
  expect(result.assets).toHaveLength(1)
  const svg = atob(result.assets[0]!.data.split(',')[1]!)
  expect(svg).not.toMatch(/<text|<use|Nested styled text|Partially clipped/)
  const images = result.elements.filter((element) => element.type === 'image')
  expect(images).toHaveLength(1)
  expect(result.elements.indexOf(images[0]!)).toBeLessThan(result.elements.indexOf(texts[0]!))
  expect(
    convertFigFile(decoded, { ...options, mode: 'appearance' }).elements.some(
      (element) => element.type === 'text'
    )
  ).toBe(false)
})

test('retains text under masks and translucent ancestors with reported approximations', () => {
  const decoded = readFigFile(new Uint8Array(readFileSync('tests/fixtures/figma-nested-text.fig')))
  decoded.nodes.find((node) => node.type === 'FRAME')!.opacity = 0.5
  decoded.nodes.push({
    guid: { sessionID: 0, localID: 20 },
    type: 'RECTANGLE',
    mask: true,
    parentIndex: { guid: { sessionID: 0, localID: 11 }, position: ' ' },
    size: { x: 100, y: 40 },
    fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
  })
  const result = convertFigFile(decoded, options)
  const texts = result.elements.filter((element) => element.type === 'text')
  expect(texts).toHaveLength(1)
  expect(texts[0]).toMatchObject({
    text: 'Nested styled text',
    textStyle: { color: 'rgba(26,26,26,0.5)' }
  })
  expect(texts[0]!.clip?.right).toBeCloseTo(170 / 270)
  expect(result.warnings.mask).toBe(1)
  expect(result.warnings.paint).toBeGreaterThan(0)
})
