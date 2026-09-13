import { describe, expect, it } from 'vitest'
import { createCameraAnimator } from './camera-animator'
import type { Camera } from './element-types'

function fakeClock() {
  let time = 0
  const queue: ((t: number) => void)[] = []
  return {
    now: () => time,
    requestFrame: (cb: (t: number) => void) => queue.push(cb),
    cancelFrame: () => queue.splice(0),
    step: (ms: number) => {
      time += ms
      const cbs = queue.splice(0)
      for (const cb of cbs) {
        cb(time)
      }
    }
  }
}

describe('camera-animator', () => {
  it('interpolates to the target and reports completion', () => {
    const clock = fakeClock()
    let camera: Camera = { x: 0, y: 0, zoom: 1 }
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      ...clock
    })
    let done = 0
    animator.animateTo({ x: -500, y: -200, zoom: 2 }, 1000, () => (done += 1))
    expect(animator.isAnimating()).toBe(true)
    clock.step(500)
    expect(camera.zoom).not.toBe(1)
    expect(done).toBe(0)
    clock.step(600)
    expect(camera).toEqual({ x: -500, y: -200, zoom: 2 })
    expect(done).toBe(1)
    expect(animator.isAnimating()).toBe(false)
  })

  it('retargets mid-flight instead of queueing', () => {
    const clock = fakeClock()
    let camera: Camera = { x: 0, y: 0, zoom: 1 }
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      ...clock
    })
    animator.animateTo({ x: 1000, y: 0, zoom: 1 }, 1000)
    clock.step(300)
    animator.animateTo({ x: 0, y: 0, zoom: 4 }, 200)
    clock.step(250)
    expect(camera).toEqual({ x: 0, y: 0, zoom: 4 })
  })

  it('snaps immediately for zero duration', () => {
    let camera: Camera = { x: 0, y: 0, zoom: 1 }
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 10, height: 10 })
    })
    animator.animateTo({ x: 1, y: 1, zoom: 1 }, 0)
    expect(camera).toEqual({ x: 1, y: 1, zoom: 1 })
  })
})
