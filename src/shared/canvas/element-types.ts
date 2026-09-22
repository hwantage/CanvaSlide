import { z } from 'zod'
import { cameraEasings, DEFAULT_CAMERA_EASING } from './camera-easing'
import { parseVideoSource } from './video-source'
import {
  anchorSides,
  arrowHeads,
  canvasBackgrounds,
  connectorRoutes,
  DEFAULT_CAMERA_ARC,
  DOCUMENT_VERSION,
  frameBorderStyles,
  MAX_CAMERA_ARC,
  MAX_ROLL_DEGREES,
  MAX_SVG_RESOURCE_PARTS,
  MAX_TRANSITION_MS,
  MIN_CAMERA_ARC,
  shapeKinds,
  textAligns
} from './element-runtime'

// Existing editor callers can keep this API; playback imports element-runtime directly.
export * from './element-runtime'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = Point & Size

export type ElementId = string

export type ShapeKind = (typeof shapeKinds)[number]

export type TextAlign = (typeof textAligns)[number]

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
})

const elementBaseSchema = rectSchema.extend({
  id: z.string().min(1),
  // Why: groups are flat sets of elements sharing an id (Miro-style); optional so older files load.
  groupId: z.string().min(1).optional(),
  // Copied frames and contents share a key to disambiguate overlapping source/copy bounds.
  frameContentKey: z.string().min(1).optional()
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
  bold: z.boolean(),
  italic: z.boolean().optional(),
  lineHeight: z.number().finite().min(0.1).max(10).optional(),
  // Why: optional so documents saved before font selection existed keep loading unchanged;
  // absent means the app's default sans stack (see font-family.ts).
  fontFamily: z.string().optional()
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
  textStyle: textStyleSchema,
  // Imported frame clipping follows the text when it is moved or resized.
  clip: z
    .object({
      top: z.number().min(0).max(1),
      right: z.number().min(0).max(1),
      bottom: z.number().min(0).max(1),
      left: z.number().min(0).max(1)
    })
    .refine((clip) => clip.left + clip.right < 1 && clip.top + clip.bottom < 1)
    .optional()
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

export const videoElementSchema = elementBaseSchema.extend({
  type: z.literal('video'),
  url: z.string().refine((url) => parseVideoSource(url, true) !== null),
  autoplay: z.boolean().optional()
})
export type VideoElement = z.infer<typeof videoElementSchema>

/** Omitted camera fields inherit document settings, except roll, which defaults to zero. */
export const frameTransitionSchema = z.object({
  /** Flight duration to this frame. */
  ms: z.number().int().min(0).max(MAX_TRANSITION_MS).optional(),
  easing: z.enum(cameraEasings).optional(),
  /** van Wijk arc height (ρ): low skims across the board, high rises and dives. */
  arc: z.number().min(MIN_CAMERA_ARC).max(MAX_CAMERA_ARC).optional(),
  /** Camera roll in degrees while this frame is on screen. Presentation only; editing never rolls. */
  roll: z.number().min(-MAX_ROLL_DEGREES).max(MAX_ROLL_DEGREES).optional(),
  /** Dim strength outside the frame, 0 = off. */
  spotlight: z.number().min(0).max(1).optional()
})
export type FrameTransition = z.infer<typeof frameTransitionSchema>

export const frameElementSchema = elementBaseSchema.extend({
  type: z.literal('frame'),
  name: z.string(),
  // Why: presentation order is explicit so the user can reorder without moving frames.
  order: z.number().int().nonnegative(),
  transition: frameTransitionSchema.optional()
})
export type FrameElement = z.infer<typeof frameElementSchema>

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

export type ConnectorRoute = (typeof connectorRoutes)[number]
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
  videoElementSchema,
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

export type CanvasBackground = (typeof canvasBackgrounds)[number]

export type FrameBorderStyle = (typeof frameBorderStyles)[number]

// Defaults let authors specify only the settings their presentation needs.
export const documentSettingsSchema = z.object({
  transitionMs: z.number().int().min(0).max(MAX_TRANSITION_MS),
  // Why: these three are the document-wide defaults a frame's own `transition` overrides.
  transitionEasing: z.enum(cameraEasings).default(DEFAULT_CAMERA_EASING),
  transitionArc: z.number().min(MIN_CAMERA_ARC).max(MAX_CAMERA_ARC).default(DEFAULT_CAMERA_ARC),
  spotlight: z.number().min(0).max(1).default(0),
  background: z.enum(canvasBackgrounds).default('dots'),
  frameBorder: z.enum(frameBorderStyles).default('solid')
})
export type DocumentSettings = z.infer<typeof documentSettingsSchema>

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

/** SVG text stays editable; objects insert a shared data resource at that point. */
export const imageResourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('data'), data: z.string().regex(/^data:image\/[^,]+,/i) }),
  z.object({
    type: z.literal('svg'),
    parts: z
      .array(z.union([z.string(), z.object({ resourceId: z.string().min(1) })]))
      .max(MAX_SVG_RESOURCE_PARTS)
  })
])
export type ImageResource = z.infer<typeof imageResourceSchema>

export const fileImageAssetSchema = imageAssetSchema.omit({ data: true }).extend({
  resourceId: z.string().min(1)
})
export type FileImageAsset = z.infer<typeof fileImageAssetSchema>

/** The single UTF-8 JSON file contract; renderers receive resolved image data URLs. */
export const documentFileSchema = canvasDocumentSchema.extend({
  assets: z.record(z.string(), fileImageAssetSchema),
  resources: z.record(z.string(), imageResourceSchema)
})
export type DocumentFile = z.infer<typeof documentFileSchema>
