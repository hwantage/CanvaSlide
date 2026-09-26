import { describe, expect, it } from 'vitest'
import {
  presentationAvailability,
  resolvePresentationCommand,
  type PresentationState
} from './presentation-controls'

const state: PresentationState = {
  index: 0,
  count: 3,
  frameId: 'first',
  name: 'First',
  overview: false
}

describe('shared presentation commands', () => {
  it('disables absent and boundary destinations while overview can return to either end', () => {
    expect(presentationAvailability(state)).toEqual({
      previous: false,
      next: true,
      toggleOverview: true
    })
    expect(presentationAvailability({ ...state, index: 2 }).next).toBe(false)
    expect(presentationAvailability({ ...state, count: 1 })).toEqual({
      previous: false,
      next: false,
      toggleOverview: true
    })
    expect(presentationAvailability({ ...state, overview: true, count: 1 })).toEqual({
      previous: true,
      next: true,
      toggleOverview: true
    })
    expect(presentationAvailability({ ...state, overview: true, count: 0 })).toEqual({
      previous: false,
      next: false,
      toggleOverview: false
    })
    expect(resolvePresentationCommand('previous', state, true)).toBeNull()
  })

  it('leaves overview before offering the host exit', () => {
    for (const exit of [false, true]) {
      expect(resolvePresentationCommand('escape', { ...state, overview: true }, exit)).toBe(
        'toggleOverview'
      )
    }
    expect(resolvePresentationCommand('escape', state, true)).toBe('exit')
    expect(resolvePresentationCommand('escape', state, false)).toBeNull()
    expect(resolvePresentationCommand('exit', state, false)).toBeNull()
  })

  it('keeps pointer and eraser available independently of the frame boundary', () => {
    expect(resolvePresentationCommand('togglePointer', state, false)).toBe('togglePointer')
    expect(resolvePresentationCommand('clearInk', state, false)).toBe('clearInk')
  })
})
