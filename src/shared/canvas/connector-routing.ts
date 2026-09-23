import type { AnchorSide, Point, Rect } from './element-types'

/** Path shapes for connectors: elbow routing with stubs and scoring, and bezier controls. */

/** Outward unit normal for a side; `null` for free ends (direction inferred from the other end). */
export function sideNormal(side: AnchorSide | undefined): Point | null {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    case undefined:
      return null
  }
}

/** Distance a connector travels straight out of its anchor before it may turn. */
const ELBOW_STUB = 24

function segmentCrossesRect(a: Point, b: Point, rect: Rect): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return minX < rect.x + rect.width && maxX > rect.x && minY < rect.y + rect.height && maxY > rect.y
}

function direction(a: Point, b: Point): Point {
  return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }
}

function scoreEnd(step: Point, wanted: Point | null): number {
  if (!wanted || (step.x === 0 && step.y === 0)) {
    return 0
  }
  if (step.x === wanted.x && step.y === wanted.y) {
    return 2
  }
  if (step.x === -wanted.x && step.y === -wanted.y) {
    return -3
  }
  return 0
}

/** Drops zero-length and collinear intermediate points. */
function simplifyPolyline(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (last && last.x === p.x && last.y === p.y) {
      continue
    }
    const prev = out.at(-2)
    if (
      last &&
      prev &&
      ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))
    ) {
      out[out.length - 1] = p
      continue
    }
    out.push(p)
  }
  return out
}

/**
 * Elbow routing: leave each anchor straight for `ELBOW_STUB`, then pick the Manhattan path between
 * the two stub points that keeps going outward, arrives inward, avoids the host boxes and turns least.
 */
export function orthogonalPoints(
  a: Point,
  aSide: AnchorSide | undefined,
  b: Point,
  bSide: AnchorSide | undefined,
  obstacles: Rect[]
): Point[] {
  const na = sideNormal(aSide)
  const nb = sideNormal(bSide)
  const s0 = na ? { x: a.x + na.x * ELBOW_STUB, y: a.y + na.y * ELBOW_STUB } : a
  const s3 = nb ? { x: b.x + nb.x * ELBOW_STUB, y: b.y + nb.y * ELBOW_STUB } : b
  const arrive = nb ? { x: -nb.x, y: -nb.y } : null
  const midX = (s0.x + s3.x) / 2
  const midY = (s0.y + s3.y) / 2
  const candidates: Point[][] = [
    [s0, { x: s3.x, y: s0.y }, s3],
    [s0, { x: s0.x, y: s3.y }, s3],
    [s0, { x: midX, y: s0.y }, { x: midX, y: s3.y }, s3],
    [s0, { x: s0.x, y: midY }, { x: s3.x, y: midY }, s3]
  ]
  let best: Point[] = candidates[2] as Point[]
  let bestScore = Number.NEGATIVE_INFINITY
  for (const candidate of candidates) {
    const inner = simplifyPolyline(candidate)
    if (inner.length < 2) {
      continue
    }
    let score = scoreEnd(direction(inner[0] as Point, inner[1] as Point), na)
    score += scoreEnd(direction(inner.at(-2) as Point, inner.at(-1) as Point), arrive)
    score -= (inner.length - 2) * 0.5
    for (let i = 1; i < inner.length; i += 1) {
      for (const rect of obstacles) {
        if (segmentCrossesRect(inner[i - 1] as Point, inner[i] as Point, rect)) {
          score -= 4
        }
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = inner
    }
  }
  const route = simplifyPolyline([a, ...best, b])
  // Why: a connector just clicked into being has a = b, and each end's marker needs a neighbour.
  return route.length >= 2 ? route : [a, b]
}

export function curveControls(
  a: Point,
  aSide: AnchorSide | undefined,
  b: Point,
  bSide: AnchorSide | undefined
) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const reach = Math.max(40, distance / 2)
  const na =
    sideNormal(aSide) ??
    (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
      ? { x: Math.sign(b.x - a.x) || 1, y: 0 }
      : { x: 0, y: Math.sign(b.y - a.y) || 1 })
  const nb = sideNormal(bSide) ?? { x: -na.x, y: -na.y }
  return {
    c1: { x: a.x + na.x * reach, y: a.y + na.y * reach },
    c2: { x: b.x + nb.x * reach, y: b.y + nb.y * reach }
  }
}

export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  }
}
