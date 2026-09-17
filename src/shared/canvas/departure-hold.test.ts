import { describe, expect, it } from 'vitest'
import { PREVIEW_DEPARTURE_HOLD_MS, previewDepartureHoldMs } from './departure-hold'

describe('previewDepartureHoldMs', () => {
  it('holds on a departure frame and flies at once when there is none', () => {
    expect(previewDepartureHoldMs(0)).toBe(PREVIEW_DEPARTURE_HOLD_MS)
    expect(previewDepartureHoldMs(4)).toBe(PREVIEW_DEPARTURE_HOLD_MS)
    expect(previewDepartureHoldMs(null)).toBe(0)
  })
})
