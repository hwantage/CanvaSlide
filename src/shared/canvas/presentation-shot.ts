import { elementRect, interpolateRect } from './element-bounds'
import { fitRectToViewport } from './frame-fit'
import { frameIndexById, orderedFrames } from './presentation-sequence'
import { resolveFrameTransition, type ResolvedFrameTransition } from './frame-transition'
import { worldRectToScreen } from './camera-transform'
import type { Camera, CanvasDocument, ElementId, FrameElement, Rect, Size } from './element-types'

/** A frame and the transition it presents with, the document defaults already folded in. */
export type FrameShot = { frame: FrameElement; motion: ResolvedFrameTransition }

export function frameShotAt(document: CanvasDocument, index: number): FrameShot | null {
  const frame = orderedFrames(document)[index]
  return frame ? { frame, motion: resolveFrameTransition(frame, document.settings) } : null
}

/** Where the camera has to sit for that frame to fill the viewport, its own tilt included. */
export function frameCamera(
  document: CanvasDocument,
  index: number,
  viewport: Size
): Camera | null {
  const shot = frameShotAt(document, index)
  return shot ? shotCamera(shot, viewport) : null
}

export function shotCamera(shot: FrameShot, viewport: Size): Camera {
  return fitRectToViewport(elementRect(shot.frame), viewport, undefined, shot.motion.roll)
}

/** Everything the presentation stage draws that is not the camera itself. */
export type Shot = { roll: number; spotlight: number; spotlightRect: Rect | null }

export const LEVEL_SHOT: Shot = { roll: 0, spotlight: 0, spotlightRect: null }

/** The shot a frame is presented with: its tilt, its dimming and itself as the lit cut-out. */
export function frameShot(shot: FrameShot): Shot {
  return {
    roll: shot.motion.roll,
    spotlight: shot.motion.spotlight,
    spotlightRect: elementRect(shot.frame)
  }
}

/**
 * Lerps the whole shot — roll, dimming and the cut-out — so the caller can run it on the camera's
 * own eased clock and have it land with the move. The rect travels too: handing the hole to the
 * target frame up front makes a lit frame black out the instant the flight starts. Undefined when
 * there is nothing to animate.
 */
export function shotTween(from: Shot, to: Shot): ((t: number) => Shot) | undefined {
  const fromRect = from.spotlightRect ?? to.spotlightRect
  const toRect = to.spotlightRect ?? fromRect
  if (from.roll === to.roll && from.spotlight === to.spotlight && fromRect === toRect) {
    return undefined
  }
  return (t) => ({
    roll: from.roll + (to.roll - from.roll) * t,
    spotlight: from.spotlight + (to.spotlight - from.spotlight) * t,
    spotlightRect: fromRect && toRect ? interpolateRect(fromRect, toRect, t) : (toRect ?? fromRect)
  })
}

/** Inline style of the stage while the shot rolls; level stages carry no transform at all. */
export function stageRollStyle(roll: number): { transform: string; willChange: string } {
  return roll === 0
    ? { transform: '', willChange: 'auto' }
    : { transform: `rotate(${roll}deg)`, willChange: 'transform' }
}

/** Times the viewport so the dim still covers every corner once the stage rolls. */
export const SPOTLIGHT_COVER = 3

// Why: returning null lets either renderer hide the mask when there is no visible spotlight.
export function spotlightMaskPath(shot: Shot, camera: Camera, viewport: Size): string | null {
  if (shot.spotlight <= 0.001 || !shot.spotlightRect) {
    return null
  }
  const hole = worldRectToScreen(camera, shot.spotlightRect)
  const spanX = viewport.width * SPOTLIGHT_COVER
  const spanY = viewport.height * SPOTLIGHT_COVER
  return (
    `M${-spanX},${-spanY}H${spanX}V${spanY}H${-spanX}Z` +
    `M${hole.x},${hole.y}h${hole.width}v${hole.height}h${-hole.width}Z`
  )
}

/** The still a preview into a frame opens on, and where it goes from there. */
export type PreviewDeparture = {
  /** Where the previewed frame sits in the deck right now. */
  index: number
  /** The frame the flight departs from; null for the opening frame, which has no frame before it. */
  departureIndex: number | null
  /** Where the camera parks for the hold; null when the preview starts from the editor's own view. */
  camera: Camera | null
  /** The departing frame's tilt and dimming, so the hold looks the way a slide show would there. */
  shot: Shot
}

/** Null when `frameId` is not a frame of this document. */
export function previewDeparture(
  document: CanvasDocument,
  frameId: ElementId,
  viewport: Size
): PreviewDeparture | null {
  const index = frameIndexById(orderedFrames(document), frameId)
  if (index === -1) {
    return null
  }
  // Why: the opening frame has no incoming flight, so its preview starts wherever the editor is.
  const departureIndex = index > 0 ? index - 1 : null
  const departure = departureIndex === null ? null : frameShotAt(document, departureIndex)
  return {
    index,
    departureIndex,
    camera: departure ? shotCamera(departure, viewport) : null,
    shot: departure ? frameShot(departure) : LEVEL_SHOT
  }
}
