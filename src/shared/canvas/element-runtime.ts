import { DEFAULT_CAMERA_EASING } from './camera-easing'
import type {
  CanvasDocument,
  CanvasElement,
  ConnectorStyle,
  DocumentSettings,
  FrameElement,
  ShapeStyle,
  TextStyle
} from './element-types'

// Keep runtime values independent of validation; the standalone player must not load schemas.
/** van Wijk ρ bounds. √2 is the paper's optimum and stays the default. */
export const MIN_CAMERA_ARC = 0.6
export const MAX_CAMERA_ARC = 3
export const DEFAULT_CAMERA_ARC = Math.SQRT2
export const MAX_ROLL_DEGREES = 180
export const MAX_TRANSITION_MS = 10_000

export const shapeKinds = ['rectangle', 'ellipse', 'diamond', 'triangle'] as const

export const textAligns = ['left', 'center', 'right'] as const

/** Connection ports; `bottomLeft` and `bottomRight` are a triangle's base corners. */
export const anchorSides = ['top', 'right', 'bottom', 'left', 'bottomLeft', 'bottomRight'] as const

export const connectorRoutes = ['straight', 'orthogonal', 'curved'] as const

export const arrowHeads = ['none', 'arrow', 'openArrow', 'circle', 'diamond', 'bar'] as const

export const canvasBackgrounds = ['dots', 'grid', 'plain'] as const

export const frameBorderStyles = ['solid', 'dashed', 'none'] as const

export const MAX_SVG_RESOURCE_PARTS = 100_000

export const DEFAULT_TRANSITION_MS = 1000

export const defaultDocumentSettings: DocumentSettings = {
  transitionMs: DEFAULT_TRANSITION_MS,
  transitionEasing: DEFAULT_CAMERA_EASING,
  transitionArc: DEFAULT_CAMERA_ARC,
  spotlight: 0,
  background: 'dots',
  frameBorder: 'solid'
}

export const DOCUMENT_VERSION = 1

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
