import type { Rect } from './element-types'

/**
 * Smart guides for dragging: snap the moving bounds to other elements' edges/centers and to
 * equal spacing between neighbours. Pure: world units in, a delta plus drawable guides out.
 */

export type SnapAxis = 'x' | 'y'

export type SnapGuide =
  /** A line at `position` on `axis`, spanning [from, to] on the other axis. */
  | { kind: 'line'; axis: SnapAxis; position: number; from: number; to: number }
  /** Equal-gap markers: segments along `axis`, drawn at `cross` on the other axis. */
  | { kind: 'gap'; axis: SnapAxis; cross: number; segments: { from: number; to: number }[] }

export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] }

type AxisRect = { start: number; end: number; crossStart: number; crossEnd: number }

function alongAxis(rect: Rect, axis: SnapAxis): AxisRect {
  return axis === 'x'
    ? {
        start: rect.x,
        end: rect.x + rect.width,
        crossStart: rect.y,
        crossEnd: rect.y + rect.height
      }
    : {
        start: rect.y,
        end: rect.y + rect.height,
        crossStart: rect.x,
        crossEnd: rect.x + rect.width
      }
}

type Candidate = { delta: number; guides: SnapGuide[] }

function edgeCandidates(
  moving: AxisRect,
  others: AxisRect[],
  axis: SnapAxis,
  threshold: number
): Candidate[] {
  const mid = (r: AxisRect) => (r.start + r.end) / 2
  const movingLines = [moving.start, mid(moving), moving.end]
  const found: Candidate[] = []
  for (const other of others) {
    for (const target of [other.start, mid(other), other.end]) {
      for (const line of movingLines) {
        const delta = target - line
        if (Math.abs(delta) <= threshold) {
          found.push({
            delta,
            guides: [
              {
                kind: 'line',
                axis,
                position: target,
                from: Math.min(moving.crossStart + 0, other.crossStart),
                to: Math.max(moving.crossEnd, other.crossEnd)
              }
            ]
          })
        }
      }
    }
  }
  return found
}

function overlapsCross(a: AxisRect, b: AxisRect): boolean {
  return a.crossStart < b.crossEnd && a.crossEnd > b.crossStart
}

/** Equal spacing: place the moving box after/before a neighbour pair, or centred between them. */
function gapCandidates(
  moving: AxisRect,
  others: AxisRect[],
  axis: SnapAxis,
  threshold: number
): Candidate[] {
  const lane = others.filter((o) => overlapsCross(o, moving)).sort((a, b) => a.start - b.start)
  const size = moving.end - moving.start
  const cross = (moving.crossStart + moving.crossEnd) / 2
  const found: Candidate[] = []
  const consider = (targetStart: number, segments: { from: number; to: number }[]) => {
    const delta = targetStart - moving.start
    if (Math.abs(delta) <= threshold) {
      found.push({ delta, guides: [{ kind: 'gap', axis, cross, segments }] })
    }
  }
  for (let i = 0; i < lane.length; i += 1) {
    const a = lane[i] as AxisRect
    for (let j = i + 1; j < lane.length; j += 1) {
      const b = lane[j] as AxisRect
      const gap = b.start - a.end
      if (gap <= 0) {
        continue
      }
      consider(b.end + gap, [
        { from: a.end, to: b.start },
        { from: b.end, to: b.end + gap }
      ])
      consider(a.start - gap - size, [
        { from: a.start - gap, to: a.start },
        { from: a.end, to: b.start }
      ])
      const inner = gap - size
      if (inner > 0) {
        consider(a.end + inner / 2, [
          { from: a.end, to: a.end + inner / 2 },
          { from: b.start - inner / 2, to: b.start }
        ])
      }
    }
  }
  return found
}

function best(candidates: Candidate[]): Candidate | null {
  let chosen: Candidate | null = null
  for (const candidate of candidates) {
    if (!chosen || Math.abs(candidate.delta) < Math.abs(chosen.delta)) {
      chosen = candidate
    }
  }
  return chosen
}

export function computeSnap(moving: Rect, others: readonly Rect[], threshold: number): SnapResult {
  const result: SnapResult = { dx: 0, dy: 0, guides: [] }
  if (others.length === 0 || threshold <= 0) {
    return result
  }
  for (const axis of ['x', 'y'] as const) {
    const m = alongAxis(moving, axis)
    const os = others.map((o) => alongAxis(o, axis))
    const chosen = best([
      ...edgeCandidates(m, os, axis, threshold),
      ...gapCandidates(m, os, axis, threshold)
    ])
    if (!chosen) {
      continue
    }
    if (axis === 'x') {
      result.dx = chosen.delta
    } else {
      result.dy = chosen.delta
    }
    // Why: every candidate that lands on the same delta is a real alignment; show them all.
    const same = [
      ...edgeCandidates(m, os, axis, threshold),
      ...gapCandidates(m, os, axis, threshold)
    ].filter((c) => Math.abs(c.delta - chosen.delta) < 1e-6)
    result.guides.push(...same.flatMap((c) => c.guides))
  }
  return result
}
