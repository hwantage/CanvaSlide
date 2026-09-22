import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInkPainter } from './presentation-ink-painter'

const SVG_NS = 'http://www.w3.org/2000/svg'

let group: SVGGElement

const paths = () => [...group.querySelectorAll('path')]

beforeEach(() => {
  group = document.createElementNS(SVG_NS, 'g')
  document.body.append(group)
})

afterEach(() => group.remove())

describe('createInkPainter', () => {
  it('does not turn a subpixel release into a zero-length WebKit cap', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 1, y: 2 })
    painter.extend({ x: 1.001, y: 2.001 }, Number.EPSILON)
    expect(paths()).toHaveLength(0)
    painter.extend({ x: 2, y: 3 }, Number.EPSILON)
    expect(paths()).toHaveLength(1)
  })

  it('adds nothing at all for a press and release that never moved', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 0, y: 0 })
    painter.end()
    expect(paths()).toHaveLength(0)
  })

  it('adds nothing while every sample is still inside the spacing', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 0, y: 0 })
    painter.extend({ x: 1, y: 1 }, 5)
    expect(paths()).toHaveLength(0)
    painter.extend({ x: 40, y: 0 }, 5)
    expect(paths()).toHaveLength(1)
  })

  it('paints one node per stroke and thins samples that are too close together', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 0, y: 0 })
    painter.extend({ x: 1, y: 0 }, 5)
    painter.extend({ x: 40, y: 0 }, 5)
    painter.end()
    expect(paths()).toHaveLength(1)
    expect(paths()[0]!.getAttribute('d')).toBe('M0,0L40,0')
    expect(paths()[0]!.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    painter.begin({ x: 0, y: 100 })
    painter.extend({ x: 40, y: 100 }, 5)
    painter.end()
    expect(paths()).toHaveLength(2)
  })

  it('leaves a finished stroke on screen; only a wipe takes it away', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 0, y: 0 })
    painter.extend({ x: 50, y: 50 }, 1)
    painter.end()
    // A released pointer moving on keeps extending nothing.
    painter.extend({ x: 200, y: 200 }, 1)
    expect(paths()).toHaveLength(1)
    expect(paths()[0]!.getAttribute('d')).toBe('M0,0L50,50')
    expect(paths()[0]!.getAttribute('stroke-opacity')).toBeNull()
  })

  it('wipes everything on clear, including a stroke still under the pointer', () => {
    const painter = createInkPainter(group)
    painter.begin({ x: 0, y: 0 })
    painter.extend({ x: 40, y: 0 }, 5)
    painter.end()
    painter.begin({ x: 10, y: 10 })
    painter.extend({ x: 60, y: 10 }, 5)
    expect(paths()).toHaveLength(2)
    painter.clear()
    expect(paths()).toHaveLength(0)
    painter.extend({ x: 20, y: 20 }, 1)
    expect(paths()).toHaveLength(0)
  })
})
