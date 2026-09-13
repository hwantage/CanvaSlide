export const PASTED_TEXT_MIN_WIDTH = 240
/** Average glyph advance relative to font size for a proportional sans font. */
const GLYPH_WIDTH_RATIO = 0.6

/** Unifies line endings and drops the trailing newline most editors append on copy. */
export function normalizePastedText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

/**
 * Width for a text element created from pasted text: wide enough for the longest line so the
 * user's line breaks survive, but never wider than `maxWidth` (the visible canvas).
 */
export function pastedTextWidth(text: string, fontSize: number, maxWidth: number): number {
  const longest = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  const estimated = Math.ceil(longest * fontSize * GLYPH_WIDTH_RATIO)
  return Math.max(Math.min(estimated, maxWidth), Math.min(PASTED_TEXT_MIN_WIDTH, maxWidth))
}
