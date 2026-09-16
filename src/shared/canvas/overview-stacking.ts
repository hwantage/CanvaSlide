import type { ElementId, FrameElement } from './element-types'

/** World area a frame covers; the sort key for overview hit targets. */
export function frameArea(frame: FrameElement): number {
  return Math.max(0, frame.width) * Math.max(0, frame.height)
}

/**
 * Overview stacks its hit targets smallest-on-top: a frame that wraps (or merely covers) others
 * must not swallow their clicks. Rank 0 is the bottom-most — the largest frame.
 * Equal areas keep sequence order, so the later frame stays on top as plain DOM order would.
 */
export function overviewStackRanks(frames: readonly FrameElement[]): Record<ElementId, number> {
  const ranked = frames
    .map((frame, index) => ({ id: frame.id, area: frameArea(frame), index }))
    .sort((a, b) => b.area - a.area || a.index - b.index)
  return Object.fromEntries(ranked.map((entry, rank) => [entry.id, rank]))
}

/**
 * Player stacking: frame outlines live in the same layer as the slide content and must stay
 * behind it, so ranks map onto negative z-indices ordered the same way.
 */
export function overviewZIndex(rank: number, count: number): number {
  return rank - count
}
