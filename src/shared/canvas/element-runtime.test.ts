import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  defaultConnectorStyle,
  defaultDocumentSettings,
  defaultShapeStyle,
  defaultTextStyle,
  isFrameElement
} from './element-runtime'
import {
  canvasDocumentSchema,
  connectorStyleSchema,
  documentSettingsSchema,
  shapeStyleSchema,
  textStyleSchema,
  type CanvasElement
} from './element-types'

describe('element runtime defaults', () => {
  it('agrees with validation defaults and produces valid documents and styles', () => {
    const document = createEmptyDocument('Deck')
    expect(document.name).toBe('Deck')
    expect(canvasDocumentSchema.parse(document)).toEqual(document)
    expect(documentSettingsSchema.parse({ transitionMs: 1000 })).toEqual(defaultDocumentSettings)
    expect(shapeStyleSchema.parse(defaultShapeStyle)).toEqual(defaultShapeStyle)
    expect(connectorStyleSchema.parse(defaultConnectorStyle)).toEqual(defaultConnectorStyle)
    expect(textStyleSchema.parse(defaultTextStyle)).toEqual(defaultTextStyle)
  })

  it('isolates mutable document state from other documents and shared defaults', () => {
    const first = createEmptyDocument()
    const second = createEmptyDocument()
    expect(first.name).toBe('Untitled')
    for (const key of ['elements', 'order', 'settings', 'assets'] as const) {
      expect(first[key]).not.toBe(second[key])
    }
    first.settings.transitionMs = 250
    first.order.push('frame')
    expect(second.settings.transitionMs).toBe(1000)
    expect(defaultDocumentSettings.transitionMs).toBe(1000)
    expect(second.order).toEqual([])
  })

  it('identifies frames among the element kinds used by playback', () => {
    const types = ['shape', 'text', 'image', 'video', 'connector', 'frame'] as const
    const elements = types.map((type) => ({ type }) as CanvasElement)
    expect(elements.filter(isFrameElement).map((element) => element.type)).toEqual(['frame'])
  })
})
