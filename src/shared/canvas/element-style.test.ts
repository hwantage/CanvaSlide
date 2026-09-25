import { describe, expect, it } from 'vitest'
import { connectorDrawing } from './connector-markers'
import {
  connectorLabelCss,
  connectorLabelMaxWidth,
  connectorPaths,
  rotationCss,
  shapeLabelCss,
  shapePaint,
  textCss
} from './element-style'
import {
  defaultConnectorStyle,
  defaultShapeStyle,
  defaultTextStyle,
  shapeKinds,
  type ConnectorElement,
  type ShapeElement
} from './element-types'
import { fontStacks } from './font-family'

const shape = (patch: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 's',
  type: 'shape',
  shape: 'rectangle',
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  style: { ...defaultShapeStyle, strokeWidth: 6 },
  text: '',
  textStyle: defaultTextStyle,
  ...patch
})

const connector = (patch: Partial<ConnectorElement> = {}): ConnectorElement => ({
  id: 'c',
  type: 'connector',
  x: 0,
  y: 0,
  width: 100,
  height: 1,
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  route: 'straight',
  startHead: 'openArrow',
  endHead: 'arrow',
  style: { ...defaultConnectorStyle, stroke: '#123456', strokeWidth: 3 },
  label: '',
  textStyle: defaultTextStyle,
  ...patch
})

describe('textCss', () => {
  it('writes the stored style with the document defaults filled in', () => {
    expect(textCss(defaultTextStyle)).toEqual({
      color: '#18181b',
      fontSize: '20px',
      lineHeight: '1.4',
      textAlign: 'left',
      fontWeight: '400',
      fontStyle: 'normal',
      fontFamily: undefined,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word'
    })
  })

  it('carries weight, slant, spacing and family', () => {
    const css = textCss({
      ...defaultTextStyle,
      bold: true,
      italic: true,
      lineHeight: 2,
      align: 'right',
      fontFamily: 'serif'
    })
    expect(css).toMatchObject({
      fontWeight: '700',
      fontStyle: 'italic',
      lineHeight: '2',
      textAlign: 'right',
      fontFamily: fontStacks.serif
    })
    expect(textCss({ ...defaultTextStyle, fontFamily: 'Zapfino' }).fontFamily).toMatch(
      /^"Zapfino", /
    )
  })
})

describe('rotationCss', () => {
  it('leaves an upright element untouched', () => {
    expect(rotationCss(shape())).toEqual({})
    expect(rotationCss(shape({ rotation: 0 }))).toEqual({})
  })

  it('turns about the centre of the unrotated box', () => {
    expect(rotationCss(shape({ rotation: -30 }))).toEqual({
      transform: 'rotate(-30deg)',
      transformOrigin: '60px 40px'
    })
  })
})

describe('shapePaint', () => {
  it('paints the stored style and rounds the corners of polygon outlines only', () => {
    const paint = { fill: defaultShapeStyle.fill, stroke: defaultShapeStyle.stroke, strokeWidth: 6 }
    for (const kind of shapeKinds) {
      expect(shapePaint(shape({ shape: kind })), kind).toEqual(
        kind === 'diamond' || kind === 'triangle' ? { ...paint, strokeLinejoin: 'round' } : paint
      )
    }
  })
})

describe('shapeLabelCss', () => {
  it('centres the text in the label box, padded as the editor always has', () => {
    expect(shapeLabelCss(shape())).toEqual({
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '120px',
      height: '80px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '9.75px'
    })
  })

  it("keeps a triangle's text in the lower middle of its outline", () => {
    expect(shapeLabelCss(shape({ shape: 'triangle' }))).toMatchObject({
      left: '31.5px',
      top: '40px',
      width: '57px',
      height: '37px'
    })
  })
})

describe('connectorPaths', () => {
  it('fills solid markers with the line colour and strokes open ones at its width', () => {
    const element = connector()
    const drawing = connectorDrawing(element)
    const { line, markers } = connectorPaths(element, drawing)
    expect(line).toMatchObject({ d: drawing.d, fill: 'none', stroke: '#123456', strokeWidth: 3 })
    expect(line.strokeDasharray).toBeUndefined()
    expect(markers).toHaveLength(drawing.markers.length)
    for (const [index, marker] of drawing.markers.entries()) {
      expect(markers[index]).toEqual(
        marker.filled
          ? { d: marker.d, fill: '#123456', strokeLinecap: 'round', strokeLinejoin: 'round' }
          : {
              d: marker.d,
              fill: 'none',
              stroke: '#123456',
              strokeWidth: 3,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }
      )
    }
    expect(drawing.markers.map((marker) => marker.filled)).toEqual([false, true])
  })

  it('dashes the line, not its markers', () => {
    const element = connector({ style: { ...defaultConnectorStyle, strokeWidth: 2, dashed: true } })
    const { line, markers } = connectorPaths(element, connectorDrawing(element))
    expect(line.strokeDasharray).toBe('6 4')
    expect(markers.every((marker) => marker.strokeDasharray === undefined)).toBe(true)
  })
})

describe('connectorLabelCss', () => {
  it('centres on the midpoint in the drawing box, sized as the editor always has', () => {
    const css = connectorLabelCss({ x: 150, y: 40 }, { x: 100, y: -20, width: 48, height: 300 }, 14)
    expect(css).toEqual({
      position: 'absolute',
      left: '50px',
      top: '60px',
      transform: 'translate(-50%, -50%)',
      boxSizing: 'border-box',
      width: 'max-content',
      minWidth: '19.5px',
      maxWidth: '208px',
      padding: '1.625px 4.875px',
      borderRadius: '3.25px',
      background: 'var(--canvas)'
    })
  })

  it('widens with large type, so a word is never cut to fit', () => {
    expect(connectorLabelMaxWidth(4)).toBe(208)
    expect(connectorLabelMaxWidth(14)).toBe(208)
    expect(connectorLabelMaxWidth(64)).toBe(768)
    expect(connectorLabelMaxWidth(1024)).toBe(12288)
    const { maxWidth } = connectorLabelCss({ x: 0, y: 0 }, { x: 0, y: 0, width: 1, height: 1 }, 64)
    expect(maxWidth).toBe('768px')
  })
})
