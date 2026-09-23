import { figText, clipFigText } from './fig-text'
import { FIG_IDENTITY } from './fig-scene'
import { emptyFigWarnings, type FigNode } from './fig-types'
import { textElementSchema } from './element-types'

const node: FigNode = {
  guid: { sessionID: 0, localID: 1 },
  type: 'TEXT',
  size: { x: 100, y: 20 },
  fontSize: 20,
  fontName: { family: 'Arial', style: 'Regular' },
  fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
  textData: { characters: 'Edit me' }
}

test('keeps mixed text and effects editable, using the first character style', () => {
  const warnings = emptyFigWarnings()
  const result = figText(
    {
      ...node,
      opacity: 0.5,
      effects: [{ type: 'DROP_SHADOW' }],
      textData: {
        characters: 'Edit me',
        characterStyleIDs: [2, 2, 0, 0, 0, 0, 0],
        styleOverrideTable: [
          {
            styleID: 2,
            fontName: { family: 'Arial', style: 'Bold Italic' },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
          }
        ]
      }
    },
    FIG_IDENTITY,
    'text',
    warnings
  )
  expect(result.text).toBe('Edit me')
  expect(result.textStyle).toMatchObject({ bold: true, italic: true, color: 'rgba(255,0,0,0.5)' })
  expect(warnings).toMatchObject({ text: 1, effects: 1 })
  expect(textElementSchema.safeParse(result).success).toBe(true)
})

test.each([
  [{ value: 150, units: 'PERCENT' }, 1.5],
  [{ value: 30, units: 'PIXELS' }, 1.5],
  [{ value: 2, units: 'RAW' }, 2]
])('preserves relative line height while scaling the font', (lineHeight, expected) => {
  const result = figText(
    { ...node, lineHeight },
    { ...FIG_IDENTITY, m00: 2, m11: 2 },
    'text',
    emptyFigWarnings()
  )
  expect(result.textStyle).toMatchObject({ fontSize: 40, lineHeight: expected })
})

test('keeps rotated text turned and gradient-filled, outlined text editable with a reported approximation', () => {
  const warnings = emptyFigWarnings()
  const result = figText(
    { ...node, fillPaints: [{ type: 'GRADIENT_LINEAR' }], strokePaints: node.fillPaints! },
    { ...FIG_IDENTITY, m00: 0, m01: -1, m10: 1, m11: 0 },
    'text',
    warnings
  )
  expect(result).toMatchObject({
    type: 'text',
    text: 'Edit me',
    x: -60,
    y: 40,
    width: 100,
    height: 20,
    rotation: 90
  })
  expect(warnings.text).toBe(1)
})

test('skewed or mirrored text falls back to its upright bounds with a warning', () => {
  const warnings = emptyFigWarnings()
  const result = figText(node, { ...FIG_IDENTITY, m00: -1 }, 'text', warnings)
  expect(result).not.toHaveProperty('rotation')
  expect(result).toMatchObject({ x: -100, y: 0, width: 100, height: 20 })
  expect(warnings.text).toBe(1)
})

test('turned text stays turned inside its frame and stands upright where the frame cuts it', () => {
  const turned = figText(node, { ...FIG_IDENTITY, m00: 0, m01: -1, m10: 1, m11: 0 }, 'text', {
    ...emptyFigWarnings()
  })
  const inside = emptyFigWarnings()
  expect(clipFigText(turned, { x: -100, y: -100, width: 300, height: 300 }, inside)).toBe(turned)
  expect(inside.text).toBe(0)
  const cut = emptyFigWarnings()
  const upright = clipFigText(turned, { x: -20, y: 40, width: 30, height: 50 }, cut)!
  expect(upright).not.toHaveProperty('rotation')
  expect(upright.x).toBeCloseTo(-20, 9)
  expect(upright.y).toBeCloseTo(0, 9)
  expect(upright.width).toBeCloseTo(20, 9)
  expect(upright.height).toBeCloseTo(100, 9)
  expect(upright.clip?.top).toBeCloseTo(0.4, 9)
  expect(upright.clip?.bottom).toBeCloseTo(0.1, 9)
  expect(cut.text).toBe(1)
})

test('clips text without changing its content or origin and omits fully clipped text', () => {
  const text = figText(node, FIG_IDENTITY, 'text', emptyFigWarnings())
  expect(clipFigText(text, { x: 25, y: 0, width: 50, height: 10 })).toMatchObject({
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    text: 'Edit me',
    clip: { left: 0.25, right: 0.25, top: 0, bottom: 0.5 }
  })
  expect(clipFigText(text, { x: 100, y: 0, width: 10, height: 20 })).toBeNull()
  expect(clipFigText(text, { x: -100, y: -100, width: 300, height: 300 })).toBe(text)
})
