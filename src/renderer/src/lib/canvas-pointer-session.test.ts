import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasPointerSession } from './canvas-pointer-session'

const sessions: ReturnType<typeof createCanvasPointerSession>[] = []
afterEach(() => {
  for (const session of sessions) {
    session.cancel()
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
