import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasDocument, type FrameElement } from './element-types'
import {
  clampFrameIndex,
  moveFrameInSequence,
  gapToIndex,
  moveFrameToGap,
  moveFrameToIndex,
  nextFrameOrder,
  orderedFrames,
  stepFrameIndex
} from './presentation-sequence'

function frame(id: string, order: number): FrameElement {
  return { id, type: 'frame', name: id, order, x: 0, y: 0, width: 10, height: 10 }
}

function docWithFrames(...frames: FrameElement[]): CanvasDocument {
  const doc = createEmptyDocument()
  for (const f of frames) {
    doc.elements[f.id] = f
    doc.order.push(f.id)
  }
  return doc
}

describe('presentation-sequence', () => {
  it('orders frames by explicit order regardless of z-order', () => {
    const doc = docWithFrames(frame('c', 3), frame('a', 1), frame('b', 2))
    expect(orderedFrames(doc).map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(nextFrameOrder(doc)).toBe(4)
    expect(nextFrameOrder(createEmptyDocument())).toBe(1)
  })

  it('swaps neighbours and renumbers 1..n', () => {
    const frames = [frame('a', 1), frame('b', 5), frame('c', 9)]
    expect(moveFrameInSequence(frames, 'c', 'up')).toEqual({ a: 1, c: 2, b: 3 })
    expect(moveFrameInSequence(frames, 'a', 'up')).toEqual({})
    expect(moveFrameInSequence(frames, 'zzz', 'down')).toEqual({})
  })

  it('moves a frame to an arbitrary index', () => {
    const frames = [frame('a', 1), frame('b', 2), frame('c', 3), frame('d', 4)]
    expect(moveFrameToIndex(frames, 'd', 0)).toEqual({ d: 1, a: 2, b: 3, c: 4 })
    expect(moveFrameToIndex(frames, 'a', 2)).toEqual({ b: 1, c: 2, a: 3, d: 4 })
    expect(moveFrameToIndex(frames, 'a', 99)).toEqual({ b: 1, c: 2, d: 3, a: 4 })
    expect(moveFrameToIndex(frames, 'b', 1)).toEqual({})
    expect(moveFrameToIndex(frames, 'zzz', 1)).toEqual({})
  })

  it('clamps and steps indexes', () => {
    expect(clampFrameIndex(5, 3)).toBe(2)
    expect(clampFrameIndex(-1, 3)).toBe(0)
    expect(clampFrameIndex(0, 0)).toBe(0)
    expect(stepFrameIndex(2, 3, 1)).toBe(2)
    expect(stepFrameIndex(0, 3, -1)).toBe(0)
  })

  it('maps drop gaps to indexes and treats the gaps around the dragged row as no-ops', () => {
    expect(gapToIndex(1, 0)).toBe(0)
    expect(gapToIndex(1, 1)).toBe(1)
    expect(gapToIndex(1, 2)).toBe(1)
    expect(gapToIndex(1, 3)).toBe(2)
    const frames = ['a', 'b', 'c'].map((id, i) => ({
      id,
      type: 'frame' as const,
      name: id,
      order: i + 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    }))
    expect(moveFrameToGap(frames, 'b', 1)).toEqual({})
    expect(moveFrameToGap(frames, 'b', 2)).toEqual({})
    expect(moveFrameToGap(frames, 'b', 0)).toEqual({ b: 1, a: 2, c: 3 })
    expect(moveFrameToGap(frames, 'b', 3)).toEqual({ a: 1, c: 2, b: 3 })
    expect(moveFrameToGap(frames, 'zz', 0)).toEqual({})
  })
})
