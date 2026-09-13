/** Marker for "no fill" / "no stroke"; SVG understands it directly. */
export const NO_COLOR = 'none'
export const RECENT_COLORS_MAX = 8

/** Accepts `#rgb`, `#rrggbb`, with or without the hash, any case; returns lower-case `#rrggbb`. */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`
  }
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${[...trimmed.toLowerCase()].map((c) => c + c).join('')}`
  }
  return null
}

export function isNoColor(color: string): boolean {
  return color === NO_COLOR || color === 'transparent'
}

/** Most recent first, deduplicated, capped; "none" is never worth remembering. */
export function pushRecentColor(
  recent: readonly string[],
  color: string,
  max = RECENT_COLORS_MAX
): string[] {
  const normalized = normalizeHexColor(color)
  if (!normalized) {
    return [...recent]
  }
  return [normalized, ...recent.filter((c) => c !== normalized)].slice(0, max)
}
