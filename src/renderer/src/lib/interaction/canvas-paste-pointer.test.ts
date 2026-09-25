import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { createCanvasPastePointer, type CanvasPastePointer } from './canvas-paste-pointer'

let viewport: HTMLElement
let target: Element | null
let cleanup: () => void
let pastePointer: CanvasPastePointer
const move = (x: number, y: number) =>
  viewport.dispatchEvent(
    new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true })
  )

describe('canvas paste pointer', () => {
  beforeEach(() => {
    viewport = document.createElement('div')
    document.body.append(viewport)
    target = viewport
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 800, 600))
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target)
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
    pastePointer = createCanvasPastePointer()
    cleanup = pastePointer.track(viewport)
  })
  afterEach(() => {
    cleanup()
    viewport.remove()
    vi.restoreAllMocks()
  })

  it('counts coordinate changes, not duplicate events or camera movement', () => {
    move(300, 250)
    const first = pastePointer.read()
    expect(first.world).toEqual({ x: 200, y: 200 })
    move(300, 250)
    expect(pastePointer.read().revision).toBe(first.revision)
    useCameraStore.setState({ camera: { x: -1000, y: 500, zoom: 2 } })
    expect(pastePointer.read()).toEqual({ revision: first.revision, world: { x: 600, y: -150 } })
    move(350, 250)
    expect(pastePointer.read().revision).toBe(first.revision + 1)
  })

  it('rejects outside coordinates even when pointer capture targets the viewport', () => {
    move(400, 300)
    move(950, 300)
    expect(pastePointer.read().world).toBeNull()
    move(400, 300)
    expect(pastePointer.read().world).toEqual({ x: 300, y: 250 })
  })

  it('rejects overlays, editing targets and occluding panels at paste time', () => {
    move(400, 300)
    const overlay = document.createElement('div')
    overlay.dataset.canvasUi = ''
    viewport.append(overlay)
    target = overlay
    expect(pastePointer.read().world).toBeNull()
    const input = document.createElement('input')
    viewport.append(input)
    target = input
    expect(pastePointer.read().world).toBeNull()
    target = document.body
    expect(pastePointer.read().world).toBeNull()
  })

  it('clears stale locations when leaving the window, losing focus or unmounting', () => {
    move(400, 300)
    document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null }))
    expect(pastePointer.read().world).toBeNull()
    move(400, 300)
    window.dispatchEvent(new Event('blur'))
    expect(pastePointer.read().world).toBeNull()
    move(400, 300)
    cleanup()
    expect(pastePointer.read().world).toBeNull()
  })

  it('counts moves along either axis and presses, but not moves over overlays or text fields', () => {
    move(400, 300)
    const { revision } = pastePointer.read()
    move(400, 310)
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 400, clientY: 320, bubbles: true })
    )
    expect(pastePointer.read().revision).toBe(revision + 2)
    const overlay = document.createElement('div')
    overlay.dataset.canvasUi = ''
    const input = document.createElement('input')
    viewport.append(overlay, input)
    for (const [element, x] of [
      [overlay, 500],
      [input, 600]
    ] as const) {
      element.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: 300, bubbles: true })
      )
    }
    expect(pastePointer.read().revision).toBe(revision + 2)
  })

  it('forgets touch positions and the right and bottom edges, but not moves between elements', () => {
    move(400, 300)
    const { revision } = pastePointer.read()
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 450,
        clientY: 300,
        pointerType: 'touch',
        bubbles: true
      })
    )
    expect(pastePointer.read()).toEqual({ revision, world: null })
    move(899, 300)
    expect(pastePointer.read().world).toEqual({ x: 799, y: 250 })
    move(900, 300)
    expect(pastePointer.read().world).toBeNull()
    move(400, 650)
    expect(pastePointer.read().world).toBeNull()
    move(400, 300)
    document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: viewport }))
    expect(pastePointer.read().world).toEqual({ x: 300, y: 250 })
  })

  it('keeps counting across remounts and lets only the current tracking clear the reader', () => {
    move(400, 300)
    const { revision } = pastePointer.read()
    cleanup()
    const next = document.createElement('div')
    document.body.append(next)
    vi.spyOn(next, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
    const stopNext = pastePointer.track(next)
    target = next
    next.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 20, bubbles: true }))
    expect(pastePointer.read()).toEqual({ revision: revision + 1, world: { x: 10, y: 20 } })
    const stopLater = pastePointer.track(viewport)
    stopNext()
    target = viewport
    move(300, 250)
    expect(pastePointer.read().world).toEqual({ x: 200, y: 200 })
    stopLater()
    expect(pastePointer.read().world).toBeNull()
    next.remove()
  })

  it('stops listening when tracking ends', () => {
    move(400, 300)
    const { revision } = pastePointer.read()
    cleanup()
    cleanup = pastePointer.track(viewport)
    move(450, 300)
    expect(pastePointer.read().revision).toBe(revision + 1)
  })

  it('shares no state between separately created pointers', () => {
    move(400, 300)
    expect(createCanvasPastePointer().read()).toEqual({ revision: 0, world: null })
  })
})
