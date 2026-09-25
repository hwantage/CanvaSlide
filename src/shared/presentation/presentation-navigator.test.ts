import { describe, expect, it } from 'vitest'
import type { CameraFlightOptions } from '../canvas/camera-animator'
import {
  createEmptyDocument,
  type Camera,
  type CanvasDocument,
  type CanvasElement,
  type FrameElement,
  type Size
} from '../canvas/element-types'
import { cameraForOverview } from '../canvas/frame-fit'
import { LEVEL_SHOT, frameCamera, type Shot } from '../canvas/presentation-shot'
import {
  SETTLE_MS,
  createPresentationNavigator,
  type PresentationNavigatorPort,
  type PresentationPosition
} from './presentation-navigator'

const frame = (id: string, order: number, x: number, ms?: number): FrameElement => ({
  id,
  type: 'frame',
  name: id,
  order,
  x,
  y: 0,
  width: 400,
  height: 300,
  ...(ms === undefined ? {} : { transition: { ms } })
})

function deck(elements: CanvasElement[], transitionMs = 800): CanvasDocument {
  const doc = createEmptyDocument()
  for (const element of elements) {
    doc.elements[element.id] = element
    doc.order.push(element.id)
  }
  doc.settings.transitionMs = transitionMs
  return doc
}

type Flight = { target: Camera; durationMs: number; options: CameraFlightOptions }

/** A host whose camera moves only when the test lands the latest flight. */
function host(doc: CanvasDocument, overrides: Partial<PresentationNavigatorPort> = {}) {
  const state = {
    viewport: { width: 1000, height: 800 } as Size,
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    position: { index: 0, overview: false } as PresentationPosition,
    shot: LEVEL_SHOT as Shot,
    animating: false,
    flights: [] as Flight[],
    landed: [] as string[]
  }
  const navigator = createPresentationNavigator({
    getDocument: () => doc,
    getViewport: () => state.viewport,
    getCamera: () => state.camera,
    isAnimating: () => state.animating,
    animateTo: (target, durationMs, options = {}) => {
      state.flights.push({ target, durationMs, options })
      state.animating = true
    },
    getShot: () => state.shot,
    setShot: (shot) => {
      state.shot = shot
    },
    getPosition: () => state.position,
    setPosition: (position) => {
      state.position = position
    },
    onFrameLanded: (id) => state.landed.push(id),
    ...overrides
  })
  const land = () => {
    const flight = state.flights.at(-1)!
    state.animating = false
    state.camera = flight.target
    flight.options.onProgress?.(1)
    flight.options.onDone?.()
  }
  return { state, navigator, land }
}

const fitted = (doc: CanvasDocument, index: number, viewport: Size) =>
  frameCamera(doc, index, viewport)

