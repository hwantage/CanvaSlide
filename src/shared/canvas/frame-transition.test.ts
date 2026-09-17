import { describe, expect, it } from 'vitest'
import { createCameraTween } from './zoom-pan-interpolation'
import {
  defaultDocumentSettings,
  MAX_CAMERA_ARC,
  MIN_CAMERA_ARC,
  type FrameElement
} from './element-types'
import { frameMotionDiff, pruneFrameTransition, resolveFrameTransition } from './frame-transition'

function frame(id: string, order: number, patch: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'frame',
    name: id,
    order,
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    ...patch
  }
}

describe('resolveFrameTransition', () => {
  it('falls back to the document settings when the frame says nothing', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900 }
    expect(resolveFrameTransition(frame('a', 1), settings)).toEqual({
      ms: 900,
      easing: 'smooth',
      arc: Math.SQRT2,
      roll: 0,
      spotlight: 0
    })
  })

  it('lets each frame field override the document default independently', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900, spotlight: 0.2 }
    const resolved = resolveFrameTransition(
      frame('a', 1, { transition: { ms: 2400, easing: 'overshoot' } }),
      settings
    )
    expect(resolved.ms).toBe(2400)
    expect(resolved.easing).toBe('overshoot')
    // untouched fields still come from the document
    expect(resolved.arc).toBe(Math.SQRT2)
    expect(resolved.spotlight).toBe(0.2)
  })

  // Why: the standalone player parses its document with JSON.parse and no zod, so a generated or
  // hand-edited file can hand these straight to the camera maths.
  it.each([
    [{ arc: 0 }, 'arc', MIN_CAMERA_ARC],
    [{ arc: 1e6 }, 'arc', MAX_CAMERA_ARC],
    [{ arc: -5 }, 'arc', MIN_CAMERA_ARC],
    [{ arc: Number.NaN }, 'arc', Math.SQRT2],
    [{ arc: 'big' }, 'arc', Math.SQRT2],
    [{ ms: Number.NaN }, 'ms', 1000],
    [{ ms: -1 }, 'ms', 0],
    [{ roll: Number.NaN }, 'roll', 0],
    [{ roll: 9999 }, 'roll', 180],
    [{ spotlight: 5 }, 'spotlight', 1],
    [{ spotlight: -2 }, 'spotlight', 0]
  ])('forces %j back into range', (transition, key, expected) => {
    const resolved = resolveFrameTransition(
      frame('a', 1, { transition: transition as never }),
      defaultDocumentSettings
    )
    expect(resolved[key as 'arc' | 'ms' | 'roll' | 'spotlight']).toBeCloseTo(expected as number, 6)
  })

  it('falls back to the default curve for an easing it does not know', () => {
    const resolved = resolveFrameTransition(
      frame('a', 1, { transition: { easing: 'warp' } as never }),
      defaultDocumentSettings
    )
    expect(resolved.easing).toBe('smooth')
  })

  it('never lets a broken frame produce a camera that is not a number', () => {
    const viewport = { width: 1600, height: 900 }
    for (const transition of [
      { arc: 0 },
      { arc: Number.NaN },
      { arc: 1e6 },
      { roll: Number.NaN }
    ]) {
      const { arc, easing } = resolveFrameTransition(
        frame('a', 1, { transition: transition as never }),
        defaultDocumentSettings
      )
      const tween = createCameraTween(
        { x: 0, y: 0, zoom: 1 },
        { x: -900, y: -40, zoom: 3 },
        viewport,
        { rho: arc, easing }
      )
      const mid = tween.at(0.5)
      expect(Number.isFinite(mid.x) && Number.isFinite(mid.y) && Number.isFinite(mid.zoom)).toBe(
        true
      )
    }
  })

  it('treats a missing frame as the document defaults', () => {
    expect(resolveFrameTransition(undefined, defaultDocumentSettings).ms).toBe(
      defaultDocumentSettings.transitionMs
    )
  })
})

describe('frameMotionDiff', () => {
  it('reports nothing for a frame that presents like every other', () => {
    expect(frameMotionDiff(frame('a', 1), defaultDocumentSettings)).toEqual([])
  })

  it('names each field the frame actually changes', () => {
    const frameWith = frame('a', 1, { transition: { roll: 15, spotlight: 1 } })
    expect(frameMotionDiff(frameWith, defaultDocumentSettings)).toEqual(['roll', 'spotlight'])
  })

  it('stays quiet when the override repeats the document default', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900, spotlight: 0.5 }
    const pinned = frame('a', 1, { transition: { ms: 900, spotlight: 0.5 } })
    expect(frameMotionDiff(pinned, settings)).toEqual([])
  })

  it('reports a spotlight the frame switches off against a document that dims', () => {
    const settings = { ...defaultDocumentSettings, spotlight: 0.5 }
    expect(frameMotionDiff(frame('a', 1, { transition: { spotlight: 0 } }), settings)).toEqual([
      'spotlight'
    ])
  })

  it('ignores an out-of-range value that clamps back onto the default', () => {
    const wild = frame('a', 1, { transition: { arc: Number.NaN } as never })
    expect(frameMotionDiff(wild, defaultDocumentSettings)).toEqual([])
  })
})

describe('pruneFrameTransition', () => {
  it('drops a field that lands back on the document default', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 1000 }
    expect(pruneFrameTransition({ ms: 1000, easing: 'smooth' }, settings)).toBeUndefined()
  })

  it('keeps the fields that really differ', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 1000 }
    expect(pruneFrameTransition({ ms: 1000, easing: 'overshoot' }, settings)).toEqual({
      easing: 'overshoot'
    })
  })

  it('treats a tilt of zero as no tilt, since the document has none to inherit', () => {
    expect(pruneFrameTransition({ roll: 0 }, defaultDocumentSettings)).toBeUndefined()
    expect(pruneFrameTransition({ roll: -15 }, defaultDocumentSettings)).toEqual({ roll: -15 })
  })

  it('keeps a spotlight switched off against a document that dims', () => {
    const settings = { ...defaultDocumentSettings, spotlight: 0.5 }
    expect(pruneFrameTransition({ spotlight: 0 }, settings)).toEqual({ spotlight: 0 })
  })
})
