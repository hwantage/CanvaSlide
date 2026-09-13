import { describe, expect, it } from 'vitest'
import type { CanvasElement } from './element-types'
import { extractStyleClip, styleClipPatch } from './style-clipboard'

const shape: CanvasElement = {
  id: 's',
  type: 'shape',
  shape: 'ellipse',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: { fill: '#ff0000', stroke: '#00ff00', strokeWidth: 3, cornerRadius: 0 },
  text: 'keep me',
  textStyle: { color: '#123456', fontSize: 30, align: 'right', bold: true }
}
const text: CanvasElement = {
  id: 't',
  type: 'text',
  text: 'hello',
  x: 5,
  y: 5,
  width: 10,
  height: 10,
  textStyle: { color: '#000000', fontSize: 16, align: 'left', bold: false }
}

describe('style-clipboard', () => {
  it('copies only formatting, never content or geometry', () => {
    const clip = extractStyleClip(shape)
    expect(clip).toEqual({ shape: shape.style, text: shape.textStyle })
    expect(styleClipPatch(text, clip as NonNullable<typeof clip>)).toEqual({
      textStyle: shape.textStyle
    })
  })

  it('applies a text-only clip to a shape without touching its fill', () => {
    const clip = extractStyleClip(text)
    expect(styleClipPatch(shape, clip as NonNullable<typeof clip>)).toEqual({
      textStyle: text.textStyle
    })
  })

  it('has nothing for images and frames', () => {
    const image: CanvasElement = {
      id: 'i',
      type: 'image',
      assetId: 'a',
      naturalWidth: 1,
      naturalHeight: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }
    expect(extractStyleClip(image)).toBeNull()
    expect(styleClipPatch(image, { text: text.textStyle })).toEqual({})
  })
})
