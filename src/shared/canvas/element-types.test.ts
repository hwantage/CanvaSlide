import { describe, expect, it } from 'vitest'
import {
  canvasElementSchema,
  defaultShapeStyle,
  defaultTextStyle,
  documentSettingsSchema,
  frameTransitionSchema
} from './element-types'

describe('camera validation boundaries', () => {
  it.each([
    ['ms', 0, 10_000, -1, 10_001],
    ['arc', 0.6, 3, 0.59, 3.01],
    ['roll', -180, 180, -181, 181],
    ['spotlight', 0, 1, -0.01, 1.01]
  ])('preserves frame %s limits after separating runtime values', (key, min, max, low, high) => {
    for (const value of [min, max]) {
      expect(frameTransitionSchema.parse({ [key]: value })).toEqual({ [key]: value })
    }
    for (const value of [low, high, Number.NaN, Infinity]) {
      expect(frameTransitionSchema.safeParse({ [key]: value }).success).toBe(false)
    }
  })

  it.each([
    ['transitionMs', 0, 10_000, -1, 10_001],
    ['transitionArc', 0.6, 3, 0.59, 3.01]
  ] as const)('preserves document %s limits', (key, min, max, low, high) => {
    for (const value of [min, max]) {
      expect(documentSettingsSchema.parse({ transitionMs: 1000, [key]: value })[key]).toBe(value)
    }
    for (const value of [low, high, Number.NaN, Infinity]) {
      expect(documentSettingsSchema.safeParse({ transitionMs: 1000, [key]: value }).success).toBe(
        false
      )
    }
  })

  it('keeps frame overrides optional and rejects fractional durations', () => {
    expect(frameTransitionSchema.parse({})).toEqual({})
    expect(frameTransitionSchema.safeParse({ ms: 1.5 }).success).toBe(false)
    expect(documentSettingsSchema.safeParse({ transitionMs: 1.5 }).success).toBe(false)
  })
})

describe('element rotation', () => {
  const shape = {
    id: 's',
    type: 'shape',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    style: defaultShapeStyle,
    text: '',
    textStyle: defaultTextStyle
  }

  it('may be omitted, which means upright', () => {
    expect(canvasElementSchema.parse(shape)).not.toHaveProperty('rotation')
    expect(canvasElementSchema.parse({ ...shape, rotation: -180 })).toMatchObject({
      rotation: -180
    })
    expect(canvasElementSchema.parse({ ...shape, rotation: 180 })).toMatchObject({ rotation: 180 })
  })

  it('rejects angles outside a half turn either way and non-numbers', () => {
    for (const rotation of [-181, 181, Number.NaN, Infinity, '45']) {
      expect(canvasElementSchema.safeParse({ ...shape, rotation }).success).toBe(false)
    }
  })

  it('stays off frames, which are views rather than content', () => {
    const frame = { id: 'f', type: 'frame', name: '', order: 0, x: 0, y: 0, width: 9, height: 9 }
    expect(canvasElementSchema.parse({ ...frame, rotation: 30 })).not.toHaveProperty('rotation')
  })
})
