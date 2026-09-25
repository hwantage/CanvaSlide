import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { createVideoFocus } from '@shared/canvas/video-focus'
import { contentBounds } from '@shared/canvas/element-bounds'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type Size
} from '@shared/canvas/element-types'
import { fitRectToViewport } from '@shared/canvas/frame-fit'
import { frameCamera } from '@shared/canvas/presentation-shot'
import { SETTLE_MS } from '@shared/presentation/presentation-navigator'
import { REFIT_DELAY_MS } from '@shared/presentation/viewport-refit'
import { createPlayerPresentation } from './player-presentation'

// Records which frame's videos are live and hands the tests the player's video focus.
const videos = vi.hoisted(() => ({
  shown: [] as (string | null)[],
  focus: null as ReturnType<typeof createVideoFocus> | null
}))
vi.mock('./player-video', () => ({
  createPlayerVideos: (
    _doc: unknown,
    _root: unknown,
    focus: ReturnType<typeof createVideoFocus>
  ) => {
    videos.focus = focus
    return { show: (id: string | null) => videos.shown.push(id), dispose: () => {} }
  }
}))

const frame = (id: string, x: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order: x,
  x,
  y: 0,
  width: 400,
  height: 300
})
const rectangle = (id: string, x: number): CanvasElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x,
  y: 0,
  width: 400,
  height: 300,
  style: defaultShapeStyle,
  text: '',
  textStyle: defaultTextStyle
})

const video = (id: string, x: number): CanvasElement => ({
  id,
  type: 'video',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  x,
  y: 50,
  width: 160,
  height: 90
})

function board(elements: CanvasElement[], transitionMs = 400): CanvasDocument {
  const doc = createEmptyDocument()
  for (const item of elements) {
    doc.elements[item.id] = item
    doc.order.push(item.id)
  }
  doc.settings.transitionMs = transitionMs
  return doc
}

let size: Size
function mount(doc: CanvasDocument) {
  const viewport = document.createElement('div')
  Object.defineProperty(viewport, 'clientWidth', { get: () => size.width })
  Object.defineProperty(viewport, 'clientHeight', { get: () => size.height })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  return createPlayerPresentation(doc, {
    viewport,
    stage: document.createElement('div'),
    world: document.createElement('div'),
    zoomLayer: document.createElement('div'),
    spotlight: svg,
    spotlightPath: document.createElementNS('http://www.w3.org/2000/svg', 'path'),
    frameNodes: []
  })
}

