import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA_ARC } from '@shared/canvas/element-types'
import type { ResolvedFrameTransition } from '@shared/canvas/frame-transition'
import { setLocale } from '@/i18n/ui-strings'
import { motionSummary, motionValueLabel, rollOptions } from './motion-presets'

const resolved = (patch: Partial<ResolvedFrameTransition> = {}): ResolvedFrameTransition => ({
  ms: 1000,
  easing: 'smooth',
  arc: DEFAULT_CAMERA_ARC,
  roll: 0,
  spotlight: 0,
  ...patch
})

beforeEach(() => setLocale('en'))

describe('motionValueLabel', () => {
  it('names the step when the value is on one', () => {
    expect(motionValueLabel('spotlight', resolved({ spotlight: 1 }))).toBe('High')
    expect(motionValueLabel('ms', resolved({ ms: 400 }))).toBe('Fast')
  })

  it('reads a tilt as a direction and a strength', () => {
    expect(motionValueLabel('roll', resolved({ roll: -15 }))).toBe('Left Mid')
    expect(motionValueLabel('roll', resolved({ roll: 5 }))).toBe('Right Low')
    expect(motionValueLabel('roll', resolved({ roll: 0 }))).toBe('None')
  })

  it('falls back to the number for a value the steps cannot express', () => {
    expect(motionValueLabel('ms', resolved({ ms: 1700 }))).toBe('1.7s')
    expect(motionValueLabel('roll', resolved({ roll: 22 }))).toBe('22°')
    expect(motionValueLabel('spotlight', resolved({ spotlight: 0.35 }))).toBe('35%')
  })
})

describe('motionSummary', () => {
  it('names every field that differs from the document', () => {
    expect(motionSummary(['roll', 'spotlight'], resolved({ roll: 5, spotlight: 0.5 }))).toBe(
      'Roll Right Low · Spotlight Mid'
    )
  })
})

describe('rollOptions', () => {
  it('runs as one scale from left, through none, to right', () => {
    expect(rollOptions().map((option) => option.value)).toEqual([-30, -15, -5, 0, 5, 15, 30])
    expect(rollOptions().map((option) => option.label)).toEqual([
      'Left High',
      'Left Mid',
      'Left Low',
      'None',
      'Right Low',
      'Right Mid',
      'Right High'
    ])
  })
})
