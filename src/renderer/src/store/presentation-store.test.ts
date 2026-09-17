import { prepareCameraFlight } from '@/lib/camera-flight-preparation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_DEPARTURE_HOLD_MS } from '@shared/canvas/departure-hold'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { useCameraStore } from './camera-store'
import { useDocumentStore } from './document-store'
import { frameCamera } from './presentation-shot'
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

// Keep image preparation independent of the store's departure paint and hold clock.
vi.mock('@/lib/camera-flight-preparation', () => ({
  prepareCameraFlight: vi.fn(() => ({ ready: Promise.resolve(), release: () => {} }))
}))

const prepare = () => vi.advanceTimersByTimeAsync(32)
const land = async () => {
  await prepare()
  await vi.advanceTimersByTimeAsync(PREVIEW_DEPARTURE_HOLD_MS)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useCameraStore.getState().setViewport({ width: 1000, height: 800 })
  useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
  usePresentationStore.setState({
    active: false,
    index: 0,
    cameraBeforeStart: null,
    previewFrameId: null,
    spotlightRect: null
  })
})

afterEach(() => {
  usePresentationStore.getState().exit()
  useCameraStore.getState().cancelAnimation()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('presentation-store', () => {
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

  it('previews the flight into a frame and stays there so it can be replayed', async () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.updateSettings({ transitionMs: 0 })
    doc.setSelection(['b'])
    useCameraStore.getState().setCamera({ x: 123, y: 456, zoom: 2 })
    const presentation = usePresentationStore.getState()

    presentation.previewTransition('b')
    await land()
    // It has flown, and it waits there rather than snapping the editor back.
    expect(usePresentationStore.getState()).toMatchObject({
      active: true,
      index: 1,
      previewFrameId: 'b'
    })
    // The frame stays selected: its properties are what the author is here to adjust.
    expect(useDocumentStore.getState().selectedIds).toEqual(['b'])

    // Replaying keeps the camera to return to, rather than recording the preview's own.
    presentation.previewTransition('b')
    expect(usePresentationStore.getState().cameraBeforeStart).toMatchObject({ x: 123, y: 456 })

    presentation.exit()
    expect(usePresentationStore.getState()).toMatchObject({ active: false, previewFrameId: null })
  })

  it('drops a preview where it stands when the editor takes the camera', async () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.updateSettings({ transitionMs: 0 })
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await land()
    const parked = useCameraStore.getState().camera

    presentation.cancelPreview()
    expect(usePresentationStore.getState()).toMatchObject({
      active: false,
      previewFrameId: null,
      roll: 0,
      spotlight: 0
    })
    // No flight home: the caller is about to move the camera itself.
    expect(useCameraStore.getState().camera).toEqual(parked)
  })

  it('follows the frame it was asked about, not its place in the deck', async () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.insertElement(frame('c', 3, 10_000))
    doc.updateSettings({ transitionMs: 0 })
    const presentation = usePresentationStore.getState()

    presentation.previewTransition('c')
    await land()
    expect(usePresentationStore.getState()).toMatchObject({ index: 2, previewFrameId: 'c' })

    // The list can be reordered while the preview is parked; replaying still means "into c".
    doc.moveFrameTo('c', 0)
    presentation.previewTransition('c')
    expect(usePresentationStore.getState()).toMatchObject({ index: 0, previewFrameId: 'c' })
  })

  it('keeps the spotlight cut-out on the frame a flight departs from', () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.updateSettings({ transitionMs: 800, spotlight: 0 })
    doc.patchElements(['a'], { transition: { spotlight: 0.5 } })
    const rectA = { x: 0, y: 0, width: 400, height: 300 }
    usePresentationStore.setState({
      active: true,
      index: 0,
      spotlight: 0.5,
      spotlightRect: rectA
    })

    // Why: handing the hole to the target up front blacks the screen out the instant it starts.
    usePresentationStore.getState().next()
    expect(usePresentationStore.getState().spotlightRect).toEqual(rectA)

    // A cut has no room to travel, so it arrives on the target's own rect.
    doc.updateSettings({ transitionMs: 0 })
    usePresentationStore.setState({ index: 0, spotlight: 0.5, spotlightRect: rectA })
    usePresentationStore.getState().next()
    expect(usePresentationStore.getState().spotlightRect).toMatchObject({ x: 5000 })
  })

  it('refuses to preview while a slide show is running', () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.updateSettings({ transitionMs: 0 })
    usePresentationStore.getState().start()
    usePresentationStore.getState().previewTransition('a')
    expect(usePresentationStore.getState().previewFrameId).toBeNull()
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

  it('re-fits the frame a parked preview owns after the list reorders underneath it', async () => {
    const doc = useDocumentStore.getState()
    doc.loadDocument(createEmptyDocument(), null)
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.insertElement(frame('c', 3, 10_000))
    doc.updateSettings({ transitionMs: 0 })
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('c')
    await land()
    const parked = useCameraStore.getState().camera

    // The deck stays editable under a parked preview, so the index it flew on goes stale.
    doc.moveFrameTo('c', 0)
    presentation.refitToViewport()

    expect(usePresentationStore.getState()).toMatchObject({ index: 0, previewFrameId: 'c' })
    expect(useCameraStore.getState().camera.x).toBeCloseTo(parked.x, 6)
    presentation.exit()
  })

  it('drops a parked preview whose frame was deleted instead of refitting onto its successor', async () => {
    const doc = useDocumentStore.getState()
    doc.loadDocument(createEmptyDocument(), null)
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.updateSettings({ transitionMs: 0 })
    useCameraStore.getState().setViewport({ width: 1000, height: 800 })
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await land()
    const parked = useCameraStore.getState().camera

    // Only Escape is reserved during a preview, so Delete reaches the editor and cuts the frame.
    doc.setSelection(['b'])
    doc.deleteSelected()
    presentation.refitToViewport()

    expect(usePresentationStore.getState()).toMatchObject({
      active: false,
      previewFrameId: null,
      roll: 0,
      spotlight: 0
    })
    expect(useCameraStore.getState().camera).toEqual(parked)
  })
})

