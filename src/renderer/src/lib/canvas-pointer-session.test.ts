import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasPointerSession } from './canvas-pointer-session'

const sessions: ReturnType<typeof createCanvasPointerSession>[] = []
afterEach(() => {
  for (const session of sessions) {
    session.dispose()
  }
  sessions.length = 0
})

function setup() {
  const callbacks = { move: vi.fn(), finish: vi.fn(), cancel: vi.fn() }
  const session = createCanvasPointerSession(callbacks)
  sessions.push(session)
  const target = document.createElement('div')
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn()
  })
  return { session, callbacks, target }
}

function pointer(type: string, values: PointerEventInit = {}) {
  return new PointerEvent(type, { pointerId: 7, isPrimary: true, button: 0, buttons: 1, ...values })
}

describe('canvas pointer ownership', () => {
  it.each([
    { button: 1, isPrimary: true, accepted: true, prevented: true },
    { button: 0, isPrimary: true, accepted: true, prevented: false },
    { button: 1, isPrimary: true, accepted: false, prevented: false },
    { button: 1, isPrimary: false, accepted: true, prevented: false }
  ])(
    'suppresses native middle-button actions only for an accepted pan: %j',
    ({ button, isPrimary, accepted, prevented }) => {
      const { session, target } = setup()
      const event = pointer('pointerdown', { button, isPrimary, cancelable: true })
      session.start(event, target, () => accepted)
      expect(event.defaultPrevented).toBe(prevented)
      const release = pointer('pointerup', { button, buttons: 0, cancelable: true })
      window.dispatchEvent(release)
      expect(release.defaultPrevented).toBe(prevented)
      const click = pointer('auxclick', { button, buttons: 0, cancelable: true })
      window.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(prevented)
    }
  )

  it.each([false, true])('suppresses native middle release after cancellation=%s', (cancelled) => {
    const { session, target, callbacks } = setup()
    session.start(pointer('pointerdown', { button: 1, buttons: 4 }), target, () => true)
    if (cancelled) {
      session.cancel()
    }
    const foreign = pointer('pointerup', {
      pointerId: 99,
      button: 1,
      buttons: 0,
      cancelable: true
    })
    window.dispatchEvent(foreign)
    expect(foreign.defaultPrevented).toBe(false)
    const release = pointer('pointerup', { button: 1, buttons: 0, cancelable: true })
    window.dispatchEvent(release)
    expect(release.defaultPrevented).toBe(true)
    expect(callbacks.finish).toHaveBeenCalledTimes(cancelled ? 0 : 1)
    const click = pointer('auxclick', { button: 1, buttons: 0, cancelable: true })
    window.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    const unrelated = pointer('pointerup', { button: 1, buttons: 0, cancelable: true })
    window.dispatchEvent(unrelated)
    expect(unrelated.defaultPrevented).toBe(false)
  })

  it.each(['fresh press', 'dispose'])('clears a pending middle release on %s', (reason) => {
    const { session, target } = setup()
    session.start(pointer('pointerdown', { button: 1, buttons: 4 }), target, () => true)
    session.cancel()
    if (reason === 'dispose') {
      session.dispose()
    } else {
      window.dispatchEvent(pointer('pointerdown'))
    }
    const release = pointer('pointerup', { button: 1, buttons: 0, cancelable: true })
    window.dispatchEvent(release)
    expect(release.defaultPrevented).toBe(false)
  })

  it('does not repeat the last move on release, but applies changed modifiers', () => {
    const { session, callbacks, target } = setup()
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointermove', { button: -1, clientX: 100, clientY: 80 }))
    window.dispatchEvent(pointer('pointerup', { buttons: 0, clientX: 100, clientY: 80 }))
    expect(callbacks.move).toHaveBeenCalledTimes(1)
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointermove', { button: -1, clientX: 100, clientY: 80 }))
    window.dispatchEvent(
      pointer('pointerup', { buttons: 0, clientX: 100, clientY: 80, shiftKey: true })
    )
    expect(callbacks.move).toHaveBeenCalledTimes(3)
    expect(callbacks.move.mock.lastCall?.[0].shiftKey).toBe(true)
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointerup', { buttons: 0, shiftKey: true }))
    expect(callbacks.move).toHaveBeenCalledTimes(3)
  })

  it('finishes on the initiating button release while another button stays down', () => {
    const { session, callbacks, target } = setup()
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointermove', { button: 2, buttons: 3 }))
    expect(callbacks.finish).not.toHaveBeenCalled()
    window.dispatchEvent(pointer('pointermove', { button: 0, buttons: 2 }))
    expect(callbacks.finish).toHaveBeenCalledTimes(1)
    window.dispatchEvent(pointer('pointerup', { button: 2, buttons: 0 }))
    expect(callbacks.finish).toHaveBeenCalledTimes(1)
    expect(session.isActive()).toBe(false)
  })

  it('abandons a missed release when a fresh press arrives, without completing it', () => {
    const { session, callbacks, target } = setup()
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointermove', { button: -1, buttons: 0 }))
    expect(callbacks.finish).not.toHaveBeenCalled()
    window.dispatchEvent(pointer('pointerdown'))
    expect(callbacks.cancel).toHaveBeenCalledTimes(1)
    expect(session.isActive()).toBe(false)
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointerup', { buttons: 0 }))
    expect(callbacks.finish).toHaveBeenCalledTimes(1)
  })

  it('uses window release when the browser no longer allows pointer capture', () => {
    const { session, callbacks, target } = setup()
    target.setPointerCapture = () => {
      throw new DOMException('Inactive pointer', 'NotFoundError')
    }
    session.start(pointer('pointerdown'), target, () => true)
    window.dispatchEvent(pointer('pointerup', { buttons: 0 }))
    expect(callbacks.finish).toHaveBeenCalledTimes(1)
    expect(callbacks.cancel).not.toHaveBeenCalled()
  })

  it('does not capture ignored starts or let another pointer acquire an active session', () => {
    const { session, target } = setup()
    const begin = vi.fn(() => true)
    session.start(pointer('pointerdown', { button: 2 }), target, begin)
    session.start(pointer('pointerdown', { isPrimary: false }), target, begin)
    expect(begin).not.toHaveBeenCalled()
    session.start(pointer('pointerdown'), target, () => false)
    expect(target.setPointerCapture).not.toHaveBeenCalled()
    session.start(pointer('pointerdown'), target, begin)
    session.start(pointer('pointerdown', { pointerId: 99 }), target, begin)
    expect(begin).toHaveBeenCalledTimes(1)
    expect(target.setPointerCapture).toHaveBeenCalledTimes(1)
  })
})
