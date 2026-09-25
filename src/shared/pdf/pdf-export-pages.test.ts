import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type FrameElement
} from '../canvas/element-types'
import {
  PDF_LONG_EDGE_PT,
  pdfExportPages,
  pdfPageElements,
  pdfPageSize,
  pdfRasterSize
} from './pdf-export-pages'

function frame(id: string, order: number, width: number, height: number): FrameElement {
  return { id, type: 'frame', name: id, order, x: 0, y: 0, width, height }
}

function documentWith(frames: readonly FrameElement[]): CanvasDocument {
  const doc = createEmptyDocument('Deck')
  return {
    ...doc,
    elements: Object.fromEntries(frames.map((element) => [element.id, element])),
    order: frames.map((element) => element.id)
  }
}

describe('pdfPageSize', () => {
  it('scales the long edge to a slide-sized page and keeps the frame aspect ratio', () => {
    expect(pdfPageSize({ width: 1600, height: 900 })).toEqual({ width: 960, height: 540 })
    // The same 16:9 shape authored at any other size lands on the same page.
    expect(pdfPageSize({ width: 320, height: 180 })).toEqual({ width: 960, height: 540 })
  })

  it('puts the long edge on the tall side of a portrait frame', () => {
    expect(pdfPageSize({ width: 600, height: 800 })).toEqual({ width: 720, height: 960 })
  })

  it('keeps a square frame square', () => {
    expect(pdfPageSize({ width: 500, height: 500 })).toEqual({
      width: PDF_LONG_EDGE_PT,
      height: PDF_LONG_EDGE_PT
    })
  })

  it('holds a degenerate frame inside the page box range the format allows', () => {
    const sliver = pdfPageSize({ width: 100_000, height: 1 })
    expect(sliver.width).toBe(PDF_LONG_EDGE_PT)
    expect(sliver.height).toBe(3)
    expect(pdfPageSize({ width: 0, height: 0 })).toEqual({
      width: PDF_LONG_EDGE_PT,
      height: PDF_LONG_EDGE_PT
    })
  })
})

describe('pdfRasterSize', () => {
  it('rasterises at whole pixels per point', () => {
    expect(pdfRasterSize({ width: 960, height: 540 }, 'low')).toEqual({
      width: 1280,
      height: 720
    })
    expect(pdfRasterSize({ width: 960, height: 540 }, 'medium')).toEqual({
      width: 1920,
      height: 1080
    })
    expect(pdfRasterSize({ width: 960, height: 540 }, 'high')).toEqual({
      width: 2880,
      height: 1620
    })
  })

  // A page this big cannot come out of `pdfPageSize` today; the ceiling is there so that raising
  // PDF_LONG_EDGE_PT can never quietly ask an engine for a surface it refuses to paint.
  it('shrinks uniformly rather than hand a canvas more pixels than it can hold', () => {
    const size = pdfRasterSize({ width: 14_400, height: 14_400 }, 'high')
    expect(size.width * size.height).toBeLessThanOrEqual(16_777_216)
    expect(size.width * size.height).toBeGreaterThan(16_000_000)
    expect(size.width).toBe(size.height)
  })

  it('leaves every page the real page sizes produce untouched by that ceiling', () => {
    // The largest surface the export can ask for: a square page at the print resolution.
    const square = pdfRasterSize(pdfPageSize({ width: 1000, height: 1000 }), 'high')
    expect(square).toEqual({ width: 2880, height: 2880 })
  })

  it('never rounds an edge away entirely', () => {
    expect(pdfRasterSize({ width: 960, height: 3 }, 'low').height).toBe(4)
    expect(pdfRasterSize({ width: 1, height: 0.1 }, 'low').height).toBe(1)
  })
})

describe('pdfExportPages', () => {
  it('yields one page per frame in presentation order, not document order', () => {
    const doc = documentWith([
      frame('b', 2, 1600, 900),
      frame('a', 1, 800, 800),
      frame('c', 3, 900, 1600)
    ])
    const pages = pdfExportPages(doc, 'medium')
    expect(pages.map((entry) => entry.frame.id)).toEqual(['a', 'b', 'c'])
    expect(pages.map((entry) => entry.number)).toEqual([1, 2, 3])
    expect(pages.map((entry) => entry.page)).toEqual([
      { width: 960, height: 960 },
      { width: 960, height: 540 },
      { width: 540, height: 960 }
    ])
  })

  it('exports nothing from a document with no frames', () => {
    expect(pdfExportPages(createEmptyDocument('Empty'), 'medium')).toEqual([])
  })
})

describe('pdfPageElements', () => {
  it('prints a rotated element that only its turned outline brings onto the page', () => {
    const page = frame('page', 1, 1000, 500)
    // A 20×800 bar right of the page; turned a quarter it reaches back across the right edge.
    const bar: CanvasElement = {
      id: 'bar',
      type: 'shape',
      shape: 'rectangle',
      x: 1100,
      y: -150,
      width: 20,
      height: 800,
      style: defaultShapeStyle,
      text: '',
      textStyle: defaultTextStyle
    }
    const doc = (element: CanvasElement) => {
      const base = documentWith([page])
      return {
        ...base,
        elements: { ...base.elements, bar: element },
        order: [...base.order, 'bar']
      }
    }
    expect(pdfPageElements(doc(bar), page)).toEqual([])
    expect(pdfPageElements(doc({ ...bar, rotation: 90 } as CanvasElement), page)).toEqual([
      expect.objectContaining({ id: 'bar' })
    ])
  })
})
