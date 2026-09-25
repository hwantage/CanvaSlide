import { expect, it } from 'vitest'
import { createVideoFocus, type VideoView } from './video-focus'
import { LEVEL_SHOT } from './presentation-shot'

function setup(width = 640, height = 406, onRestore?: () => void) {
  let view: VideoView = {
    camera: { x: 20, y: -50, zoom: 0.5 },
    shot: { ...LEVEL_SHOT, roll: 20, spotlight: 0.5 }
  }
  let viewport = { width: 1200, height: 800 }
  let expandedHeight = 0
  const resizeMedia = (height: number) => {
    expandedHeight = height
  }
  const rect = { x: 100, y: 200, width, height }
  const focus = createVideoFocus({
    getView: () => view,
    setView: (next) => {
      view = next
    },
    getRect: () => rect,
    getViewport: () => viewport,
    ...(onRestore ? { onRestore } : {})
  })
  return {
    focus,
    rect,
    resizeMedia,
    height: () => expandedHeight,
    view: () => view,
    resize: () => {
      viewport = { width: 800, height: 600 }
    }
  }
}

it.each([
  [640, 406],
  [360, 686]
])(
  'fills the viewport for a %sx%s video without reserving controls or navigation space',
  (width, height) => {
    const state = setup(width, height)
    const before = state.view()
    const handle = state.focus.open('video', () => undefined, state.resizeMedia)
    const { camera, shot } = state.view()
    expect(shot).toEqual(LEVEL_SHOT)
    expect(camera.zoom).toBeCloseTo(1200 / width)
    expect(state.height() * camera.zoom).toBeCloseTo(800)
    expect(camera.x + state.rect.x * camera.zoom).toBeCloseTo(0)
    expect(camera.y + state.rect.y * camera.zoom).toBeCloseTo(0)
    expect(camera.y + (state.rect.y + state.height()) * camera.zoom).toBeCloseTo(800)
    handle.close()
    expect(state.view()).toEqual(before)
  }
)

it('resizes without replacing media, restores the original view across video switches, and ignores stale handles', () => {
  const state = setup()
  const before = state.view()
  let closed = 0
  const first = state.focus.open('first', () => closed++, state.resizeMedia)
  state.resize()
  expect(state.focus.refit()).toBe(true)
  expect(state.view().camera.zoom).toBeCloseTo(800 / 640)
  expect(state.height() * state.view().camera.zoom).toBeCloseTo(600)
  const second = state.focus.open('second', () => closed++, state.resizeMedia)
  expect(closed).toBe(1)
  first.close()
  expect(closed).toBe(1)
  second.close()
  expect(state.view()).toEqual(before)
  expect(closed).toBe(2)
})

it('does not overwrite the next frame camera when the expanded video leaves the slide', () => {
  const state = setup()
  const handle = state.focus.open('video', () => undefined, state.resizeMedia)
  const focused = state.view()
  handle.dispose()
  handle.close()
  expect(state.view()).toBe(focused)
  expect(state.focus.refit()).toBe(false)
})

it('reports a restored view so the host can refit it, but not a hand-over or a dispose', () => {
  let restored = 0
  const state = setup(640, 406, () => restored++)
  const first = state.focus.open('first', () => undefined, state.resizeMedia)
  const second = state.focus.open('second', () => undefined, state.resizeMedia)
  expect(restored).toBe(0)
  first.close()
  expect(restored).toBe(0)
  second.close()
  expect(restored).toBe(1)
  state.focus.open('third', () => undefined, state.resizeMedia).dispose()
  expect(restored).toBe(1)
})
