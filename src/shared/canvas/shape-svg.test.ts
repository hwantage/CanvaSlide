import { describe, expect, it } from 'vitest'
import type { ConnectorElement, ShapeElement } from './element-types'
import { CONNECTOR_PAD, connectorCanvasRect, connectorDashArray, shapeGeometry } from './shape-svg'

const shape = (kind: ShapeElement['shape'], strokeWidth = 4): ShapeElement => ({
  id: 's',
  type: 'shape',
  shape: kind,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  style: { fill: '#fff', stroke: '#000', strokeWidth, cornerRadius: 8 },
  text: '',
  textStyle: { color: '#000', fontSize: 12, align: 'center', bold: false }
})

const connector = (dashed: boolean): ConnectorElement => ({
  id: 'c',
  type: 'connector',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  start: { x: 10, y: 20 },
  end: { x: 110, y: 70 },
  route: 'straight',
  startHead: 'none',
  endHead: 'arrow',
  style: { stroke: '#000', strokeWidth: 3, dashed },
  label: '',
  textStyle: { color: '#000', fontSize: 12, align: 'center', bold: false }
})

describe('shape-svg', () => {
  it('insets every primitive by half the stroke so the outline stays inside the box', () => {
    expect(shapeGeometry(shape('rectangle'))).toEqual({
      tag: 'rect',
      x: 2,
      y: 2,
      width: 96,
      height: 56,
      rx: 8
    })
    expect(shapeGeometry(shape('ellipse'))).toEqual({
      tag: 'ellipse',
      cx: 50,
      cy: 30,
      rx: 48,
      ry: 28
    })
    expect(shapeGeometry(shape('diamond'))).toEqual({
      tag: 'polygon',
      points: '50,2 98,30 50,58 2,30'
    })
  })

  it('never lets a fat stroke turn a rect inside out', () => {
    expect(shapeGeometry(shape('rectangle', 200))).toMatchObject({ width: 0, height: 0 })
  })

  it('dashes in proportion to the stroke and pads the drawing box for arrowheads', () => {
    expect(connectorDashArray(connector(true))).toBe('9 6')
    expect(connectorDashArray(connector(false))).toBeUndefined()
    expect(connectorCanvasRect(connector(false))).toEqual({
      x: 10 - CONNECTOR_PAD,
      y: 20 - CONNECTOR_PAD,
      width: 100 + CONNECTOR_PAD * 2,
      height: 50 + CONNECTOR_PAD * 2
    })
  })
})
