/**
 * `textStyle.fontFamily` holds either a preset id (a cross-platform stack) or the name of an
 * installed font family. Presets keep a document looking the same on macOS, Windows and in the
 * HTML export; a named family falls back to the sans stack where it is not installed.
 */
export const fontFamilyIds = ['default', 'sans', 'serif', 'mono', 'rounded', 'display'] as const
export type FontFamilyId = (typeof fontFamilyIds)[number]

const KOREAN_FALLBACK = "'Apple SD Gothic Neo', 'Malgun Gothic'"

export const fontStacks: Record<Exclude<FontFamilyId, 'default'>, string> = {
  sans: `'Helvetica Neue', Arial, ${KOREAN_FALLBACK}, sans-serif`,
  serif: `Georgia, 'Times New Roman', 'Apple Myungjo', Batang, serif`,
  mono: `Menlo, Consolas, 'Courier New', monospace`,
  rounded: `'Chalkboard SE', 'Comic Sans MS', ${KOREAN_FALLBACK}, cursive`,
  display: `Impact, 'Arial Black', ${KOREAN_FALLBACK}, sans-serif`
}

export function isFontFamilyId(value: string | undefined): value is FontFamilyId {
  return value !== undefined && (fontFamilyIds as readonly string[]).includes(value)
}

/** CSS-safe form of an installed family name (`"Nanum Gothic"`), quotes inside escaped. */
export function quoteFontFamily(name: string): string {
  return `"${name.replace(/["\\]/g, '\\$&')}"`
}

/** CSS `font-family` for a stored value; empty/default inherits the surrounding default. */
export function fontStackFor(value: string | undefined): string | undefined {
  if (!value || value === 'default') {
    return undefined
  }
  if (isFontFamilyId(value) && value !== 'default') {
    return fontStacks[value]
  }
  return `${quoteFontFamily(value)}, ${fontStacks.sans}`
}
