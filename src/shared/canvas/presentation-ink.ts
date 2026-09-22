import { MIN_ZOOM, screenToWorld } from './camera-transform'
import type { Camera, Point, Size } from './element-types'

/**
 * Geometry for the temporary ink a presenter draws during a slide show. Strokes are world units so
 * they stay on the slide while the camera flies, and they never reach the document: the layer is
 * wiped when the show leaves the slide or ends.
 */

/** Screen distance a sample must clear to earn a point; below it a line only gains hand jitter. */
export const INK_MIN_STEP_PX = 2.5

/** The world distance `INK_MIN_STEP_PX` stands for at this zoom. */
export function inkPointSpacing(zoom: number): number {
  return INK_MIN_STEP_PX / Math.max(zoom, MIN_ZOOM)
}

export function shouldAppendInkPoint(
  points: readonly Point[],
  point: Point,
  spacing: number
): boolean {
  const last = points.at(-1)
  return !last || Math.hypot(point.x - last.x, point.y - last.y) >= spacing
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * Quadratic segments anchored on the sampled points and joined at their midpoints: it smooths hand
 * jitter without fitting a spline over the whole stroke, which is what a live redraw can afford.
 *
 * Ink is a line, so a lone sample paints nothing: a click while pointing should leave no mark. It
 * also keeps zero-length subpaths out of the layer, which WebKit draws ignoring
 * `vector-effect="non-scaling-stroke"` — a round cap in world units, 256px wide at a 64× camera.
 */
export function inkPathData(points: readonly Point[]): string {
  const first = points[0]
  if (
    !first ||
    !points.some((point) => round(point.x) !== round(first.x) || round(point.y) !== round(first.y))
  ) {
    return ''
  }
  let data = `M${round(first.x)},${round(first.y)}`
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!
    const next = points[index + 1]!
    data += `Q${round(point.x)},${round(point.y)} ${round((point.x + next.x) / 2)},${round(
      (point.y + next.y) / 2
    )}`
  }
  const last = points.at(-1)!
  return `${data}L${round(last.x)},${round(last.y)}`
}

function rotateAround(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos }
}

/**
 * Screen point → world while presenting. The stage rolls the world about the viewport centre, so
 * the cursor has to be rolled back before the camera can be undone.
 */
export function presentationWorldPoint(
  screen: Point,
  camera: Camera,
  viewport: Size,
  roll: number
): Point {
  const center = { x: viewport.width / 2, y: viewport.height / 2 }
  return screenToWorld(camera, roll === 0 ? screen : rotateAround(screen, center, -roll))
}
