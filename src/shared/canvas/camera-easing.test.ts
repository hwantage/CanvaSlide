import { describe, expect, it } from 'vitest'
import { cameraEasingFn, cameraEasings, easeInOutCubic } from './camera-easing'

describe('camera-easing', () => {
  it.each(cameraEasings)('%s starts at 0 and lands exactly on 1', (kind) => {
    const ease = cameraEasingFn(kind)
    expect(ease(0)).toBeCloseTo(0, 10)
    expect(ease(1)).toBeCloseTo(1, 10)
  })

  it.each(cameraEasings)('%s clamps input outside [0,1]', (kind) => {
    const ease = cameraEasingFn(kind)
    expect(ease(-5)).toBeCloseTo(ease(0), 10)
    expect(ease(9)).toBeCloseTo(ease(1), 10)
  })

  it('defaults to the long-standing smooth curve', () => {
    expect(cameraEasingFn()(0.3)).toBe(easeInOutCubic(0.3))
    expect(cameraEasingFn('smooth')(0.7)).toBe(easeInOutCubic(0.7))
  })

  it('linear is the identity inside the range', () => {
    expect(cameraEasingFn('linear')(0.42)).toBeCloseTo(0.42, 10)
  })

  it('accelerate stays behind linear and decelerate stays ahead', () => {
    expect(cameraEasingFn('accelerate')(0.5)).toBeLessThan(0.5)
    expect(cameraEasingFn('decelerate')(0.5)).toBeGreaterThan(0.5)
  })

  it('overshoot sails past the target before settling', () => {
    const ease = cameraEasingFn('overshoot')
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => ease(i / 100)))
    expect(peak).toBeGreaterThan(1)
  })

  it.each(['smooth', 'linear', 'accelerate', 'decelerate'] as const)(
    '%s never reverses direction',
    (kind) => {
      const ease = cameraEasingFn(kind)
      for (let i = 1; i <= 100; i += 1) {
        expect(ease(i / 100)).toBeGreaterThanOrEqual(ease((i - 1) / 100))
      }
    }
  )
})
