import { cameraForWorldCenter, clampZoom } from './camera-transform'
import type { Camera, Rect, Size } from './element-types'

export const FRAME_FIT_PADDING_RATIO = 0.04

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
