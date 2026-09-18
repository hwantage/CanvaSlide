import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { canvasPastePointer, trackCanvasPastePointer } from './canvas-paste-pointer'

let viewport: HTMLElement
let target: Element | null
let cleanup: () => void
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
    cleanup = trackCanvasPastePointer(viewport)
  })
  afterEach(() => {
    cleanup()
    viewport.remove()
    vi.restoreAllMocks()
  })

  it('counts coordinate changes, not duplicate events or camera movement', () => {
    move(300, 250)
    const first = canvasPastePointer()
    expect(first.world).toEqual({ x: 200, y: 200 })
    move(300, 250)
    expect(canvasPastePointer().revision).toBe(first.revision)
    useCameraStore.setState({ camera: { x: -1000, y: 500, zoom: 2 } })
    expect(canvasPastePointer()).toEqual({ revision: first.revision, world: { x: 600, y: -150 } })
    move(350, 250)
    expect(canvasPastePointer().revision).toBe(first.revision + 1)
  })

  it('rejects outside coordinates even when pointer capture targets the viewport', () => {
    move(400, 300)
    move(950, 300)
    expect(canvasPastePointer().world).toBeNull()
    move(400, 300)
    expect(canvasPastePointer().world).toEqual({ x: 300, y: 250 })
  })

  it('rejects overlays, editing targets and occluding panels at paste time', () => {
    move(400, 300)
    const overlay = document.createElement('div')
    overlay.dataset.canvasUi = ''
    viewport.append(overlay)
    target = overlay
    expect(canvasPastePointer().world).toBeNull()
    const input = document.createElement('input')
    viewport.append(input)
    target = input
    expect(canvasPastePointer().world).toBeNull()
    target = document.body
    expect(canvasPastePointer().world).toBeNull()
  })

  it('clears stale locations when leaving the window, losing focus or unmounting', () => {
    move(400, 300)
    document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null }))
    expect(canvasPastePointer().world).toBeNull()
    move(400, 300)
    window.dispatchEvent(new Event('blur'))
    expect(canvasPastePointer().world).toBeNull()
    move(400, 300)
    cleanup()
    expect(canvasPastePointer().world).toBeNull()
  })
})
