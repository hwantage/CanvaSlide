import { describe, expect, it } from 'vitest'
import { documentSettingsSchema, frameTransitionSchema } from './element-types'

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
