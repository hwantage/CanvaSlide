import type { FrameHitChrome } from '@shared/canvas/element-bounds'

/** Screen-pixel sizes of frame chrome; divided by zoom to get world units. */
export const FRAME_TITLE_HEIGHT_PX = 24
/** Grab band centred on the frame outline, so it can be selected under overlapping content. */
export const FRAME_BORDER_HIT_PX = 8
export const FRAME_TITLE_FONT_PX = 12
export const SELECTION_HANDLE_PX = 8
/** Screen px from the selection's top edge to the rotation handle's centre, and its diameter. */
export const ROTATION_HANDLE_OFFSET_PX = 24
export const ROTATION_HANDLE_PX = 16
export const DRAG_THRESHOLD_PX = 3
/** Smart-guide snapping distance in screen px (divided by zoom for world units). */
export const SNAP_THRESHOLD_PX = 6
/** How close (screen px) a click must be to a connector line to hit it. */
export const LINE_HIT_PX = 6

/** World-unit hit chrome for the current zoom (screen px ÷ zoom). */
export function frameHitChromeAt(zoom: number): FrameHitChrome {
  return {
    titleHeight: FRAME_TITLE_HEIGHT_PX / zoom,
    borderWidth: FRAME_BORDER_HIT_PX / zoom,
    lineWidth: LINE_HIT_PX / zoom
  }
}
