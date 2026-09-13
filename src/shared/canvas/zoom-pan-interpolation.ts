import type { Camera, Point, Size } from './element-types'

/**
 * Smooth zoom-and-pan interpolation after van Wijk & Nuij (2003),
 * "Smooth and efficient zooming and panning". The same math d3.interpolateZoom uses.
 *
 * A view is (cx, cy, w): the world-space center and the visible width in world units.
 * Long jumps naturally zoom out, travel, then zoom back in; short ones stay nearly linear.
 */
export type ZoomView = { cx: number; cy: number; w: number }

export type ZoomPanInterpolator = {
  /** View at normalized progress t ∈ [0, 1]. */
  at: (t: number) => ZoomView
  /** Optimal path length S from the paper; larger means a "longer" perceived journey. */
  pathLength: number
}

const DEFAULT_RHO = Math.SQRT2
const EPSILON2 = 1e-12

function cosh(x: number): number {
  return ((x = Math.exp(x)) + 1 / x) / 2
}
function sinh(x: number): number {
  return ((x = Math.exp(x)) - 1 / x) / 2
}
function tanh(x: number): number {
  return ((x = Math.exp(2 * x)) - 1) / (x + 1)
}

export function createZoomPanInterpolator(
  from: ZoomView,
  to: ZoomView,
  rho: number = DEFAULT_RHO
): ZoomPanInterpolator {
  const { cx: ux0, cy: uy0, w: w0 } = from
  const { cx: ux1, cy: uy1, w: w1 } = to
  const dx = ux1 - ux0
  const dy = uy1 - uy0
  const d2 = dx * dx + dy * dy
  const rho2 = rho * rho
  const rho4 = rho2 * rho2

  // Pure zoom (no translation): exponential in w.
  if (d2 < EPSILON2) {
    const S = Math.abs(Math.log(w1 / w0)) / rho
    const sign = w1 >= w0 ? 1 : -1
    return {
      pathLength: S,
      at: (t) => ({
        cx: ux0 + t * dx,
        cy: uy0 + t * dy,
        w: w0 * Math.exp(sign * rho * t * S)
      })
    }
  }

  const d1 = Math.sqrt(d2)
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1)
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1)
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
  const S = (r1 - r0) / rho
  const coshr0 = cosh(r0)
  const sinhr0 = sinh(r0)

  return {
    pathLength: S,
    at: (t) => {
      const s = t * S
      const u = (w0 / (rho2 * d1)) * (coshr0 * tanh(rho * s + r0) - sinhr0)
      return {
        cx: ux0 + u * dx,
        cy: uy0 + u * dy,
        w: (w0 * coshr0) / cosh(rho * s + r0)
      }
    }
  }
}

export function cameraToZoomView(camera: Camera, viewport: Size): ZoomView {
  const w = viewport.width / camera.zoom
  const h = viewport.height / camera.zoom
  return { cx: -camera.x / camera.zoom + w / 2, cy: -camera.y / camera.zoom + h / 2, w }
}

export function zoomViewToCamera(view: ZoomView, viewport: Size): Camera {
  const zoom = viewport.width / view.w
  return {
    zoom,
    x: viewport.width / 2 - view.cx * zoom,
    y: viewport.height / 2 - view.cy * zoom
  }
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

export type CameraTween = { at: (progress: number) => Camera; pathLength: number }

/** Builds a camera tween between two cameras sharing one viewport. */
export function createCameraTween(from: Camera, to: Camera, viewport: Size): CameraTween {
  const interpolator = createZoomPanInterpolator(
    cameraToZoomView(from, viewport),
    cameraToZoomView(to, viewport)
  )
  return {
    pathLength: interpolator.pathLength,
    at: (progress) => zoomViewToCamera(interpolator.at(easeInOutCubic(progress)), viewport)
  }
}

export function worldCenterOf(view: ZoomView): Point {
  return { x: view.cx, y: view.cy }
}