beforeEach(() => {
  size = { width: 1000, height: 800 }
  videos.shown = []
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance'
    ]
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('player presentation', () => {
  const deck = (transitionMs?: number) => board([frame('a', 0), frame('b', 5000)], transitionMs)
  const fits = (camera: { x: number; zoom: number }, target: { x: number; zoom: number }) =>
    Math.abs(camera.x - target.x) < 1e-6 && Math.abs(camera.zoom - target.zoom) < 1e-9

  it('opens on the first frame without a flight', () => {
    const doc = deck()
    const presentation = mount(doc)
    presentation.start()
    expect(presentation.getView().camera).toEqual(frameCamera(doc, 0, size))
  })

  it('shows the content of a board without frames', () => {
    const doc = board([rectangle('r', 100)])
    const presentation = mount(doc)
    presentation.start()
    expect(presentation.getView().camera).toEqual(
      fitRectToViewport(contentBounds(doc)!, size, 0.08)
    )
  })

  it('corrects a flight that landed after the viewport changed underneath it', () => {
    const doc = deck()
    const presentation = mount(doc)
    presentation.start()
    presentation.next()
    vi.advanceTimersByTime(100)
    // The window went fullscreen mid-flight and no resize reached the player.
    size = { width: 1600, height: 900 }
    vi.advanceTimersByTime(400 + SETTLE_MS + 100)
    const camera = presentation.getView().camera
    const target = frameCamera(doc, 1, size)!
    expect(camera.x).toBeCloseTo(target.x, 6)
    expect(camera.zoom).toBeCloseTo(target.zoom, 6)
    presentation.dispose()
  })

  it('refits a resize once it settles, with the same short correction as the app', () => {
    const doc = deck()
    const presentation = mount(doc)
    presentation.start()
    const before = presentation.getView().camera
    size = { width: 1600, height: 900 }
    presentation.resize()
    vi.advanceTimersByTime(REFIT_DELAY_MS - 1)
    expect(presentation.getView().camera).toEqual(before)
    vi.advanceTimersByTime(1 + SETTLE_MS / 2)
    expect(presentation.getView().camera).not.toEqual(before)
    expect(presentation.getView().camera).not.toEqual(frameCamera(doc, 0, size))
    vi.advanceTimersByTime(SETTLE_MS)
    expect(presentation.getView().camera).toEqual(frameCamera(doc, 0, size))
    presentation.dispose()
  })

  it('keeps a flight going at its full length through a resize', () => {
    const doc = deck()
    const presentation = mount(doc)
    presentation.start()
    presentation.next()
    vi.advanceTimersByTime(100)
    size = { width: 1600, height: 900 }
    presentation.resize()
    // The retargeted flight lands a full transition after the refit, not after a short correction.
    vi.advanceTimersByTime(REFIT_DELAY_MS + SETTLE_MS + 50)
    expect(fits(presentation.getView().camera, frameCamera(doc, 1, size)!)).toBe(false)
    vi.advanceTimersByTime(400)
    expect(fits(presentation.getView().camera, frameCamera(doc, 1, size)!)).toBe(true)
    presentation.dispose()
  })

  it('never stretches a resize correction into a whole flight', () => {
    const doc = deck(2000)
    const presentation = mount(doc)
    presentation.start()
    size = { width: 1600, height: 900 }
    presentation.resize()
    vi.advanceTimersByTime(REFIT_DELAY_MS + 100)
    // The window drag resumes while the first correction is still moving.
    size = { width: 1200, height: 900 }
    presentation.resize()
    vi.advanceTimersByTime(REFIT_DELAY_MS + SETTLE_MS + 50)
    expect(fits(presentation.getView().camera, frameCamera(doc, 0, size)!)).toBe(true)
    presentation.dispose()
  })

  it('does not animate when a resize leaves the fit unchanged', () => {
    const presentation = mount(deck())
    presentation.start()
    let paints = 0
    presentation.onViewChange(() => paints++)
    presentation.resize()
    vi.advanceTimersByTime(1000)
    expect(paints).toBe(0)
    presentation.dispose()
  })

  it('makes the videos of a frame live only once the camera holds still on it', () => {
    const doc = deck()
    const presentation = mount(doc)
    presentation.start()
    expect(videos.shown.at(-1)).toBe('a')
    presentation.next()
    expect(videos.shown.at(-1)).toBeNull()
    vi.advanceTimersByTime(100)
    size = { width: 1600, height: 900 }
    vi.advanceTimersByTime(400)
    // Landed on the old fit: the settle correction still has to run.
    expect(videos.shown.at(-1)).toBeNull()
    vi.advanceTimersByTime(SETTLE_MS + 50)
    expect(videos.shown.at(-1)).toBe('b')
    presentation.toggleOverview()
    expect(videos.shown.at(-1)).toBeNull()
    presentation.dispose()
  })

  it('refits an expanded video at once, and refits the frame when the video closes', () => {
    const doc = board([frame('a', 0), video('v', 100)])
    const presentation = mount(doc)
    presentation.start()
    const handle = videos.focus!.open(
      'v',
      () => {},
      () => {}
    )
    size = { width: 1600, height: 900 }
    presentation.resize()
    expect(presentation.getView().camera.zoom).toBeCloseTo(1600 / 160, 9)
    vi.advanceTimersByTime(1000)
    expect(presentation.getView().camera.zoom).toBeCloseTo(1600 / 160, 9)
    // Closing hands back the view fitted to the old window; it must not stay that way.
    handle.close()
    vi.advanceTimersByTime(SETTLE_MS + 50)
    expect(fits(presentation.getView().camera, frameCamera(doc, 0, size)!)).toBe(true)
    presentation.dispose()
  })
})
