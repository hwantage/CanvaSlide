import { describe, expect, it } from 'vitest'
import { layoutPdfPages } from './pdf-page-layout'

const landscape = { width: 800, height: 450 }
const portrait = { width: 400, height: 800 }

describe('pdf-page-layout', () => {
  it('scales pages to one width and tiles them in reading order', () => {
    const placed = layoutPdfPages([landscape, landscape, landscape, landscape], {
      origin: { x: 100, y: 200 },
      pageWidth: 960,
      gap: 40
    })
    expect(placed).toHaveLength(4)
    expect(placed[0]?.page).toEqual({ x: 100, y: 200, width: 960, height: 540 })
    expect(placed[1]?.page).toEqual({ x: 1100, y: 200, width: 960, height: 540 })
    expect(placed[2]?.page).toEqual({ x: 100, y: 780, width: 960, height: 540 })
    expect(placed[3]?.page.x).toBe(1100)
    expect(placed[0]?.frame).toEqual(placed[0]?.page)
  })

  it('advances rows by the tallest page in the row', () => {
    const placed = layoutPdfPages([landscape, portrait, landscape], {
      origin: { x: 0, y: 0 },
      pageWidth: 100,
      gap: 10,
      columns: 2
    })
    expect(placed[1]?.page.height).toBe(200)
    expect(placed[2]?.page).toMatchObject({ x: 0, y: 210 })
  })

  it('handles a single page and a degenerate size', () => {
    expect(
      layoutPdfPages([{ width: 0, height: 0 }], {
        origin: { x: 5, y: 5 },
        pageWidth: 50,
        gap: 1
      })[0]?.page
    ).toEqual({ x: 5, y: 5, width: 50, height: 50 })
    expect(layoutPdfPages([], { origin: { x: 0, y: 0 }, pageWidth: 50, gap: 1 })).toEqual([])
  })
})
