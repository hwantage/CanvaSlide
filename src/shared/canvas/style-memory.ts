import type { ConnectorHeads } from './connector-markers'
import {
  defaultConnectorStyle,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasElement,
  type ConnectorStyle,
  type ShapeStyle,
  type TextStyle
} from './element-types'

/** Last styles the user applied, per element kind; new elements of that kind start from them. */
export type StyleMemory = {
  shape: ShapeStyle
  shapeText: TextStyle
  text: TextStyle
  connector: ConnectorStyle
  connectorText: TextStyle
  /** Also the connector tool's end choice, so the flyout and the panel show one memory. */
  connectorHeads: ConnectorHeads
}

export const defaultStyleMemory: StyleMemory = {
  shape: { ...defaultShapeStyle },
  shapeText: { ...defaultTextStyle, align: 'center' },
  text: { ...defaultTextStyle },
  connector: { ...defaultConnectorStyle },
  connectorText: { ...defaultTextStyle, fontSize: 14, align: 'center' },
  connectorHeads: { startHead: 'none', endHead: 'arrow' }
}

/** Records the styles carried by `element`; returns the same memory when nothing applies. */
export function rememberStyleFrom(memory: StyleMemory, element: CanvasElement): StyleMemory {
  switch (element.type) {
    case 'shape':
      return { ...memory, shape: { ...element.style }, shapeText: { ...element.textStyle } }
    case 'text':
      return { ...memory, text: { ...element.textStyle } }
    case 'connector':
      return {
        ...memory,
        connector: { ...element.style },
        connectorText: { ...element.textStyle },
        connectorHeads: { startHead: element.startHead, endHead: element.endHead }
      }
    case 'frame':
    case 'image':
    case 'video':
      return memory
  }
}
