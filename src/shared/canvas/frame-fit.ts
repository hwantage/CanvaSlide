import { cameraForWorldCenter, clampZoom, MAX_ZOOM } from './camera-transform'
import { contentBounds, elementRect, unionRects } from './element-bounds'
import { orderedFrames } from './presentation-sequence'
import { DEFAULT_CAMERA } from './camera-transform'
import type { CanvasDocument, Camera, Rect, Size } from './element-types'

export const FRAME_FIT_PADDING_RATIO = 0.04
/** Margin on each side of the frame bounds; increase for a smaller overview. */
export const OVERVIEW_FIT_PADDING_RATIO = 0.08

/** Camera that shows `rect` fully inside `viewport` (contain fit), centered. */
export function fitRectToViewport(
  rect: Rect,
  viewport: Size,
  paddingRatio: number = FRAME_FIT_PADDING_RATIO
): Camera {
  const paddedWidth = rect.width * (1 + 2 * paddingRatio)
  const paddedHeight = rect.height * (1 + 2 * paddingRatio)
  const zoom = clampZoom(Math.min(viewport.width / paddedWidth, viewport.height / paddedHeight))
  return cameraForWorldCenter(
    { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    zoom,
    viewport
  )
}

/** Overview must contain the whole board even below the manual zoom minimum. */
export function fitOverviewToViewport(rect: Rect, viewport: Size): Camera {
  const paddingScale = 1 + 2 * Math.max(0, OVERVIEW_FIT_PADDING_RATIO)
  const zoom = Math.min(
    MAX_ZOOM,
    viewport.width / (rect.width * paddingScale),
    viewport.height / (rect.height * paddingScale)
  )
  return {
    zoom,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * zoom,
    y: viewport.height / 2 - (rect.y + rect.height / 2) * zoom
  }
}

/** Large backdrops outside the slides must not shrink or shift the frame picker. */
export function cameraForOverview(document: CanvasDocument, viewport: Size): Camera | null {
  const bounds = unionRects(orderedFrames(document).map(elementRect)) ?? contentBounds(document)
  return bounds ? fitOverviewToViewport(bounds, viewport) : null
}

/** Fit-all: like a frame fit but never zooms in past 100% so small content stays readable. */
export function fitContentToViewport(rect: Rect, viewport: Size, maxZoom = 1): Camera {
  const fitted = fitRectToViewport(rect, viewport, 0.08)
  if (fitted.zoom <= maxZoom) {
    return fitted
  }
  return cameraForWorldCenter(
    { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    maxZoom,
    viewport
  )
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
