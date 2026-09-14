import { describe, expect, it } from 'vitest'
import { insertElement } from './document-mutations'
import { createEmptyDocument, type CanvasElement } from './element-types'
import { collectFontUsage, embeddedFontBytes, fontFaceCss } from './font-embedding'

const text = (id: string, content: string, fontFamily?: string, bold = false): CanvasElement => ({
  id,
  type: 'text',
  text: content,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  textStyle: { color: '#000', fontSize: 16, align: 'left', bold, fontFamily }
})

describe('font-embedding', () => {
  it('collects distinct characters per installed family and weight, skipping presets', () => {
    let doc = createEmptyDocument()
    doc = insertElement(doc, text('a', 'hello', 'Nanum Gothic'))
    doc = insertElement(doc, text('b', 'ok!', 'Nanum Gothic', true))
    doc = insertElement(doc, text('c', 'loop', 'Nanum Gothic'))
    doc = insertElement(doc, text('d', 'serif', 'serif'))
    doc = insertElement(doc, text('e', 'plain'))
    doc = insertElement(doc, text('f', '   ', 'Zapfino'))
    expect(collectFontUsage(doc)).toEqual([
      { family: 'Nanum Gothic', bold: false, text: 'ehlop' },
      { family: 'Nanum Gothic', bold: true, text: '!ko' }
    ])
  })

  it('emits one @font-face per family and weight with a data URL', () => {
    const css = fontFaceCss([
      { family: 'Nanum Gothic', weight: 400, format: 'truetype', bytes: 3, dataBase64: 'AAA=' },
      { family: 'Nanum Gothic', weight: 400, format: 'truetype', bytes: 3, dataBase64: 'BBB=' },
      { family: 'Serif "X"', weight: 700, format: 'opentype', bytes: 4, dataBase64: 'CCCC' }
    ])
    const rules = css.split('\n')
    expect(rules).toHaveLength(2)
    expect(rules[0]).toContain('font-family:"Nanum Gothic";font-weight:400')
    expect(rules[0]).toContain('url(data:font/ttf;base64,AAA=) format("truetype")')
    expect(rules[1]).toContain('font-family:"Serif \\"X\\"";font-weight:700')
    expect(rules[1]).toContain('data:font/otf')
    expect(
      embeddedFontBytes([
        { family: 'a', weight: 400, format: 'truetype', bytes: 3, dataBase64: '' },
        { family: 'b', weight: 400, format: 'truetype', bytes: 4, dataBase64: '' }
      ])
    ).toBe(7)
  })
})
