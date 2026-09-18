import { syncConnectorGeometry } from './connector-geometry'
import { patchElements } from './document-mutations'
import type { CanvasDocument, ElementId } from './element-types'

/** Height of one line at `fontSize`: the editor's line-height, and the floor a text box keeps. */
export function textLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.4)
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
  const height = Math.max(textLineHeight(element.textStyle.fontSize), Math.ceil(measuredHeight))
  if (Math.abs(height - element.height) <= 1) {
    return document
  }
  return syncConnectorGeometry(patchElements(document, [id], { height }))
}
