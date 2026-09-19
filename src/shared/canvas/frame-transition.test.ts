import { describe, expect, it } from 'vitest'
import { createCameraTween } from './zoom-pan-interpolation'
import {
  defaultDocumentSettings,
  MAX_CAMERA_ARC,
  MIN_CAMERA_ARC,
  type FrameElement
} from './element-types'
import {
  frameMotionDiff,
  frameTransitionSelection,
  mergeFrameTransition,
  pruneFrameTransition,
  resetFrameTransition,
  resolveFrameTransition
} from './frame-transition'

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
  it('reports nothing for a frame using the application defaults', () => {
    expect(frameMotionDiff(frame('a', 1), defaultDocumentSettings)).toEqual([])
  })

  it('names each field the frame actually changes', () => {
    const frameWith = frame('a', 1, { transition: { roll: 15, spotlight: 1 } })
    expect(frameMotionDiff(frameWith, defaultDocumentSettings)).toEqual(['roll', 'spotlight'])
  })

  it('marks inherited non-default effects even when overrides repeat them', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900, spotlight: 0.5 }
    const pinned = frame('a', 1, { transition: { ms: 900, spotlight: 0.5 } })
    expect(frameMotionDiff(pinned, settings)).toEqual(['ms', 'spotlight'])
    expect(frameMotionDiff(frame('inherited', 2), settings)).toEqual(['ms', 'spotlight'])
  })

  it('stays quiet when an override restores the application default', () => {
    const settings = { ...defaultDocumentSettings, spotlight: 0.5 }
    expect(frameMotionDiff(frame('a', 1, { transition: { spotlight: 0 } }), settings)).toEqual([])
  })

  it.each([
    ['ai-prompt-example', 1.4, undefined],
    ['ai-prompt-example-long-prompt', Math.SQRT2, { ms: 900, arc: 1.4, roll: 0, spotlight: 1 }],
    ['orca-prompt-example', 1.4, undefined]
  ] as const)('marks the camera settings from %s', (_name, transitionArc, transition) => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900, transitionArc, spotlight: 1 }
    expect(frameMotionDiff(frame('a', 1, { transition }), settings)).toEqual([
      'ms',
      'arc',
      'spotlight'
    ])
  })

  it('resolves omitted values and explicit application defaults without marks', () => {
    const settings = { transitionMs: 1000 } as typeof defaultDocumentSettings
    expect(frameMotionDiff(frame('a', 1), settings)).toEqual([])
    expect(
      frameMotionDiff(
        frame('b', 2, {
          transition: { ms: 1000, easing: 'smooth', arc: Math.SQRT2, roll: 0, spotlight: 0 }
        }),
        settings
      )
    ).toEqual([])
  })

  it('marks each non-default effective field', () => {
    expect(
      frameMotionDiff(frame('a', 1, { transition: { roll: 10 } }), {
        ...defaultDocumentSettings,
        transitionMs: 900,
        transitionEasing: 'linear',
        transitionArc: 2,
        spotlight: 1
      })
    ).toEqual(['ms', 'easing', 'arc', 'roll', 'spotlight'])
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

describe('batch frame transitions', () => {
  it('compares resolved values so inherited and explicit defaults are not mixed', () => {
    const frames = [frame('a', 1), frame('b', 2, { transition: { ms: 1000, roll: 15 } })]
    expect(frameTransitionSelection(frames, defaultDocumentSettings)).toMatchObject({
      mixed: ['roll'],
      nonDefault: ['roll'],
      resolved: { ms: 1000, roll: 0 }
    })
    expect(frameTransitionSelection([], defaultDocumentSettings).mixed).toEqual([])
  })

  it('highlights inherited effects and any non-default value in a mixed selection', () => {
    const settings = { ...defaultDocumentSettings, transitionMs: 900, spotlight: 1 }
    const inherited = frame('a', 1)
    const reset = frame('b', 2, { transition: resetFrameTransition(settings) })
    expect(frameTransitionSelection([inherited], settings).nonDefault).toEqual(['ms', 'spotlight'])
    expect(frameTransitionSelection([reset], settings).nonDefault).toEqual([])
    expect(frameTransitionSelection([reset, inherited], settings)).toMatchObject({
      mixed: ['ms', 'spotlight'],
      nonDefault: ['ms', 'spotlight']
    })
    expect(frameTransitionSelection([], settings).nonDefault).toEqual([])
  })

  it('merges only edited fields and preserves each frame’s independent overrides', () => {
    const a = frame('a', 1, { transition: { roll: 15, spotlight: 0.2 } })
    const b = frame('b', 2, { transition: { roll: -30, easing: 'linear' } })
    expect(mergeFrameTransition(a, { ms: 2000 }, defaultDocumentSettings)).toEqual({
      roll: 15,
      spotlight: 0.2,
      ms: 2000
    })
    expect(mergeFrameTransition(b, { ms: 2000 }, defaultDocumentSettings)).toEqual({
      roll: -30,
      easing: 'linear',
      ms: 2000
    })
    expect(a.transition).toEqual({ roll: 15, spotlight: 0.2 })
    expect(b.transition).toEqual({ roll: -30, easing: 'linear' })
  })

  it('removes an edited default without losing other overrides or a spotlight switched off', () => {
    const settings = { ...defaultDocumentSettings, spotlight: 0.5 }
    const a = frame('a', 1, { transition: { ms: 2000, roll: 15, spotlight: 0 } })
    expect(mergeFrameTransition(a, { ms: 1000 }, settings)).toEqual({ roll: 15, spotlight: 0 })
    expect(
      mergeFrameTransition(frame('b', 2, { transition: { roll: 15 } }), { roll: 0 }, settings)
    ).toBeUndefined()
  })
})

describe('resetFrameTransition', () => {
  it('removes overrides when the document already uses application defaults', () => {
    expect(resetFrameTransition(defaultDocumentSettings)).toBeUndefined()
  })

  it.each([
    { transitionMs: 900, transitionArc: 1.4, spotlight: 1 },
    { transitionMs: 900, transitionArc: Math.SQRT2, spotlight: 1 },
    { transitionMs: 0, transitionEasing: 'linear' as const, transitionArc: 2.2, spotlight: 0.5 },
    { transitionArc: Math.SQRT2 + 1e-7 }
  ])('restores every effective application default against %j', (change) => {
    const settings = { ...defaultDocumentSettings, ...change }
    const before = { ...settings }
    const reset = frame('a', 1, { transition: resetFrameTransition(settings) })
    expect(resolveFrameTransition(reset, settings)).toEqual(
      resolveFrameTransition(undefined, defaultDocumentSettings)
    )
    expect(frameMotionDiff(reset, settings)).toEqual([])
    expect(frameTransitionSelection([reset], settings).nonDefault).toEqual([])
    const edited = { ...reset, transition: mergeFrameTransition(reset, { roll: 15 }, settings) }
    expect(frameMotionDiff(edited, settings)).toEqual(['roll'])
    expect(settings).toEqual(before)
  })

  it('stores only defaults needed to neutralize inherited effects', () => {
    expect(
      resetFrameTransition({ ...defaultDocumentSettings, transitionMs: 900, spotlight: 1 })
    ).toEqual({ ms: 1000, spotlight: 0 })
  })
})
