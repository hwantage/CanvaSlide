import { syncConnectorGeometry } from './connector-geometry'
import { patchElements } from './document-mutations'
import type { CanvasDocument, ElementId } from './element-types'

/** Height of one line at `fontSize`: the editor's line-height, and the floor a text box keeps. */
export function textLineHeight(fontSize: number, lineHeight = 1.4): number {
  return Math.max(1, Math.round(fontSize * lineHeight))
}

/** Reconciles cached text bounds with the renderer's measurement. */
export function syncTextHeight(
  document: CanvasDocument,
  id: ElementId,
  measuredHeight: number
): CanvasDocument {
  const element = document.elements[id]
  if (element?.type !== 'text' || !Number.isFinite(measuredHeight) || measuredHeight < 0) {
    return document
  }
  const lineHeight = textLineHeight(element.textStyle.fontSize, element.textStyle.lineHeight)
  const height = Math.max(lineHeight, Math.ceil(measuredHeight))
  if (Math.abs(height - element.height) <= 1) {
    return document
  }
  return syncConnectorGeometry(patchElements(document, [id], { height }))
}
