export type ZoomLayerCssStyle = { zoom: number; fontOpticalSizing: 'auto' | 'none' }

function isBlink(userAgent: string): boolean {
  return /Chrome|Chromium|Edg\//.test(userAgent)
}

function isWebKit(userAgent: string): boolean {
  return /AppleWebKit/.test(userAgent) && !isBlink(userAgent)
}

/**
 * Whether the engine sizes the system font's optical design and tracking from the laid-out
 * (zoomed) font size. WebKit does: 11px text scaled 4× on the compositor is up to 14% wider than
 * the same text laid out at 44px. Blink keeps the optical design tied to CSS px; font rounding
 * can still produce small metric differences when a composited world changes layout zoom.
 */
export function textMetricsFollowLayoutZoom(userAgent: string): boolean {
  return isWebKit(userAgent)
}

export function worldLayerWillChange({
  denseVectors,
  presenting,
  previewing,
  userAgent
}: {
  denseVectors: boolean
  presenting: boolean
  previewing: boolean
  userAgent: string
}): 'transform' | 'auto' {
  // Avoid re-promoting Blink worlds on exit; leave other engines' dense-world policy intact.
  if (!denseVectors || isBlink(userAgent)) {
    return 'auto'
  }
  return isWebKit(userAgent) && presenting && !previewing ? 'auto' : 'transform'
}

/**
 * Inline style of the layer laid out at `baseZoom`; the editor and the export player share it.
 * Why: the layout zoom is committed only once the camera settles, and text metrics must not
 * depend on it, or every commit (a flight landing, wheel zoom settling) visibly reflows the text.
 * Turning optical sizing off makes WebKit's glyph advances scale linearly. Blink is left alone:
 * there `none` would introduce size-dependent tracking changes.
 */
export function zoomLayerCssStyle(baseZoom: number, userAgent: string): ZoomLayerCssStyle {
  return {
    zoom: baseZoom,
    fontOpticalSizing: textMetricsFollowLayoutZoom(userAgent) ? 'none' : 'auto'
  }
}