describe('presentation navigator', () => {
  it('does not start a deck without frames', () => {
    const { state, navigator } = host(deck([]))
    state.position = { index: 3, overview: true }
    expect(navigator.start()).toBe(false)
    expect(state.position).toEqual({ index: 3, overview: true })
    expect(state.flights).toEqual([])
  })

  it('starts on a clamped frame without flying', () => {
    const doc = deck([frame('a', 1, 0), frame('b', 2, 5000)])
    const { state, navigator } = host(doc)
    state.position = { index: 0, overview: true }
    expect(navigator.start(9)).toBe(true)
    expect(state.position).toEqual({ index: 1, overview: false })
    expect(navigator.start(-4)).toBe(true)
    expect(state.position).toEqual({ index: 0, overview: false })
    expect(state.flights).toEqual([])
  })

  it('walks the deck in order, clamps at both ends and flies each frame with its own motion', () => {
    const doc = deck([frame('b', 2, 5000, 300), frame('a', 1, 0)])
    doc.elements.b = {
      ...frame('b', 2, 5000, 300),
      transition: { ms: 300, arc: 2.5, easing: 'linear' }
    }
    const { state, navigator } = host(doc)
    navigator.step(-1)
    expect(state.flights).toEqual([])
    navigator.step(1)
    expect(state.position).toEqual({ index: 1, overview: false })
    expect(state.flights).toHaveLength(1)
    expect(state.flights[0]).toMatchObject({
      target: fitted(doc, 1, state.viewport),
      durationMs: 300,
      options: { rho: 2.5, easing: 'linear' }
    })
    navigator.step(1)
    expect(state.flights).toHaveLength(1)
    navigator.step(-1)
    expect(state.position.index).toBe(0)
    expect(state.flights.at(-1)?.durationMs).toBe(800)
  })

  it('ignores frames that are not in the deck', () => {
    const { state, navigator } = host(deck([frame('a', 1, 0)]))
    for (const index of [-1, 1, 0.5, Number.NaN]) {
      navigator.goTo(index)
    }
    expect(state.position).toEqual({ index: 0, overview: false })
    expect(state.flights).toEqual([])
  })

  it('reports the landed frame once the camera holds still on it', () => {
    const { state, navigator, land } = host(deck([frame('a', 1, 0), frame('b', 2, 5000)]))
    navigator.goTo(1)
    expect(state.landed).toEqual([])
    land()
    expect(state.landed).toEqual(['b'])
    // A flight that lands misfitted reports only after its correction.
    navigator.goTo(0)
    state.viewport = { width: 1600, height: 900 }
    land()
    expect(state.landed).toEqual(['b'])
    land()
    expect(state.landed).toEqual(['b', 'a'])
  })

  it('zooms out to the whole board level and lit, and leaves overview for the current frame', () => {
    const doc = deck([frame('a', 1, 0), frame('b', 2, 5000)], 600)
    doc.elements.b = { ...frame('b', 2, 5000), transition: { roll: 20, spotlight: 0.5 } }
    const { state, navigator, land } = host(doc)
    navigator.goTo(1)
    land()
    expect(state.shot.roll).toBe(20)
    navigator.toggleOverview()
    expect(state.position).toEqual({ index: 1, overview: true })
    expect(state.flights.at(-1)).toMatchObject({
      target: cameraForOverview(doc, state.viewport),
      durationMs: 600
    })
    land()
    expect(state.shot).toMatchObject({ roll: 0, spotlight: 0 })
    // No frame lands at the end of the overview flight.
    expect(state.landed).toEqual(['b'])
    navigator.toggleOverview()
    expect(state.position).toEqual({ index: 1, overview: false })
    expect(state.flights.at(-1)?.target).toEqual(fitted(doc, 1, state.viewport))
  })

  it('leaves overview at either end of the deck by returning to the current frame', () => {
    const doc = deck([frame('a', 1, 0), frame('b', 2, 5000)])
    const { state, navigator } = host(doc)
    for (const [index, direction] of [
      [0, -1],
      [1, 1]
    ] as const) {
      state.position = { index, overview: true }
      navigator.step(direction)
      expect(state.position).toEqual({ index, overview: false })
      expect(state.flights.at(-1)?.target).toEqual(fitted(doc, index, state.viewport))
    }
  })

  it('stays out of overview when there is nothing to zoom out to', () => {
    const { state, navigator } = host(deck([]))
    navigator.showOverview()
    expect(state.position.overview).toBe(false)
    expect(state.flights).toEqual([])
  })

  it('opens a departure still and runs the shot from it', () => {
    const doc = deck([frame('a', 1, 0), frame('b', 2, 5000)])
    doc.elements.b = { ...frame('b', 2, 5000), transition: { roll: 10 } }
    const { state, navigator } = host(doc)
    const departure = { camera: { x: 1, y: 2, zoom: 3 }, shot: { ...LEVEL_SHOT, roll: -30 } }
    navigator.flyTo(1, { departure: { ...departure, holdMs: 500 } })
    const { options } = state.flights[0]!
    expect(options).toMatchObject({ holdMs: 500, departure: departure.camera })
    options.onPrepared?.()
    expect(state.shot.roll).toBe(-30)
    options.onProgress?.(0.5)
    expect(state.shot.roll).toBeCloseTo(-10, 9)
  })

  it('cuts to the current frame on request', () => {
    const doc = deck([frame('a', 1, 0)])
    const { state, navigator } = host(doc)
    navigator.flyToCurrent(0)
    expect(state.flights[0]).toMatchObject({
      target: fitted(doc, 0, state.viewport),
      durationMs: 0
    })
  })
})

