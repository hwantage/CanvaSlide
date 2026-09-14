export type SplitLimits = { minTop: number; minBottom: number; handle: number }

export const SIDE_PANEL_SPLIT: SplitLimits = { minTop: 120, minBottom: 200, handle: 8 }

/**
 * Height for the top pane of a vertical split so both panes keep their minimums inside `total`.
 * When `total` is too small for both, the bottom pane keeps its minimum and the top gets the rest.
 */
export function clampSplit(top: number, total: number, limits: SplitLimits): number {
  const maxTop = total - limits.handle - limits.minBottom
  const clamped = Math.min(top, maxTop)
  return Math.max(Math.min(limits.minTop, maxTop), clamped)
}

/** Default: the top pane takes this share of the panel on first launch. */
export function defaultSplit(total: number, limits: SplitLimits, share = 0.4): number {
  return clampSplit(Math.round(total * share), total, limits)
}
