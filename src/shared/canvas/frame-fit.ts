import { DEFAULT_CAMERA, MAX_ZOOM, clampZoom } from './camera-transform'
import { contentBounds, elementRect, unionRects } from './element-bounds'
import { orderedFrames } from './presentation-sequence'
import type { CanvasDocument, Camera, Rect, Size } from './element-types'

export const FRAME_FIT_PADDING_RATIO = 0.04
/** Margin on each side of the frame bounds; increase for a smaller overview. */
export const OVERVIEW_FIT_PADDING_RATIO = 0.08

/**
 * Screen-axis extent of `rect` once the view is rolled by `rollDeg`. A rolled frame needs more
 * room than its own width and height, or its corners leave the viewport.
 */
export function rolledSpan(rect: Rect, rollDeg: number): Size {
  if (!rollDeg) {
    return { width: rect.width, height: rect.height }
  }
  const radians = (rollDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  return {
    width: rect.width * cos + rect.height * sin,
    height: rect.width * sin + rect.height * cos
  }
}

/** Zoom at which `rect`, padded on every side and rolled, just fits inside `viewport`. */
function fitZoom(rect: Rect, viewport: Size, paddingRatio: number, rollDeg: number): number {
  const span = rolledSpan(rect, rollDeg)
  const paddingScale = 1 + 2 * Math.max(0, paddingRatio)
  return Math.min(
    viewport.width / (span.width * paddingScale),
    viewport.height / (span.height * paddingScale)
  )
}

/** Camera with `rect`'s centre in the middle of the viewport at `zoom`, whatever the zoom is. */
function centredOn(rect: Rect, zoom: number, viewport: Size): Camera {
  return {
    zoom,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * zoom,
    y: viewport.height / 2 - (rect.y + rect.height / 2) * zoom
  }
}

/** Camera that shows `rect` fully inside `viewport` (contain fit), centered. */
export function fitRectToViewport(
  rect: Rect,
  viewport: Size,
  paddingRatio: number = FRAME_FIT_PADDING_RATIO,
  rollDeg = 0
): Camera {
  const zoom = fitZoom(rect, viewport, paddingRatio, rollDeg)
  return centredOn(rect, clampZoom(zoom), viewport)
}

/** Overview must contain the whole board even below the manual zoom minimum. */
export function fitOverviewToViewport(rect: Rect, viewport: Size): Camera {
  const zoom = fitZoom(rect, viewport, OVERVIEW_FIT_PADDING_RATIO, 0)
  return centredOn(rect, Math.min(MAX_ZOOM, zoom), viewport)
}

/** Large backdrops outside the slides must not shrink or shift the frame picker. */
export function cameraForOverview(document: CanvasDocument, viewport: Size): Camera | null {
  const bounds = unionRects(orderedFrames(document).map(elementRect)) ?? contentBounds(document)
  return bounds ? fitOverviewToViewport(bounds, viewport) : null
}

/** Fit-all: like a frame fit but never zooms in past 100% so small content stays readable. */
export function fitContentToViewport(rect: Rect, viewport: Size, maxZoom = 1): Camera {
  const fitted = fitRectToViewport(rect, viewport, 0.08)
  return fitted.zoom <= maxZoom ? fitted : centredOn(rect, clampZoom(maxZoom), viewport)
}

/** Zoom-to-selection never magnifies past this so a lone small element stays recognisable. */
export const SELECTION_FIT_MAX_ZOOM = 4

/** Fits the selection like a frame fit but capped at `SELECTION_FIT_MAX_ZOOM`. */
export function fitSelectionToViewport(rect: Rect, viewport: Size): Camera {
  return fitContentToViewport(rect, viewport, SELECTION_FIT_MAX_ZOOM)
}

/**
 * Camera for a freshly opened file: everything in view, never past 100%. Why: a document saved
 * while scrolled to empty space would otherwise open looking blank.
 */
export function cameraForOpenedDocument(document: CanvasDocument, viewport: Size): Camera {
  const bounds = contentBounds(document)
  return bounds ? fitContentToViewport(bounds, viewport) : DEFAULT_CAMERA
}
