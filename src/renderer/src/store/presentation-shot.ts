import { elementRect, interpolateRect } from '@shared/canvas/element-bounds'
import { fitRectToViewport } from '@shared/canvas/frame-fit'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import {
  resolveFrameTransition,
  type ResolvedFrameTransition
} from '@shared/canvas/frame-transition'
import type { Camera, CanvasDocument, FrameElement, Rect, Size } from '@shared/canvas/element-types'

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
