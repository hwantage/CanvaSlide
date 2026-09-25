import type { CameraFlightOptions } from '../canvas/camera-animator'
import { camerasEqual } from '../canvas/camera-transform'
import type { Camera, CanvasDocument, ElementId, Size } from '../canvas/element-types'
import { cameraForOverview } from '../canvas/frame-fit'
import {
  LEVEL_SHOT,
  frameShot,
  frameShotAt,
  shotCamera,
  shotTween,
  type FrameShot,
  type Shot
} from '../canvas/presentation-shot'
import { clampFrameIndex, orderedFrames, stepFrameIndex } from '../canvas/presentation-sequence'

/** Correction hop after a flight lands on a viewport that changed underneath it. */
export const SETTLE_MS = 250

export type PresentationPosition = { index: number; overview: boolean }

/** A duration override for correction hops; a preview also opens on a prepared departure still. */
export type FrameFlight = {
  durationMs?: number | undefined
  /** Where the camera and the shot rest before the flight, and for how long. */
  departure?: { camera: Camera | null; shot: Shot; holdMs: number } | undefined
}

/** What a host lends the navigator: its document, camera, shot and where the show stands. */
export type PresentationNavigatorPort = {
  getDocument: () => CanvasDocument
  getViewport: () => Size
  getCamera: () => Camera
  isAnimating: () => boolean
  animateTo: (target: Camera, durationMs: number, options?: CameraFlightOptions) => void
  getShot: () => Shot
  setShot: (shot: Shot) => void
  getPosition: () => PresentationPosition
  setPosition: (position: PresentationPosition) => void
  /** The index on screen, or null when nothing is presented; defaults to the position's index. */
  presentedIndex?: () => number | null
  onFrameLanded?: (frameId: ElementId) => void
}

/** Index and overview transitions, flights and the refit/settle policy every presentation host shares. */
export function createPresentationNavigator(port: PresentationNavigatorPort) {
  const presentedIndex = port.presentedIndex ?? (() => port.getPosition().index)
  const frameCount = () => orderedFrames(port.getDocument()).length

  /** Runs the shot on the camera's eased clock; undefined when the two shots look the same. */
  const shotProgress = (to: Shot, from: Shot = port.getShot()) => {
    const tween = shotTween(from, to)
    return tween && ((t: number) => port.setShot(tween(t)))
  }

  /** Whether the camera's current move is a flight rather than a short correction. */
  let flying = false
  const move = (
    target: Camera,
    durationMs: number,
    flight: boolean,
    options: CameraFlightOptions
  ) => {
    flying = flight
    port.animateTo(target, durationMs, {
      ...options,
      onDone: () => {
        flying = false
        options.onDone?.()
      }
    })
  }

  // A resize may finish after takeoff without another refit, so correct against the arrival viewport.
  const settle = (frameId: ElementId) => {
    if (port.getPosition().overview) {
      return
    }
    const index = presentedIndex()
    const at = index === null ? null : frameShotAt(port.getDocument(), index)
    // Why: a late correction must not pull the show back after it has moved on to another frame.
    if (at?.frame.id !== frameId) {
      return
    }
    const target = shotCamera(at, port.getViewport())
    if (camerasEqual(port.getCamera(), target, 0.5)) {
      // Why: the frame's media become usable only once the camera holds still on it.
      port.onFrameLanded?.(frameId)
    } else {
      move(target, SETTLE_MS, false, { onDone: () => settle(frameId) })
    }
  }

  const fly = (at: FrameShot, { durationMs, departure }: FrameFlight = {}, flight = true) => {
    move(shotCamera(at, port.getViewport()), durationMs ?? at.motion.ms, flight, {
      rho: at.motion.arc,
      easing: at.motion.easing,
      holdMs: departure?.holdMs,
      departure: departure?.camera ?? undefined,
      onPrepared: departure ? () => port.setShot(departure.shot) : undefined,
      onProgress: shotProgress(frameShot(at), departure?.shot),
      onDone: () => settle(at.frame.id)
    })
  }
  const flyTo = (index: number, flight?: FrameFlight) => {
    const at = frameShotAt(port.getDocument(), index)
    if (at) {
      fly(at, flight)
    }
  }
  const flyToOverview = (durationMs: number, flight = true) => {
    const target = cameraForOverview(port.getDocument(), port.getViewport())
    if (!target) {
      return false
    }
    // Overview levels the camera and fades the spotlight where it stands.
    move(target, durationMs, flight, { onProgress: shotProgress(LEVEL_SHOT) })
    return true
  }

  const goTo = (index: number) => {
    const at = frameShotAt(port.getDocument(), index)
    if (!at) {
      return
    }
    port.setPosition({ index, overview: false })
    fly(at)
  }
  const showOverview = () => {
    if (flyToOverview(port.getDocument().settings.transitionMs)) {
      port.setPosition({ index: port.getPosition().index, overview: true })
    }
  }

  return {
    /** Places the show on its opening frame without flying; false when there is no frame to show. */
    start: (fromIndex = 0) => {
      const count = frameCount()
      if (count === 0) {
        return false
      }
      port.setPosition({ index: clampFrameIndex(fromIndex, count), overview: false })
      return true
    },
    goTo,
    step: (direction: 1 | -1) => {
      const { index, overview } = port.getPosition()
      const nextIndex = stepFrameIndex(index, frameCount(), direction)
      // Why: at either end, arrow keys still leave overview and return to the current frame.
      if (nextIndex !== index || overview) {
        goTo(nextIndex)
      }
    },
    showOverview,
    toggleOverview: () => {
      if (port.getPosition().overview) {
        goTo(port.getPosition().index)
      } else {
        showOverview()
      }
    },
    flyTo,
    flyToCurrent: (durationMs?: number) => flyTo(port.getPosition().index, { durationMs }),
    /** Keeps the current target fitted after the viewport changed (fullscreen, window resize). */
    refit: () => {
      const index = presentedIndex()
      if (index === null) {
        return
      }
      const document = port.getDocument()
      const viewport = port.getViewport()
      const { overview } = port.getPosition()
      const at = frameShotAt(document, index)
      const target = overview
        ? cameraForOverview(document, viewport)
        : at && shotCamera(at, viewport)
      if (!target || !at) {
        return
      }
      const flightMs = overview ? document.settings.transitionMs : at.motion.ms
      // Why: a flight under way (e.g. into the macOS fullscreen animation) keeps its full length.
      if (flying && port.isAnimating()) {
        if (overview) {
          flyToOverview(flightMs)
        } else {
          fly(at, { durationMs: flightMs })
        }
        return
      }
      if (!port.isAnimating() && camerasEqual(port.getCamera(), target)) {
        return
      }
      const durationMs = Math.min(SETTLE_MS, flightMs)
      if (overview) {
        flyToOverview(durationMs, false)
      } else {
        fly(at, { durationMs }, false)
      }
    }
  }
}
