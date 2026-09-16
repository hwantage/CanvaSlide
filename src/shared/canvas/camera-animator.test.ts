import { describe, expect, it, vi } from 'vitest'
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

  it('keeps the full transition duration after preparation and pins resources until arrival', async () => {
    const clock = fakeClock()
    const initial = { x: 0, y: 0, zoom: 1 }
    let camera: Camera = initial
    let ready!: () => void
    const release = vi.fn()
    const onDone = vi.fn()
    const onActiveChange = vi.fn()
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      prepare: () => ({
        ready: new Promise<void>((resolve) => {
          ready = resolve
        }),
        release
      }),
      onActiveChange,
      ...clock
    })
    const target = { x: -1000, y: -300, zoom: 4 }
    animator.animateTo(target, 1000, onDone)
    clock.step(5000)
    expect(camera).toBe(initial)
    expect(animator.isAnimating()).toBe(true)
    expect(onActiveChange.mock.calls).toEqual([[true]])
    ready()
    await Promise.resolve()
    clock.step(500)
    expect(camera).not.toEqual(initial)
    expect(camera).not.toEqual(target)
    expect(release).not.toHaveBeenCalled()
    clock.step(500)
    expect(camera).toEqual(target)
    expect(release).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
    expect(animator.isAnimating()).toBe(false)
    expect(onActiveChange.mock.calls).toEqual([[true], [false]])
  })

  it('ignores a cancelled preparation and releases its images when retargeted', async () => {
    const clock = fakeClock()
    let camera: Camera = { x: 0, y: 0, zoom: 1 }
    let ready!: () => void
    const release = vi.fn()
    const onDone = vi.fn()
    const prepare = vi
      .fn()
      .mockReturnValueOnce({
        ready: new Promise<void>((resolve) => {
          ready = resolve
        }),
        release
      })
      .mockReturnValue(undefined)
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      prepare,
      ...clock
    })
    animator.animateTo({ x: -10000, y: 0, zoom: 10 }, 1000, onDone)
    animator.animateTo({ x: -500, y: 0, zoom: 2 }, 500)
    expect(release).toHaveBeenCalledOnce()
    ready()
    await Promise.resolve()
    clock.step(500)
    expect(camera).toEqual({ x: -500, y: 0, zoom: 2 })
    expect(onDone).not.toHaveBeenCalled()
    expect(animator.isAnimating()).toBe(false)
    animator.cancel()
    expect(release).toHaveBeenCalledOnce()
  })

  it('continues after a failed preparation, and skips preparation for instant moves', async () => {
    const clock = fakeClock()
    let camera: Camera = { x: 0, y: 0, zoom: 1 }
    const release = vi.fn()
    const prepare = vi.fn(() => ({ ready: Promise.reject(new Error('decode')), release }))
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      prepare,
      ...clock
    })
    animator.animateTo({ x: 1, y: 2, zoom: 3 }, 0)
    expect(prepare).not.toHaveBeenCalled()
    animator.animateTo({ x: 4, y: 5, zoom: 6 }, 500)
    await Promise.resolve()
    clock.step(500)
    expect(camera).toEqual({ x: 4, y: 5, zoom: 6 })
    expect(release).toHaveBeenCalledOnce()
    prepare.mockImplementation(() => {
      throw new Error('preparation failed')
    })
    animator.animateTo({ x: 10, y: 20, zoom: 2 }, 500)
    clock.step(500)
    expect(camera).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(animator.isAnimating()).toBe(false)
  })
})
