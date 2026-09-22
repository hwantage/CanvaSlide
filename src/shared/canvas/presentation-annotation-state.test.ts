import { describe, expect, it, vi } from 'vitest'
import { createAnnotationSession } from './presentation-annotation-state'

describe('presentation annotation session', () => {
  it('retains ink when pointing stops or the same frame returns from overview', () => {
    const session = createAnnotationSession()
    session.setFrame('first')
    const count = session.getState().clearCount
    session.togglePointer()
    session.togglePointer()
    session.setFrame('first')
    expect(session.getState()).toEqual({ pointing: false, frameId: 'first', clearCount: count })
    session.setFrame('second')
    expect(session.getState().clearCount).toBe(count + 1)
  })

  it('erases without disarming, and clears everything on session replacement', () => {
    const session = createAnnotationSession()
    session.setFrame('first')
    session.togglePointer()
    session.clearInk()
    expect(session.getState().pointing).toBe(true)
    const before = session.getState().clearCount
    session.reset()
    expect(session.getState()).toEqual({ pointing: false, frameId: null, clearCount: before + 1 })
  })

  it('notifies with immutable snapshots and releases subscribers', () => {
    const session = createAnnotationSession()
    const listener = vi.fn()
    const before = session.getState()
    const unsubscribe = session.subscribe(listener)
    session.togglePointer()
    expect(listener).toHaveBeenCalledWith(session.getState(), before)
    expect(before.pointing).toBe(false)
    unsubscribe()
    session.reset()
    expect(listener).toHaveBeenCalledOnce()
  })
})