describe('presentation settle', () => {
  const doc = deck([frame('a', 1, 0), frame('b', 2, 5000)])
  const wide = { width: 2000, height: 1200 }

  it('corrects the fit when the viewport changed during the flight, until it holds', () => {
    const { state, navigator, land } = host(doc)
    navigator.goTo(1)
    state.viewport = wide
    land()
    expect(state.flights).toHaveLength(2)
    expect(state.flights[1]).toMatchObject({ target: fitted(doc, 1, wide), durationMs: SETTLE_MS })
    // The fullscreen animation may still be resizing while the correction runs.
    const wider = { width: 2400, height: 1200 }
    state.viewport = wider
    land()
    expect(state.flights).toHaveLength(3)
    expect(state.flights[2]).toMatchObject({ target: fitted(doc, 1, wider), durationMs: SETTLE_MS })
    land()
    expect(state.flights).toHaveLength(3)
  })

  it('keeps a flight that landed on the fitted camera', () => {
    const { state, navigator, land } = host(doc)
    navigator.goTo(1)
    land()
    expect(state.flights).toHaveLength(1)
  })

  it('never pulls the show back after it moved on, ended, or went to overview', () => {
    let presented: number | null = 0
    const { state, navigator, land } = host(doc, { presentedIndex: () => presented })
    for (const [next, overview] of [
      [0, false],
      [null, false],
      [1, true]
    ] as const) {
      const flights = state.flights.length
      navigator.goTo(1)
      presented = next
      state.position = { index: 1, overview }
      state.viewport = { width: state.viewport.width + 300, height: 800 }
      land()
      expect(state.flights).toHaveLength(flights + 1)
    }
    expect(state.landed).toEqual([])
  })

  it('follows the landed frame to wherever the host now presents it', () => {
    let current = doc
    let presented = 1
    const { state, navigator, land } = host(doc, {
      getDocument: () => current,
      presentedIndex: () => presented
    })
    navigator.goTo(1)
    // The deck was reordered under the flight: b opens it now.
    current = deck([frame('b', 1, 5000), frame('a', 2, 0)])
    presented = 0
    state.viewport = wide
    land()
    expect(state.flights.at(-1)).toMatchObject({
      target: fitted(current, 0, wide),
      durationMs: SETTLE_MS
    })
  })
})

describe('presentation refit', () => {
  const doc = deck([frame('a', 1, 0), frame('b', 2, 5000, 100)], 900)

  it('keeps a flight going at its full length', () => {
    const { state, navigator } = host(doc)
    navigator.goTo(0)
    state.viewport = { width: 1600, height: 900 }
    navigator.refit()
    expect(state.flights.at(-1)).toMatchObject({
      target: fitted(doc, 0, state.viewport),
      durationMs: 900
    })
  })

  it('corrects a settled frame briefly, and a correction is never stretched into a flight', () => {
    const { state, navigator, land } = host(doc)
    navigator.goTo(0)
    land()
    state.viewport = { width: 1600, height: 900 }
    navigator.refit()
    expect(state.flights.at(-1)).toMatchObject({
      target: fitted(doc, 0, state.viewport),
      durationMs: SETTLE_MS
    })
    // A window drag that pauses and resumes refits again while the first correction runs.
    state.viewport = { width: 1200, height: 900 }
    navigator.refit()
    expect(state.flights.at(-1)).toMatchObject({
      target: fitted(doc, 0, state.viewport),
      durationMs: SETTLE_MS
    })
    // A frame whose own flight is shorter than a correction never slows down to one.
    navigator.goTo(1)
    land()
    state.viewport = { width: 1000, height: 800 }
    navigator.refit()
    expect(state.flights.at(-1)?.durationMs).toBe(100)
  })

  it('leaves a fitted camera alone', () => {
    const { state, navigator, land } = host(doc)
    navigator.goTo(0)
    land()
    navigator.refit()
    expect(state.flights).toHaveLength(1)
  })

  it("refits the overview on the overview flight's own clock", () => {
    const { state, navigator, land } = host(doc)
    navigator.goTo(1)
    land()
    navigator.showOverview()
    state.viewport = { width: 600, height: 900 }
    navigator.refit()
    expect(state.flights.at(-1)).toMatchObject({
      target: cameraForOverview(doc, state.viewport),
      durationMs: 900
    })
    land()
    state.viewport = { width: 900, height: 900 }
    navigator.refit()
    expect(state.flights.at(-1)).toMatchObject({
      target: cameraForOverview(doc, state.viewport),
      durationMs: SETTLE_MS
    })
    expect(state.position.overview).toBe(true)
  })

  it('leaves the camera alone when nothing is presented', () => {
    const { state, navigator } = host(deck([frame('a', 1, 0)]), { presentedIndex: () => null })
    navigator.refit()
    expect(state.flights).toEqual([])
  })
})
