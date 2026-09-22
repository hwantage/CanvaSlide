import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSwipeNavigation } from './swipe-navigation'

type PointerInit = {
  pointerId?: number
  pointerType?: string
  isPrimary?: boolean
  clientX?: number
  clientY?: number
  time?: number
}

/** happy-dom has no PointerEvent constructor; the binder only ever reads these fields. */
function pointer(type: string, init: PointerInit = {}): Event {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, {
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'touch',
    isPrimary: init.isPrimary ?? true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0
  })
  Object.defineProperty(event, 'timeStamp', { value: init.time ?? 0 })
  return event
}

function harness() {
  const node = document.createElement('div')
  const chrome = document.createElement('div')
  chrome.className = 'chrome'
  const button = document.createElement('button')
  const editor = document.createElement('div')
  editor.setAttribute('contenteditable', 'true')
  const label = document.createElement('div')
  label.setAttribute('contenteditable', 'false')
  node.append(chrome, button, editor, label)
  document.body.append(node)
  const next = vi.fn(() => {})
  const previous = vi.fn(() => {})
  let navigable = true
  const dispose = bindSwipeNavigation(node, {
    isNavigable: () => navigable,
    next,
    previous,
    chromeSelector: '.chrome'
  })
  return {
    node,
    chrome,
    button,
    editor,
    label,
    next,
    previous,
    dispose,
    setNavigable: (value: boolean) => {
      navigable = value
    },
    /** A flick: 220px left in 180ms by default, well inside the thresholds. */
    flick(options: { from?: HTMLElement; dx?: number; dy?: number; ms?: number } = {}) {
      const from = options.from ?? node
      from.dispatchEvent(pointer('pointerdown', { clientX: 300, clientY: 400, time: 1000 }))
      node.dispatchEvent(
        pointer('pointerup', {
          clientX: 300 + (options.dx ?? -220),
          clientY: 400 + (options.dy ?? 0),
          time: 1000 + (options.ms ?? 180)
        })
      )
    },
    press(type: string, init: PointerInit) {
      node.dispatchEvent(pointer(type, init))
    }
  }
}

let h: ReturnType<typeof harness>

beforeEach(() => {
  h = harness()
})

afterEach(() => {
  h.dispose()
  document.body.replaceChildren()
})

describe('bindSwipeNavigation', () => {
  it('steps the deck on a flick, following the finger', () => {
    h.flick()
    expect(h.next).toHaveBeenCalledOnce()
    h.flick({ dx: 220 })
    expect(h.previous).toHaveBeenCalledOnce()
  })

  it('leaves the mouse alone entirely', () => {
    h.press('pointerdown', { pointerType: 'mouse', clientX: 300, clientY: 400, time: 1000 })
    h.press('pointerup', { pointerType: 'mouse', clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('takes pen flicks', () => {
    h.press('pointerdown', { pointerType: 'pen', clientX: 300, clientY: 400, time: 1000 })
    h.press('pointerup', { pointerType: 'pen', clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).toHaveBeenCalledOnce()
  })

  it('ignores a second finger, and stays ignored after it lifts', () => {
    h.press('pointerdown', { clientX: 300, clientY: 400, time: 1000 })
    h.press('pointerdown', { pointerId: 2, isPrimary: false, clientX: 320, clientY: 500 })
    h.press('pointerup', { clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('leaves chrome and interactive slide content their own gestures', () => {
    h.flick({ from: h.chrome })
    h.flick({ from: h.button })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('leaves an editable surface alone, so selecting text cannot turn the page', () => {
    h.flick({ from: h.editor })
    expect(h.next).not.toHaveBeenCalled()
    // Why: contenteditable="false" is ordinary content, and still swipes.
    h.flick({ from: h.label })
    expect(h.next).toHaveBeenCalledOnce()
  })

  it('does nothing while the surface is not navigable', () => {
    h.setNavigable(false)
    h.flick()
    expect(h.next).not.toHaveBeenCalled()
  })

  it('does nothing when the show stops taking gestures mid-flick', () => {
    h.press('pointerdown', { clientX: 300, clientY: 400, time: 1000 })
    h.setNavigable(false)
    h.press('pointerup', { clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('never navigates on a cancelled gesture', () => {
    h.press('pointerdown', { clientX: 300, clientY: 400, time: 1000 })
    h.press('pointercancel', { clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('forgets a gesture after blur or a release outside its surface', () => {
    for (const outside of [false, true]) {
      h.press('pointerdown', { clientX: 300, clientY: 400, time: 1000 })
      if (outside) {
        window.dispatchEvent(pointer('pointerup', { clientX: 80, clientY: 400, time: 1180 }))
      } else {
        window.dispatchEvent(new Event('blur'))
      }
      h.press('pointerup', { clientX: 80, clientY: 400, time: 1180 })
      expect(h.next).not.toHaveBeenCalled()
    }
  })

  it('only answers the release of the pointer that started the gesture', () => {
    h.press('pointerdown', { clientX: 300, clientY: 400, time: 1000 })
    h.press('pointerup', { pointerId: 9, clientX: 80, clientY: 400, time: 1180 })
    expect(h.next).not.toHaveBeenCalled()
  })

  it('applies the shared thresholds', () => {
    h.flick({ dx: -40 })
    h.flick({ ms: 700 })
    h.flick({ dy: 400 })
    expect(h.next).not.toHaveBeenCalled()
    h.flick()
    expect(h.next).toHaveBeenCalledOnce()
  })

  it('stops listening once disposed', () => {
    h.dispose()
    h.flick()
    expect(h.next).not.toHaveBeenCalled()
  })
})
