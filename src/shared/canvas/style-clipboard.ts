import type { CanvasElement, ConnectorStyle, ShapeStyle, TextStyle } from './element-types'

/** Formatting lifted off one element; every part is optional so any element can donate. */
export type StyleClip = {
  shape?: ShapeStyle
  connector?: ConnectorStyle
  text?: TextStyle
}

export function extractStyleClip(element: CanvasElement): StyleClip | null {
  switch (element.type) {
    case 'shape':
      return { shape: { ...element.style }, text: { ...element.textStyle } }
    case 'text':
      return { text: { ...element.textStyle } }
    case 'connector':
      return { connector: { ...element.style }, text: { ...element.textStyle } }
    default:
      return null
  }
}

/** Patch that applies whatever parts of `clip` fit `element`; empty when nothing applies. */
export function styleClipPatch(element: CanvasElement, clip: StyleClip): Partial<CanvasElement> {
  switch (element.type) {
    case 'shape':
      return {
        ...(clip.shape ? { style: { ...clip.shape } } : {}),
        ...(clip.text ? { textStyle: { ...clip.text } } : {})
      }
    case 'text':
      return clip.text ? { textStyle: { ...clip.text } } : {}
    case 'connector':
      return {
        ...(clip.connector ? { style: { ...clip.connector } } : {}),
        ...(clip.text ? { textStyle: { ...clip.text } } : {})
      }
    default:
      return {}
  }
}
