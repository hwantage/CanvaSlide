import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnnotationSession } from './presentation-annotation-state'
import type { PresentationState } from './presentation-controls'
import { mountPresentationExperience } from './presentation-experience'
import type { PresentationHost } from './presentation-host'

const labels = {
  controls: 'Presentation',
  toggleOverview: 'Overview',
  next: 'Next',
  previous: 'Previous',
  togglePointer: 'Pointer',
  clearInk: 'Erase',
  tools: 'Tools',
  exit: 'Exit'
}
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.useRealTimers()
})

function fixture(canExit = true) {
  vi.useFakeTimers()
  const viewport = document.createElement('div')
  document.body.append(viewport)
  const stateListeners = new Set<() => void>()
  const viewListeners = new Set<() => void>()
  const session = createAnnotationSession()
  let state: PresentationState = { index: 0, count: 2, frameId: 'a', name: 'A', overview: false }
  const host: PresentationHost = {
    getState: () => state,
    getView: () => ({
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 1000, height: 800 },
      roll: 0
    }),
    subscribeState: (listener) => {
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    },
    subscribeView: (listener) => {
      viewListeners.add(listener)
      return () => {
        viewListeners.delete(listener)
      }
    },
    next: vi.fn(),
    previous: vi.fn(),
    toggleOverview: vi.fn(),
    exit: canExit ? vi.fn() : undefined
  }
  const { dispose } = mountPresentationExperience(viewport, host, labels, session)
  cleanups.push(() => {
    dispose()
    viewport.remove()
  })
  const key = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  return {
    viewport,
    host,
    session,
    key,
    dispose,
    stateListeners,
    viewListeners,
    setState: (patch: Partial<PresentationState>) => {
      state = { ...state, ...patch }
      for (const listener of stateListeners) {
        listener()
      }
    }
  }
}

