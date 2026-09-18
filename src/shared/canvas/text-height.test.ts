import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  defaultConnectorStyle,
  defaultTextStyle,
  type CanvasDocument
} from './element-types'
import { syncTextHeight } from './text-height'

function documentWithText(): CanvasDocument {
  return {
    ...createEmptyDocument(),
    elements: {
      text: {
        id: 'text',
        type: 'text',
        x: 10,
        y: 20,
        width: 100,
        height: 200,
        text: 'Hello',
        textStyle: { ...defaultTextStyle, fontSize: 20 }
      },
      link: {
        id: 'link',
        type: 'connector',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        start: { x: 60, y: 220, elementId: 'text', side: 'bottom' },
        end: { x: 300, y: 400 },
        route: 'straight',
        startHead: 'none',
        endHead: 'arrow',
        style: defaultConnectorStyle,
        label: '',
        textStyle: defaultTextStyle
      }
    },
    order: ['text', 'link']
  }
}

describe('syncTextHeight', () => {
  it('uses imported line spacing instead of inflating short text to the default spacing', () => {
    const document = documentWithText()
    const element = document.elements.text!
    if (element.type === 'text') {
      element.textStyle.lineHeight = 1
    }
    expect(syncTextHeight(document, 'text', 20).elements.text?.height).toBe(20)
  })
  it('rounds measured bounds and updates attached connectors without mutating the source', () => {
    const original = documentWithText()
    const result = syncTextHeight(original, 'text', 55.4)
    expect(result.elements.text?.height).toBe(56)
    expect(result.elements.link).toMatchObject({ start: { x: 60, y: 76 } })
    expect(original.elements.text?.height).toBe(200)
    expect(original.elements.link).toMatchObject({ start: { y: 220 } })
    expect(syncTextHeight(result, 'text', 56.4)).toBe(result)
  })

  it('keeps one line of height and ignores invalid or non-text measurements', () => {
    const document = documentWithText()
    expect(syncTextHeight(document, 'text', 0).elements.text?.height).toBe(28)
    for (const height of [Number.NaN, Infinity, -1]) {
      expect(syncTextHeight(document, 'text', height)).toBe(document)
    }
    expect(syncTextHeight(document, 'missing', 50)).toBe(document)
    expect(syncTextHeight(document, 'link', 50)).toBe(document)
  })
})
