import { elementRect, interpolateRect } from '@shared/canvas/element-bounds'
import { fitRectToViewport } from '@shared/canvas/frame-fit'
import { frameIndexById, orderedFrames } from '@shared/canvas/presentation-sequence'
import {
  resolveFrameTransition,
  type ResolvedFrameTransition
} from '@shared/canvas/frame-transition'
import type {
  Camera,
  CanvasDocument,
  ElementId,
  FrameElement,
  Rect,
  Size
} from '@shared/canvas/element-types'

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
  return shot
    ? fitRectToViewport(elementRect(shot.frame), viewport, undefined, shot.motion.roll)
    : null
}

/** Everything the presentation stage draws that is not the camera itself. */
export type Shot = { roll: number; spotlight: number; spotlightRect: Rect | null }

/**
 * Lerps the whole shot — roll, dimming and the cut-out — so the caller can run it on the camera's
 * own eased clock and have it land with the move. The rect travels too: handing the hole to the
 * target frame up front makes a lit frame black out the instant the flight starts. Undefined when
 * there is nothing to animate.
 */
export function shotTween(
  from: Shot,
  to: { roll: number; spotlight: number; rect?: Rect }
): ((t: number) => Shot) | undefined {
  const fromRect = from.spotlightRect ?? to.rect ?? null
  const toRect = to.rect ?? fromRect
  if (from.roll === to.roll && from.spotlight === to.spotlight && fromRect === toRect) {
    return undefined
  }
  return (t) => ({
    roll: from.roll + (to.roll - from.roll) * t,
    spotlight: from.spotlight + (to.spotlight - from.spotlight) * t,
    spotlightRect: fromRect && toRect ? interpolateRect(fromRect, toRect, t) : (toRect ?? fromRect)
  })
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
    camera: departureIndex === null ? null : frameCamera(document, departureIndex, viewport),
    shot: {
      roll: departure?.motion.roll ?? 0,
      spotlight: departure?.motion.spotlight ?? 0,
      spotlightRect: departure ? elementRect(departure.frame) : null
    }
  }
}
