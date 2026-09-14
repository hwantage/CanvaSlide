import type { CanvasDocument } from './element-types'

export type StandaloneHtmlInput = {
  document: CanvasDocument
  playerScript: string
  /** `@font-face` rules for embedded installed fonts (see font-embedding.ts); optional. */
  fontFaceCss?: string
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** JSON inside <script> must never contain a closing tag sequence. */
export function embedJsonSafely(value: unknown): string {
  // Why: `\u003c` is valid JSON for `<`, so JSON.parse round-trips while HTML never sees a tag.
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

/** One self-contained page: no external requests, opens from disk in any modern browser. */
export function buildStandaloneHtml({
  document,
  playerScript,
  fontFaceCss
}: StandaloneHtmlInput): string {
  const title = escapeHtml(document.name.trim() === '' ? 'Untitled' : document.name.trim())
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="CanvaSlide">',
    `<title>${title}</title>`,
    // Why: base64 font data never contains `</`, so the rules can sit inline safely.
    ...(fontFaceCss ? [`<style>${fontFaceCss}</style>`] : []),
    '</head>',
    '<body>',
    `<script id="canvas-document" type="application/json">${embedJsonSafely(document)}</script>`,
    `<script>${playerScript}</script>`,
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

export function estimateHtmlBytes(html: string): number {
  return new TextEncoder().encode(html).length
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
