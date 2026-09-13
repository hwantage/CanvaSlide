import type { Camera, Size } from './element-types'
import { createCameraTween } from './zoom-pan-interpolation'

export type CameraAnimatorDeps = {
  getCamera: () => Camera
  setCamera: (camera: Camera) => void
  getViewport: () => Size
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

  const cancel = () => {
    if (handle !== null) {
      cancelFrame(handle)
      handle = null
    }
  }

  return {
    cancel,
    isAnimating: () => handle !== null,
    animateTo: (target, durationMs, onDone) => {
      cancel()
      if (durationMs <= 0) {
        deps.setCamera(target)
        onDone?.()
        return
      }
      const tween = createCameraTween(deps.getCamera(), target, deps.getViewport())
      const start = now()
      const tick = () => {
        const progress = Math.min(1, (now() - start) / durationMs)
        deps.setCamera(progress >= 1 ? target : tween.at(progress))
        if (progress >= 1) {
          handle = null
          onDone?.()
          return
        }
        handle = requestFrame(tick)
      }
      handle = requestFrame(tick)
    }
  }
}
