import type { Point } from './element-types'

export const MAX_FIG_BYTES = 128 * 1024 * 1024

export type FigGuid = { sessionID: number; localID: number }
export type FigMatrix = {
  m00: number
  m01: number
  m02: number
  m10: number
  m11: number
  m12: number
}
export type FigColor = { r: number; g: number; b: number; a?: number }
export type FigPaint = {
  type: string
  visible?: boolean
  opacity?: number
  color?: FigColor
  blendMode?: string
  transform?: FigMatrix
  image?: { hash?: Uint8Array }
  imageScaleMode?: string
  originalImageWidth?: number
  originalImageHeight?: number
  stops?: { color: FigColor; position: number }[]
}
export type FigGeometry = { commandsBlob: number; windingRule?: string; styleID?: number }
export type FigNode = {
  guid: FigGuid
  type: string
  name?: string
  phase?: string
  parentIndex?: { guid: FigGuid; position?: string }
  visible?: boolean
  internalOnly?: boolean
  size?: Point
  transform?: FigMatrix
  opacity?: number
  blendMode?: string
  fillPaints?: FigPaint[]
  strokePaints?: FigPaint[]
  fillGeometry?: FigGeometry[]
  strokeGeometry?: FigGeometry[]
  strokeWeight?: number
  strokeAlign?: string
  cornerRadius?: number
  rectangleTopLeftCornerRadius?: number
  rectangleTopRightCornerRadius?: number
  rectangleBottomLeftCornerRadius?: number
  rectangleBottomRightCornerRadius?: number
  resizeToFit?: boolean
  frameMaskDisabled?: boolean
  mask?: boolean
  isMask?: boolean
  effects?: { type: string; visible?: boolean }[]
  fontSize?: number
  lineHeight?: { value: number; units: string }
  fontName?: { family?: string; style?: string }
  textAlignHorizontal?: string
  textData?: {
    characters?: string
    characterStyleIDs?: number[]
    styleOverrideTable?: (Partial<FigNode> & { styleID: number })[]
  }
  derivedTextData?: {
    glyphs?: {
      commandsBlob: number
      position: Point
      fontSize: number
      firstCharacter?: number
      rotation?: number
    }[]
  }
  textStyleTable?: (FigNode & { styleID?: number })[]
}
export type FigFile = {
  nodes: FigNode[]
  blobs: { bytes: Uint8Array }[]
  images: Map<string, Uint8Array>
  name: string
}
export type FigPage = { id: string; name: string; count: number }
export type FigWarning = 'unsupported' | 'effects' | 'paint' | 'missingImage' | 'text' | 'mask'
export type FigWarnings = Record<FigWarning, number>

export function figId(guid: FigGuid): string {
  return `${guid.sessionID}:${guid.localID}`
}

export function emptyFigWarnings(): FigWarnings {
  return { unsupported: 0, effects: 0, paint: 0, missingImage: 0, text: 0, mask: 0 }
}
