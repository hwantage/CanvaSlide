import { describe, expect, it } from 'vitest'
import { clampSplit, defaultSplit } from './panel-split'

const limits = { minTop: 120, minBottom: 200, handle: 8 }

describe('panel-split', () => {
  it('keeps both panes at or above their minimums', () => {
    expect(clampSplit(50, 1000, limits)).toBe(120)
    expect(clampSplit(950, 1000, limits)).toBe(792)
    expect(clampSplit(400, 1000, limits)).toBe(400)
  })

  it('favours the bottom pane when the panel is too short for both minimums', () => {
    expect(clampSplit(300, 300, limits)).toBe(92)
    expect(clampSplit(0, 300, limits)).toBe(92)
  })

  it('starts with a share of the panel', () => {
    expect(defaultSplit(1000, limits)).toBe(400)
    expect(defaultSplit(250, limits)).toBe(42)
  })
})
