import { z } from 'zod'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = Point & Size

export type ElementId = string

export const shapeKinds = ['rectangle', 'ellipse', 'diamond'] as const
export type ShapeKind = (typeof shapeKinds)[number]

export const textAligns = ['left', 'center', 'right'] as const
export type TextAlign = (typeof textAligns)[number]

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
})

const elementBaseSchema = rectSchema.extend({
  id: z.string().min(1)
})

export const shapeStyleSchema = z.object({
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().min(0).max(64),
  cornerRadius: z.number().min(0).max(512)
})
export type ShapeStyle = z.infer<typeof shapeStyleSchema>

export const textStyleSchema = z.object({
  color: z.string(),
  fontSize: z.number().min(4).max(1024),
  align: z.enum(textAligns),
  bold: z.boolean()
})
export type TextStyle = z.infer<typeof textStyleSchema>

export const shapeElementSchema = elementBaseSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(shapeKinds),
  style: shapeStyleSchema,
  text: z.string(),
  textStyle: textStyleSchema
})
export type ShapeElement = z.infer<typeof shapeElementSchema>

export const textElementSchema = elementBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  textStyle: textStyleSchema
})
export type TextElement = z.infer<typeof textElementSchema>

export const imageAssetSchema = z.object({
  id: z.string().min(1),
  mime: z.string().min(1),
  /** data: URL. Content-addressed by `id` so identical pastes share one copy. */
  data: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive()
})
export type ImageAsset = z.infer<typeof imageAssetSchema>
export type AssetId = string

export const imageElementSchema = elementBaseSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive()
})
export type ImageElement = z.infer<typeof imageElementSchema>

/** v1 stored the data URL inline on every image element. Kept only for migration. */
export const legacyImageElementV1Schema = elementBaseSchema.extend({
  type: z.literal('image'),
  src: z.string().min(1),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive()
})
export type LegacyImageElementV1 = z.infer<typeof legacyImageElementV1Schema>

export const frameElementSchema = elementBaseSchema.extend({
  type: z.literal('frame'),
  name: z.string(),
  // Why: presentation order is explicit so the user can reorder without moving frames.
  order: z.number().int().nonnegative()
})
export type FrameElement = z.infer<typeof frameElementSchema>

export const anchorSides = ['top', 'right', 'bottom', 'left'] as const
export type AnchorSide = (typeof anchorSides)[number]

/** A connector end: always carries its last resolved world point; attached ends also name a host. */
export const connectorEndSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  elementId: z.string().min(1).optional(),
  side: z.enum(anchorSides).optional(),
  /** Dropped on a specific port: keep that side. Otherwise the side follows the other end. */
  pinned: z.boolean().optional()
})
export type ConnectorEnd = z.infer<typeof connectorEndSchema>

export const connectorRoutes = ['straight', 'orthogonal', 'curved'] as const
export type ConnectorRoute = (typeof connectorRoutes)[number]
export const arrowHeads = ['none', 'arrow'] as const
export type ArrowHead = (typeof arrowHeads)[number]

export const connectorStyleSchema = z.object({
  stroke: z.string(),
  strokeWidth: z.number().min(1).max(32),
  dashed: z.boolean()
})
export type ConnectorStyle = z.infer<typeof connectorStyleSchema>

// Why: x/y/width/height are the derived bounding box, kept in sync by syncConnectorGeometry()
// so every rect-based feature (selection, box select, frames, snapping) works unchanged.
export const connectorElementSchema = elementBaseSchema.extend({
  type: z.literal('connector'),
  start: connectorEndSchema,
  end: connectorEndSchema,
  route: z.enum(connectorRoutes),
  startHead: z.enum(arrowHeads),
  endHead: z.enum(arrowHeads),
  style: connectorStyleSchema,
  label: z.string(),
  textStyle: textStyleSchema
})
export type ConnectorElement = z.infer<typeof connectorElementSchema>

export const canvasElementSchema = z.discriminatedUnion('type', [
  shapeElementSchema,
  textElementSchema,
  imageElementSchema,
  frameElementSchema,
  connectorElementSchema
])
export type CanvasElement = z.infer<typeof canvasElementSchema>
export type ElementType = CanvasElement['type']

export const cameraSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().positive()
})
export type Camera = z.infer<typeof cameraSchema>

export const canvasBackgrounds = ['dots', 'grid', 'plain'] as const
export type CanvasBackground = (typeof canvasBackgrounds)[number]

export const frameBorderStyles = ['solid', 'dashed', 'none'] as const
export type FrameBorderStyle = (typeof frameBorderStyles)[number]

// Why: every new setting gets a `.default()` so older files keep opening unchanged.
export const documentSettingsSchema = z.object({
  transitionMs: z.number().int().min(0).max(10_000),
  background: z.enum(canvasBackgrounds).default('dots'),
  frameBorder: z.enum(frameBorderStyles).default('solid')
})
export type DocumentSettings = z.infer<typeof documentSettingsSchema>

export const defaultDocumentSettings: DocumentSettings = {
  transitionMs: 1000,
  background: 'dots',
  frameBorder: 'solid'
}

export const DOCUMENT_VERSION = 2

export const canvasDocumentSchema = z.object({
  version: z.literal(DOCUMENT_VERSION),
  name: z.string(),
  elements: z.record(z.string(), canvasElementSchema),
  // Why: z-order lives here (bottom → top); `elements` is keyed for O(1) patching.
  order: z.array(z.string()),
  settings: documentSettingsSchema,
  assets: z.record(z.string(), imageAssetSchema),
  camera: cameraSchema.optional()
})
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>

export const canvasDocumentV1Schema = z.object({
  version: z.literal(1),
  name: z.string(),
  elements: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      shapeElementSchema,
      textElementSchema,
      legacyImageElementV1Schema,
      frameElementSchema
    ])
  ),
  order: z.array(z.string()),
  settings: documentSettingsSchema,
  camera: cameraSchema.optional()
})
export type CanvasDocumentV1 = z.infer<typeof canvasDocumentV1Schema>

export const DEFAULT_TRANSITION_MS = 1000

export const defaultShapeStyle: ShapeStyle = {
  fill: '#dbeafe',
  stroke: '#2563eb',
  strokeWidth: 2,
  cornerRadius: 8
}

export const defaultConnectorStyle: ConnectorStyle = {
  stroke: '#52525b',
  strokeWidth: 1,
  dashed: false
}

export const defaultTextStyle: TextStyle = {
  color: '#18181b',
  fontSize: 20,
  align: 'left',
  bold: false
}

export function createEmptyDocument(name = 'Untitled'): CanvasDocument {
  return {
    version: DOCUMENT_VERSION,
    name,
    elements: {},
    order: [],
    settings: { ...defaultDocumentSettings },
    assets: {}
  }
}

export function isFrameElement(element: CanvasElement): element is FrameElement {
  return element.type === 'frame'
}