describe('shared presentation lifetime and input', () => {
  it.each([
    { key: 'ㅔ', code: 'KeyP' },
    { key: 'Process', code: 'KeyP', keyCode: 229 },
    { key: 'ㅔ', code: 'KeyP', isComposing: true },
    { key: 'Process', code: 'KeyP', keyCode: 229, isComposing: true }
  ])('accepts physical letter shortcuts on a non-editable presentation: %j', (init) => {
    const { key, session, viewport, host } = fixture()
    const bar = viewport.querySelector<HTMLElement>('[data-testid="presentation-controls"]')!
    vi.advanceTimersByTime(2000)
    expect(bar.dataset.hidden).toBe('true')
    expect(key(init.key, init)).toBe(true)
    expect(session.getState().pointing).toBe(true)
    const clearCount = session.getState().clearCount
    expect(key('ㄷ', { ...init, key: 'ㄷ', code: 'KeyE' })).toBe(true)
    expect(session.getState().clearCount).toBe(clearCount + 1)
    expect(key('ㅐ', { ...init, key: 'ㅐ', code: 'KeyO' })).toBe(true)
    expect(host.toggleOverview).toHaveBeenCalledOnce()
    expect(bar.dataset.hidden).toBe('true')
  })

  it('leaves IME editing, composition confirmation and modified shortcuts with their owners', () => {
    const { key, session, viewport, host } = fixture()
    const init = { code: 'KeyP', isComposing: true, keyCode: 229 }
    for (const selector of ['input', 'textarea', 'select', 'video', 'button']) {
      const target = document.createElement(selector)
      viewport.append(target)
      expect(key('ㅔ', init, target)).toBe(false)
      target.remove()
    }
    for (const attribute of ['contenteditable', 'dialog', 'presentation-editable']) {
      const target = document.createElement('div')
      if (attribute === 'dialog') {
        target.setAttribute('role', 'dialog')
      } else {
        target.setAttribute('contenteditable', 'true')
        if (attribute === 'presentation-editable') {
          target.dataset.presentationUi = ''
        }
      }
      const child = document.createElement('span')
      target.append(child)
      viewport.append(target)
      expect(key('ㅔ', init, child)).toBe(false)
      target.remove()
    }
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
      expect(key('ㅔ', { ...init, [modifier]: true })).toBe(false)
    }
    for (const code of ['Enter', 'Space', 'Escape', 'Tab', 'ArrowRight']) {
      expect(key(code, { ...init, code })).toBe(false)
    }
    host.isInputBlocked = () => true
    expect(key('ㅔ', init)).toBe(false)
    expect(session.getState().pointing).toBe(false)
    expect(host.next).not.toHaveBeenCalled()
    expect(host.exit).not.toHaveBeenCalled()
  })

  it('leaves Tab and focus with a modal or editable content while chrome is hidden', () => {
    const { host, key, viewport } = fixture()
    const bar = viewport.querySelector<HTMLElement>('[data-testid="presentation-controls"]')!
    vi.advanceTimersByTime(2000)
    expect(bar.dataset.hidden).toBe('true')
    host.isInputBlocked = () => true
    expect(key('Tab')).toBe(false)
    expect(bar.dataset.hidden).toBe('true')
    host.isInputBlocked = () => false
    const input = document.createElement('input')
    viewport.append(input)
    input.focus()
    expect(key('Tab', {}, input)).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(bar.dataset.hidden).toBe('true')
    key('Tab')
    expect(bar.dataset.hidden).toBe('false')
  })

  it('only consumes available commands and respects native controls, modifiers and media', () => {
    const { host, key, session, viewport } = fixture(false)
    expect(key('ArrowLeft')).toBe(false)
    expect(key('Escape')).toBe(false)
    expect(key('q')).toBe(false)
    expect(key('p', { ctrlKey: true })).toBe(false)
    expect(key('p', { metaKey: true })).toBe(false)
    expect(key('p', { isComposing: true })).toBe(false)
    const mediaEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', mediaEscape, true)
    expect(key('Escape')).toBe(true)
    window.removeEventListener('keydown', mediaEscape, true)
    const button = viewport.querySelector('button')!
    expect(key('Enter', {}, button)).toBe(false)
    const input = document.createElement('input')
    viewport.append(input)
    expect(key('p', {}, input)).toBe(false)
    expect(session.getState().pointing).toBe(false)
    expect(key('p')).toBe(true)
    expect(session.getState().pointing).toBe(true)
    expect(key('ArrowRight')).toBe(true)
    expect(host.next).toHaveBeenCalledOnce()
  })

  it('cancels native touch handling only for an owned ink stroke', () => {
    const { key, host, viewport, setState, dispose } = fixture()
    const pointer = (type: string, target: EventTarget = viewport) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: 1
        })
      )
    const touch = (target: EventTarget = viewport) => {
      const event = new Event('touchstart', { bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    pointer('pointerdown')
    expect(touch()).toBe(false)
    pointer('pointerup')
    key('p')
    const button = viewport.querySelector('button')!
    const video = document.createElement('video')
    viewport.append(video)
    for (const target of [button, video]) {
      pointer('pointerdown', target)
      expect(touch(target)).toBe(false)
      pointer('pointerup', target)
    }
    setState({ overview: true })
    pointer('pointerdown')
    expect(touch()).toBe(false)
    setState({ overview: false })
    host.isInputBlocked = () => true
    pointer('pointerdown')
    expect(touch()).toBe(false)
    host.isInputBlocked = () => false
    pointer('pointerdown')
    expect(touch()).toBe(true)
    expect(touch(button)).toBe(false)
    expect(touch(video)).toBe(false)
    pointer('pointercancel')
    expect(touch()).toBe(false)
    pointer('pointerdown')
    expect(touch()).toBe(true)
    dispose()
    expect(touch()).toBe(false)
  })

  it('unsubscribes views, stops timers and removes all session input on teardown', () => {
    const { host, key, session, dispose, stateListeners, viewListeners, viewport } = fixture()
    key('p')
    expect(viewport.querySelector('[data-testid="laser-pointer"]')).not.toBeNull()
    dispose()
    expect(stateListeners.size).toBe(0)
    expect(viewListeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(viewport.children).toHaveLength(0)
    expect(session.getState().pointing).toBe(false)
    expect(key('p')).toBe(false)
    key('ArrowRight')
    expect(host.next).not.toHaveBeenCalled()
  })

  it('restores overview before exit and clears by frame identity rather than navigation index', () => {
    const { host, key, session, setState } = fixture()
    const initial = session.getState().clearCount
    setState({ overview: true })
    expect(key('Escape')).toBe(true)
    expect(host.toggleOverview).toHaveBeenCalledOnce()
    expect(host.exit).not.toHaveBeenCalled()
    setState({ overview: false, index: 1 })
    expect(session.getState().clearCount).toBe(initial)
    setState({ frameId: 'b' })
    expect(session.getState().clearCount).toBe(initial + 1)
    key('Escape')
    expect(host.exit).toHaveBeenCalledOnce()
  })
})
