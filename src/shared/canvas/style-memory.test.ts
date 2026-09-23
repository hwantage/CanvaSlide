import { describe, expect, it } from 'vitest'
import type { CanvasElement } from './element-types'
import { defaultStyleMemory, rememberStyleFrom } from './style-memory'

const shape: CanvasElement = {
  id: 's',
  type: 'shape',
  shape: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: { fill: '#ff0000', stroke: '#00ff00', strokeWidth: 3, cornerRadius: 0 },
  text: '',
  textStyle: { color: '#123456', fontSize: 30, align: 'right', bold: true }
}

describe('style-memory', () => {
  it('remembers shape fill and label style separately from plain text style', () => {
    const memory = rememberStyleFrom(defaultStyleMemory, shape)
    expect(memory.shape.fill).toBe('#ff0000')
    expect(memory.shapeText.fontSize).toBe(30)
    expect(memory.text).toEqual(defaultStyleMemory.text)
    expect(defaultStyleMemory.shape.fill).not.toBe('#ff0000')
  })

  it('remembers connector ends so the next connector starts with them', () => {
    expect(defaultStyleMemory.connectorHeads).toEqual({ startHead: 'none', endHead: 'arrow' })
    const connector: CanvasElement = {
      id: 'c',
      type: 'connector',
      x: 0,
      y: 0,
      width: 10,
      height: 1,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      route: 'straight',
      startHead: 'circle',
      endHead: 'openArrow',
      style: { ...defaultStyleMemory.connector, strokeWidth: 3 },
      label: 'kept out',
      textStyle: defaultStyleMemory.connectorText
    }
    const memory = rememberStyleFrom(defaultStyleMemory, connector)
    expect(memory.connectorHeads).toEqual({ startHead: 'circle', endHead: 'openArrow' })
    expect(memory.connector.strokeWidth).toBe(3)
  })

  it('ignores elements without styles', () => {
    const frame: CanvasElement = {
      id: 'f',
      type: 'frame',
      name: 'F',
      order: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    }
    expect(rememberStyleFrom(defaultStyleMemory, frame)).toBe(defaultStyleMemory)
  })
})
