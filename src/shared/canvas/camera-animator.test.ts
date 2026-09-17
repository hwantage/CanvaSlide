import { describe, expect, it, vi } from 'vitest'
import { createCameraAnimator, type CameraAnimatorDeps } from './camera-animator'
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

/** Timers the animator rests on, driven by hand so a hold can be stepped past exactly. */
function fakeTimers() {
  type Entry = { at: number; cb: () => void }
  const pending: Entry[] = []
  let time = 0
  return {
    setTimeout: (cb: () => void, ms: number) => {
      const entry = { at: time + ms, cb }
      pending.push(entry)
      return entry
    },
    clearTimeout: (handle: unknown) => {
      const index = pending.indexOf(handle as Entry)
      if (index >= 0) {
        pending.splice(index, 1)
      }
    },
    advance: (ms: number) => {
      time += ms
      const due = pending.filter((entry) => entry.at <= time).sort((a, b) => a.at - b.at)
      for (const entry of due) {
        pending.splice(pending.indexOf(entry), 1)
        entry.cb()
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
    animator.animateTo({ x: -500, y: -200, zoom: 2 }, 1000, { onDone: () => (done += 1) })
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
    animator.animateTo(target, 1000, { onDone })
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
    animator.animateTo({ x: -10000, y: 0, zoom: 10 }, 1000, { onDone })
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

describe('camera-animator hold', () => {
  const setup = (prepare?: CameraAnimatorDeps['prepare']) => {
    const clock = fakeClock()
    const timers = fakeTimers()
    const state = { camera: { x: 0, y: 0, zoom: 1 } as Camera }
    const onDone = vi.fn()
    const animator = createCameraAnimator({
      getCamera: () => state.camera,
      setCamera: (c) => {
        state.camera = c
      },
      getViewport: () => ({ width: 1000, height: 600 }),
      ...(prepare ? { prepare } : {}),
      ...clock,
      ...timers
    })
    return { clock, timers, state, onDone, animator }
  }
  const target = { x: -500, y: -200, zoom: 2 }

  it('applies prepared effects before an immediate cut lands', () => {
    const { animator } = setup()
    const events: string[] = []
    animator.animateTo(target, 0, {
      onPrepared: () => events.push('prepared'),
      onProgress: () => events.push('progress'),
      onDone: () => events.push('done')
    })
    expect(events).toEqual(['prepared', 'progress', 'done'])
  })

  it('does not overwrite a replacement requested by an immediate preparation callback', () => {
    const { state, animator, onDone } = setup()
    const replacement = { x: 100, y: 50, zoom: 3 }
    animator.animateTo(target, 0, {
      onPrepared: () => animator.animateTo(replacement, 0),
      onDone
    })
    expect(state.camera).toBe(replacement)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('cancels a departure cut while waiting for its paint', () => {
    const { clock, timers, state, animator, onDone } = setup()
    const departure = { x: 10, y: 20, zoom: 2 }
    animator.animateTo(target, 100, { departure, holdMs: 500, onDone })
    clock.step(16)
    animator.cancel()
    clock.step(16)
    timers.advance(1000)
    clock.step(1000)
    expect(state.camera).toBe(departure)
    expect(animator.isAnimating()).toBe(false)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('rests on the departure for the whole hold, counting as in flight, then flies', () => {
    const { clock, timers, state, onDone, animator } = setup()
    const departure = state.camera
    animator.animateTo(target, 100, { holdMs: 500, onDone })
    expect(animator.isAnimating()).toBe(true)
    timers.advance(499)
    clock.step(50)
    expect(state.camera).toBe(departure)
    timers.advance(1)
    clock.step(50)
    expect(state.camera).not.toBe(departure)
    expect(state.camera).not.toEqual(target)
    clock.step(60)
    expect(state.camera).toEqual(target)
    expect(onDone).toHaveBeenCalledOnce()
    expect(animator.isAnimating()).toBe(false)
  })

  it('never flies a held flight that was cancelled', () => {
    const { clock, timers, state, onDone, animator } = setup()
    const departure = state.camera
    animator.animateTo(target, 100, { holdMs: 500, onDone })
    animator.cancel()
    expect(animator.isAnimating()).toBe(false)
    timers.advance(1000)
    clock.step(1000)
    expect(state.camera).toBe(departure)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('replaces a held flight with the next request instead of flying both', () => {
    const { clock, timers, state, onDone, animator } = setup()
    const departure = state.camera
    animator.animateTo(target, 100, { holdMs: 500, onDone })
    timers.advance(300)
    const other = { x: 100, y: 100, zoom: 1 }
    animator.animateTo(other, 100, { holdMs: 500 })
    timers.advance(300)
    clock.step(50)
    expect(state.camera).toBe(departure)
    timers.advance(200)
    clock.step(200)
    expect(state.camera).toEqual(other)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('lands a held cut when the hold runs out, without a tween', () => {
    const { timers, state, onDone, animator } = setup()
    animator.animateTo(target, 0, { holdMs: 500, onDone })
    expect(animator.isAnimating()).toBe(true)
    timers.advance(499)
    expect(state.camera).toEqual({ x: 0, y: 0, zoom: 1 })
    timers.advance(1)
    expect(state.camera).toEqual(target)
    expect(onDone).toHaveBeenCalledOnce()
    expect(animator.isAnimating()).toBe(false)
  })

  it('starts the hold only once the flight is prepared', async () => {
    let ready!: () => void
    const release = vi.fn()
    const { clock, timers, state, animator } = setup(() => ({
      ready: new Promise<void>((resolve) => {
        ready = resolve
      }),
      release
    }))
    const departure = state.camera
    animator.animateTo(target, 100, { holdMs: 500 })
    timers.advance(5000)
    clock.step(5000)
    expect(state.camera).toBe(departure)
    ready()
    await Promise.resolve()
    timers.advance(499)
    clock.step(50)
    expect(state.camera).toBe(departure)
    timers.advance(1)
    clock.step(200)
    expect(state.camera).toEqual(target)
    expect(release).toHaveBeenCalledOnce()
  })
})

describe('prepared departure cuts', () => {
  it('keeps the current camera until preparation, then holds the prepared departure for 500ms', async () => {
    const clock = fakeClock()
    const timers = fakeTimers()
    const original = { x: 1, y: 2, zoom: 3 }
    const departure = { x: 10, y: 20, zoom: 2 }
    const target = { x: 100, y: 200, zoom: 4 }
    let camera = original
    let ready!: () => void
    const prepare = vi.fn(() => ({
      ready: new Promise<void>((r) => {
        ready = r
      }),
      release: vi.fn()
    }))
    const onStationaryChange = vi.fn()
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 800, height: 600 }),
      prepare,
      onStationaryChange,
      ...clock,
      ...timers
    })
    animator.animateTo(target, 100, { departure, holdMs: 500 })
    expect(prepare).toHaveBeenCalledWith(departure, target, { width: 800, height: 600 })
    timers.advance(2000)
    expect(camera).toBe(original)
    expect(onStationaryChange).toHaveBeenLastCalledWith(original)
    ready()
    await Promise.resolve()
    expect(camera).toBe(departure)
    expect(onStationaryChange).toHaveBeenLastCalledWith(departure)
    // A delayed departure paint must not consume any of the visible hold.
    timers.advance(2000)
    clock.step(2000)
    expect(camera).toBe(departure)
    clock.step(16)
    timers.advance(499)
    clock.step(100)
    expect(camera).toBe(departure)
    timers.advance(1)
    clock.step(100)
    expect(camera).toBe(target)
    expect(onStationaryChange).toHaveBeenLastCalledWith(null)
  })

  it('never cuts to a cancelled departure when its late preparation finishes', async () => {
    const clock = fakeClock()
    const original = { x: 1, y: 2, zoom: 3 }
    let camera = original
    let ready!: () => void
    const release = vi.fn()
    const animator = createCameraAnimator({
      getCamera: () => camera,
      setCamera: (c) => {
        camera = c
      },
      getViewport: () => ({ width: 800, height: 600 }),
      ...clock,
      prepare: () => ({
        ready: new Promise<void>((r) => {
          ready = r
        }),
        release
      })
    })
    animator.animateTo({ x: 100, y: 200, zoom: 4 }, 100, {
      departure: { x: 10, y: 20, zoom: 2 },
      holdMs: 500
    })
    animator.cancel()
    ready()
    await Promise.resolve()
    clock.step(2000)
    expect(camera).toBe(original)
    expect(release).toHaveBeenCalledOnce()
    expect(animator.isAnimating()).toBe(false)
  })
})
