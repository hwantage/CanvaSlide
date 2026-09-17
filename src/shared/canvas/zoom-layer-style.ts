export type ZoomLayerCssStyle = { zoom: number; fontOpticalSizing: 'auto' | 'none' }

/**
 * Whether the engine sizes the system font's optical design and tracking from the laid-out
 * (zoomed) font size. WebKit does: 11px text scaled 4× on the compositor is up to 14% wider than
 * the same text laid out at 44px. Blink sizes them from the CSS px size, so both layouts agree.
 */
export function textMetricsFollowLayoutZoom(userAgent: string): boolean {
  return /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent)
}

/**
 * Inline style of the layer laid out at `baseZoom`; the editor and the export player share it.
 * Why: the layout zoom is committed only once the camera settles, and text metrics must not
 * depend on it, or every commit (a flight landing, wheel zoom settling) visibly reflows the text.
 * Turning optical sizing off makes WebKit's glyph advances scale linearly, so a text box wraps the
 * same at every zoom. Blink is left alone: there `none` is what would make the two layouts differ.
 */
export function zoomLayerCssStyle(baseZoom: number, userAgent: string): ZoomLayerCssStyle {
  return {
    zoom: baseZoom,
    fontOpticalSizing: textMetricsFollowLayoutZoom(userAgent) ? 'none' : 'auto'
  }
}
