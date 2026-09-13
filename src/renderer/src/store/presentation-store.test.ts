import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'
import { usePresentationStore } from './presentation-store'

const frame = (id: string, order: number, x: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order,
  x,
  y: 0,
  width: 400,
  height: 300
})

describe('presentation-store', () => {
  beforeEach(() => {
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
    usePresentationStore.setState({ active: false, index: 0, cameraBeforeStart: null })
  })

  it('refuses to start without frames', () => {
    usePresentationStore.getState().start()
    expect(usePresentationStore.getState().active).toBe(false)
  })

  it('walks frames in order and clamps at both ends', () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('b', 2, 5000))
    doc.insertElement(frame('a', 1, 0))
    doc.updateSettings({ transitionMs: 0 })
    const presentation = usePresentationStore.getState()
    presentation.start()
    expect(usePresentationStore.getState()).toMatchObject({ active: true, index: 0 })
    presentation.flyToCurrent()
    const first = useCameraStore.getState().camera
    expect(first.zoom).toBeCloseTo(1000 / (400 * 1.08), 6)
    presentation.previous()
    expect(usePresentationStore.getState().index).toBe(0)
    presentation.next()
    expect(usePresentationStore.getState().index).toBe(1)
    const second = useCameraStore.getState().camera
    expect(second.x).toBeLessThan(first.x)
    presentation.next()
    expect(usePresentationStore.getState().index).toBe(1)
  })

  it('restores the pre-presentation camera on exit', () => {
    useDocumentStore.getState().insertElement(frame('a', 1, 0))
    useDocumentStore.getState().updateSettings({ transitionMs: 0 })
    useCameraStore.getState().setCamera({ x: 123, y: 456, zoom: 2 })
    const presentation = usePresentationStore.getState()
    presentation.start()
    presentation.flyToCurrent()
    expect(useCameraStore.getState().camera.x).not.toBe(123)
    presentation.exit()
    expect(usePresentationStore.getState().active).toBe(false)
  })
})

describe('presentation overview', () => {
  it('zooms out to the whole board and jumps back to a clicked frame', () => {
    const doc = useDocumentStore.getState()
    doc.loadDocument(createEmptyDocument(), null)
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.updateSettings({ transitionMs: 0 })
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    const presentation = usePresentationStore.getState()
    presentation.start()
    presentation.flyToCurrent()
    const frameZoom = useCameraStore.getState().camera.zoom
    presentation.showOverview()
    expect(usePresentationStore.getState().overview).toBe(true)
    expect(useCameraStore.getState().camera.zoom).toBeLessThan(frameZoom)
    presentation.goTo(1)
    expect(usePresentationStore.getState()).toMatchObject({ overview: false, index: 1 })
    expect(useCameraStore.getState().camera.zoom).toBeCloseTo(frameZoom, 9)
    presentation.toggleOverview()
    expect(usePresentationStore.getState().overview).toBe(true)
    presentation.next()
    expect(usePresentationStore.getState().overview).toBe(false)
  })
})

describe('presentation refit', () => {
  it('re-fits the current frame when the viewport changes (fullscreen transition)', () => {
    const doc = useDocumentStore.getState()
    doc.loadDocument(createEmptyDocument(), null)
    doc.insertElement(frame('a', 1, 0))
    doc.updateSettings({ transitionMs: 0 })
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    const presentation = usePresentationStore.getState()
    presentation.start()
    presentation.flyToCurrent()
    const small = useCameraStore.getState().camera
    useCameraStore.getState().setViewport({ width: 2000, height: 1200 })
    presentation.refitToViewport()
    const large = useCameraStore.getState().camera
    // 400×300 frame with 4% padding: width-limited at 1000×800, height-limited at 2000×1200.
    expect(small.zoom).toBeCloseTo(1000 / 432, 6)
    expect(large.zoom).toBeCloseTo(1200 / 324, 6)
    presentation.exit()
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    presentation.refitToViewport()
    expect(useCameraStore.getState().camera.zoom).toBeCloseTo(large.zoom, 6)
  })
})
