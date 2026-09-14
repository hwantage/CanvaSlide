/**
 * Gap 0..n a pointer at `y` falls into for rows with the given vertical midpoints: above the
 * first midpoint is gap 0, past the last is gap n. A half-pixel bias keeps a pointer exactly on
 * a midpoint (as automation produces) on the "before" side.
 */
export function gapAtPointer(midpoints: readonly number[], y: number): number {
  let gap = 0
  for (const mid of midpoints) {
    if (y >= mid + 0.5) {
      gap += 1
    }
  }
  return gap
}

/** Scroll speed (px per frame) for a pointer `distance` px inside an edge zone of `zone` px. */
export function edgeScrollVelocity(distance: number, zone: number, maxSpeed = 18): number {
  if (distance <= 0) {
    return 0
  }
  return Math.ceil((Math.min(distance, zone) / zone) * maxSpeed)
}