describe('preview departure hold', () => {
  const viewport = { width: 1000, height: 800 }
  const deck = () => {
    const doc = useDocumentStore.getState()
    doc.insertElement(frame('a', 1, 0))
    doc.insertElement(frame('b', 2, 5000))
    doc.insertElement(frame('c', 3, 10_000))
    doc.updateSettings({ transitionMs: 0 })
    // The departing frame's own tilt is what the hold has to show.
    doc.patchElements(['a'], { transition: { roll: 10 } })
  }
  const landingOn = (index: number) =>
    frameCamera(useDocumentStore.getState().document, index, viewport)

  it('keeps the editor camera and shot until the departure images are ready', async () => {
    deck()
    let ready!: () => void
    vi.mocked(prepareCameraFlight).mockImplementationOnce(() => ({
      ready: new Promise<void>((resolve) => {
        ready = resolve
      }),
      release: vi.fn()
    }))
    const before = useCameraStore.getState().camera
    usePresentationStore.getState().previewTransition('b')
    await vi.advanceTimersByTimeAsync(1000)
    expect(useCameraStore.getState().camera).toBe(before)
    expect(usePresentationStore.getState().roll).toBe(0)
    ready()
    await prepare()
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
    expect(usePresentationStore.getState().roll).toBe(10)
    await vi.advanceTimersByTimeAsync(500)
    expect(useCameraStore.getState().camera).toEqual(landingOn(1))
  })

  it('rests on the departure frame for the whole hold, then flies', async () => {
    deck()
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await prepare()
    expect(usePresentationStore.getState()).toMatchObject({
      active: true,
      index: 1,
      roll: 10,
      previewFrameId: 'b'
    })
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
    expect(useCameraStore.getState().isAnimating()).toBe(true)
    await vi.advanceTimersByTimeAsync(PREVIEW_DEPARTURE_HOLD_MS - 1)
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
    expect(usePresentationStore.getState().roll).toBe(10)

    await vi.advanceTimersByTimeAsync(1)
    expect(useCameraStore.getState().camera).toEqual(landingOn(1))
    expect(usePresentationStore.getState().roll).toBe(0)
    expect(useCameraStore.getState().isAnimating()).toBe(false)
  })

  it('flies the opening frame at once, since it departs from the editor itself', () => {
    deck()
    usePresentationStore.getState().previewTransition('a')
    expect(usePresentationStore.getState()).toMatchObject({ index: 0, roll: 10 })
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
    expect(useCameraStore.getState().isAnimating()).toBe(false)
  })

  it('clears the previous shot when cutting to a neutral opening frame', async () => {
    deck()
    const doc = useDocumentStore.getState()
    doc.patchElements(['a'], { transition: { roll: 0, spotlight: 0 } })
    doc.patchElements(['b'], { transition: { roll: 10, spotlight: 0.6 } })
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await land()
    expect(usePresentationStore.getState()).toMatchObject({ roll: 10, spotlight: 0.6 })
    presentation.previewTransition('a')
    expect(usePresentationStore.getState()).toMatchObject({
      roll: 0,
      spotlight: 0,
      spotlightRect: null
    })
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
  })

  it('drops the pending flight when the preview is closed during the hold', async () => {
    deck()
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await prepare()
    presentation.exit()
    await land()
    expect(usePresentationStore.getState()).toMatchObject({ active: false, previewFrameId: null })
    expect(useCameraStore.getState().camera).not.toEqual(landingOn(1))
  })

  it('drops the pending flight when the editor takes the camera during the hold', async () => {
    deck()
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await prepare()
    presentation.cancelPreview()
    expect(useCameraStore.getState().isAnimating()).toBe(false)
    await land()
    expect(usePresentationStore.getState()).toMatchObject({ active: false })
    expect(useCameraStore.getState().camera).toEqual(landingOn(0))
  })

  it('restarts the clock on the new frame when another preview is asked for mid-hold', async () => {
    deck()
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('b')
    await prepare()
    await vi.advanceTimersByTimeAsync(PREVIEW_DEPARTURE_HOLD_MS / 2)
    presentation.previewTransition('c')
    expect(usePresentationStore.getState()).toMatchObject({ index: 2, previewFrameId: 'c' })
    await prepare()
    expect(useCameraStore.getState().camera).toEqual(landingOn(1))
    // The first hold would have run out by now; it must not fly into b.
    await vi.advanceTimersByTimeAsync(PREVIEW_DEPARTURE_HOLD_MS / 2)
    expect(useCameraStore.getState().camera).toEqual(landingOn(1))
    await vi.advanceTimersByTimeAsync(PREVIEW_DEPARTURE_HOLD_MS / 2)
    expect(useCameraStore.getState().camera).toEqual(landingOn(2))
  })

  it('lets a slide show that starts during the hold keep the camera', async () => {
    deck()
    const presentation = usePresentationStore.getState()
    presentation.previewTransition('c')
    await prepare()
    presentation.start()
    expect(useCameraStore.getState().isAnimating()).toBe(false)
    await land()
    expect(usePresentationStore.getState()).toMatchObject({
      active: true,
      index: 0,
      previewFrameId: null
    })
    expect(useCameraStore.getState().camera).not.toEqual(landingOn(2))
  })
})
