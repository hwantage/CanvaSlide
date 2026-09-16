import type { Camera, Size } from './element-types'
import { createCameraTween } from './zoom-pan-interpolation'

export type CameraPreparation = { ready: Promise<unknown>; release: () => void }

export type CameraAnimatorDeps = {
  getCamera: () => Camera
  setCamera: (camera: Camera) => void
  getViewport: () => Size
  prepare?: (from: Camera, target: Camera, viewport: Size) => CameraPreparation | undefined
  onActiveChange?: (active: boolean) => void
  requestFrame?: (cb: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
  now?: () => number
}

export type CameraAnimator = {
  /** Retargets from the current camera; an in-flight animation is replaced, never queued. */
  animateTo: (target: Camera, durationMs: number, onDone?: () => void) => void
  cancel: () => void
  isAnimating: () => boolean
}

export function createCameraAnimator(deps: CameraAnimatorDeps): CameraAnimator {
  const requestFrame = deps.requestFrame ?? ((cb) => globalThis.requestAnimationFrame(cb))
  const cancelFrame = deps.cancelFrame ?? ((h) => globalThis.cancelAnimationFrame(h))
  const now = deps.now ?? (() => performance.now())
  let handle: number | null = null
  let preparation: CameraPreparation | undefined
  let generation = 0
  let active = false

  const setActive = (value: boolean) => {
    if (active !== value) {
      active = value
      deps.onActiveChange?.(value)
    }
  }

  const cancel = () => {
    generation++
    if (handle !== null) {
      cancelFrame(handle)
      handle = null
    }
    preparation?.release()
    preparation = undefined
    setActive(false)
  }

  return {
    cancel,
    isAnimating: () => active,
    animateTo: (target, durationMs, onDone) => {
      cancel()
      if (durationMs <= 0) {
        deps.setCamera(target)
        onDone?.()
        return
      }
      const flight = generation
      const startFlight = () => {
        if (flight !== generation) {
          return
        }
        const tween = createCameraTween(deps.getCamera(), target, deps.getViewport())
        const start = now()
        const tick = () => {
          const progress = Math.min(1, (now() - start) / durationMs)
          deps.setCamera(progress >= 1 ? target : tween.at(progress))
          if (flight !== generation) {
            return
          }
          if (progress >= 1) {
            handle = null
            preparation?.release()
            preparation = undefined
            setActive(false)
            onDone?.()
            return
          }
          handle = requestFrame(tick)
        }
        handle = requestFrame(tick)
      }
      setActive(true)
      if (flight !== generation) {
        return
      }
      try {
        preparation = deps.prepare?.(deps.getCamera(), target, deps.getViewport())
      } catch {
        startFlight()
        return
      }
      if (preparation) {
        // Start the flight clock after its images are ready; never skip part of the path to catch up.
        void preparation.ready.then(startFlight, startFlight)
      } else {
        startFlight()
      }
    }
  }
}
