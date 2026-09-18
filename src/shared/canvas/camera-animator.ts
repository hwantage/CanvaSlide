import type { Camera, Size } from './element-types'
import { createCameraTween, type CameraTweenOptions } from './zoom-pan-interpolation'

export type CameraPreparation = { ready: Promise<unknown>; release: () => void }

export type CameraFlightOptions = CameraTweenOptions & {
  /** Prepare a cut to this departure without exposing an unprepared still. */
  departure?: Camera | undefined
  onPrepared?: (() => void) | undefined
  onDone?: (() => void) | undefined
  /** Eased progress each frame, so a caller can animate roll or dimming on the camera's clock. */
  onProgress?: ((eased: number) => void) | undefined
  /** Hold after preparation and paint; stay active to suppress detail work before departure. */
  holdMs?: number | undefined
}

export type CameraAnimatorDeps = {
  getCamera: () => Camera
  setCamera: (camera: Camera) => void
  getViewport: () => Size
  prepare?: (from: Camera, target: Camera, viewport: Size) => CameraPreparation | undefined
  onActiveChange?: (active: boolean, target?: Camera) => void
  onStationaryChange?: (camera: Camera | null) => void
  requestFrame?: (cb: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
  now?: () => number
  setTimeout?: (callback: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
}

export type CameraAnimator = {
  /** Retargets from the current camera; an in-flight animation is replaced, never queued. */
  animateTo: (target: Camera, durationMs: number, options?: CameraFlightOptions) => void
  cancel: () => void
  isAnimating: () => boolean
}

export function createCameraAnimator(deps: CameraAnimatorDeps): CameraAnimator {
  const requestFrame = deps.requestFrame ?? ((cb) => globalThis.requestAnimationFrame(cb))
  const cancelFrame = deps.cancelFrame ?? ((h) => globalThis.cancelAnimationFrame(h))
  const now = deps.now ?? (() => performance.now())
  const schedule = deps.setTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms))
  const unschedule =
    deps.clearTimeout ??
    ((h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>))
  let handle: number | null = null
  let hold: unknown = null
  let preparation: CameraPreparation | undefined
  let generation = 0
  let active = false

  const setActive = (value: boolean, target?: Camera) => {
    if (active !== value) {
      active = value
      deps.onActiveChange?.(value, target)
    }
  }

  const cancel = () => {
    generation++
    if (handle !== null) {
      cancelFrame(handle)
      handle = null
    }
    if (hold !== null) {
      unschedule(hold)
      hold = null
    }
    preparation?.release()
    preparation = undefined
    deps.onStationaryChange?.(null)
    setActive(false)
  }

  return {
    cancel,
    isAnimating: () => active,
    animateTo: (target, durationMs, options = {}) => {
      const { onDone, onProgress, holdMs = 0, departure, onPrepared, ...tweenOptions } = options
      cancel()
      const flight = generation
      const land = () => {
        preparation?.release()
        preparation = undefined
        deps.setCamera(target)
        deps.onStationaryChange?.(null)
        setActive(false)
        onProgress?.(1)
        onDone?.()
      }
      // Why: a NaN duration makes every progress check NaN, so the flight would never land.
      const cut = !(durationMs > 0)
      if (cut && !(holdMs > 0)) {
        onPrepared?.()
        if (flight === generation) {
          land()
        }
        return
      }
      const startFlight = () => {
        if (flight !== generation) {
          return
        }
        if (cut) {
          land()
          return
        }
        const tween = createCameraTween(deps.getCamera(), target, deps.getViewport(), tweenOptions)
        const start = now()
        const tick = () => {
          deps.onStationaryChange?.(null)
          const progress = Math.min(1, (now() - start) / durationMs)
          deps.setCamera(progress >= 1 ? target : tween.at(progress))
          onProgress?.(progress >= 1 ? 1 : tween.ease(progress))
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
      const takeOff = () => {
        if (flight !== generation) {
          return
        }
        if (departure) {
          deps.onStationaryChange?.(departure)
          deps.setCamera(departure)
        }
        onPrepared?.()
        if (flight !== generation) {
          return
        }
        if (!(holdMs > 0)) {
          startFlight()
          return
        }
        const startHold = () => {
          if (flight !== generation) {
            return
          }
          handle = null
          hold = schedule(() => {
            hold = null
            startFlight()
          }, holdMs)
        }
        if (departure) {
          // Allow the departure cut to paint before counting its visible hold.
          handle = requestFrame(() => {
            if (flight === generation) {
              handle = requestFrame(startHold)
            }
          })
        } else {
          startHold()
        }
      }
      if (departure || holdMs > 0) {
        deps.onStationaryChange?.(deps.getCamera())
      }
      setActive(true, target)
      if (flight !== generation) {
        return
      }
      try {
        preparation = deps.prepare?.(departure ?? deps.getCamera(), target, deps.getViewport())
      } catch {
        takeOff()
        return
      }
      if (preparation) {
        // Start the flight clock after its images are ready; never skip part of the path to catch up.
        void preparation.ready.then(takeOff, takeOff)
      } else {
        takeOff()
      }
    }
  }
}
