import { describe, expect, it } from 'vitest'
import { insertElement } from '../canvas/document-mutations'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type FrameElement,
  type ImageElement,
  type ShapeElement,
  type TextElement,
  type VideoElement
} from '../canvas/element-types'
import { renderElement } from './element-dom'

const frame: FrameElement = {
  id: 'frame',
  type: 'frame',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  name: 'Frame',
  order: 0
}
const image: ImageElement = {
  id: 'image',
  type: 'image',
  x: 5,
  y: 6,
  width: 70,
  height: 80,
  assetId: 'asset',
  naturalWidth: 7,
  naturalHeight: 8,
  rotation: 90
}
const video: VideoElement = {
  id: 'video',
  type: 'video',
  x: 1,
  y: 2,
  width: 320,
  height: 180,
  url: 'https://example.com/clip.mp4'
}

describe('renderElement', () => {
  it('draws no node for a frame or for an image whose asset is missing', () => {
    const doc = insertElement(createEmptyDocument(), frame)
    expect(renderElement(frame, doc)).toBeNull()
    expect(renderElement(image, doc)).toBeNull()
  })

  it('places an image at its box, turned about its centre', () => {
    const doc = {
      ...insertElement(createEmptyDocument(), image),
      assets: {
        asset: {
          id: 'asset',
          mime: 'image/png',
          data: 'data:image/png;base64,AA==',
          width: 7,
          height: 8
        }
      }
    }
    const node = renderElement(image, doc) as HTMLImageElement
    expect(node.className).toBe('uc-img')
    expect(node.getAttribute('src')).toBe('data:image/png;base64,AA==')
    expect(node.style.cssText).toContain('left: 5px')
    expect(node.style.width).toBe('70px')
    expect(node.style.transform).toBe('rotate(90deg)')
    expect(node.style.transformOrigin).toBe('35px 40px')
  })

  it('leaves a placed, empty box for a video that each host fills in', () => {
    const node = renderElement(video, insertElement(createEmptyDocument(), video))
    expect(node?.dataset.videoId).toBe('video')
    expect(node?.childElementCount).toBe(0)
    expect(node?.style.height).toBe('180px')
  })

  it('links the URLs written in a text, underlined in the text colour', () => {
    const text: TextElement = {
      id: 'text',
      type: 'text',
      x: 0,
      y: 0,
      width: 300,
      height: 40,
      text: 'See https://example.com/docs. Or http://a.b',
      textStyle: defaultTextStyle
    }
    const node = renderElement(text, insertElement(createEmptyDocument(), text))!
    expect(node.textContent).toBe(text.text)
    const anchors = [...node.querySelectorAll('a')]
    expect(anchors.map((anchor) => anchor.getAttribute('href'))).toEqual([
      'https://example.com/docs',
      'http://a.b'
    ])
    for (const anchor of anchors) {
      expect(anchor.className).toBe('uc-link')
      expect(anchor.target).toBe('_blank')
      expect(anchor.rel).toBe('noopener noreferrer')
      expect(anchor.style.textDecoration).toBe('underline')
      expect(anchor.style.color).toBe('inherit')
      expect(anchor.title).toBe('')
      // Links never take focus: a focused one would own the slide keys.
      expect(anchor.tabIndex).toBe(-1)
      expect(anchor.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }))).toBe(false)
    }
  })

  it("makes an element's own link cover its whole text, with no link inside", () => {
    const text: TextElement = {
      id: 'text',
      type: 'text',
      x: 0,
      y: 0,
      width: 300,
      height: 40,
      text: 'Open https://inner.example',
      textStyle: defaultTextStyle,
      link: 'https://example.com/'
    }
    const node = renderElement(text, insertElement(createEmptyDocument(), text))!
    const anchors = node.querySelectorAll('a')
    expect(anchors).toHaveLength(1)
    const [anchor] = anchors
    expect(anchor!.getAttribute('href')).toBe('https://example.com/')
    expect(anchor!.textContent).toBe(text.text)
    expect(anchor!.title).toBe('https://example.com/')
    expect(anchor!.style.display).toBe('block')
    expect(anchor!.style.textDecoration).toBe('none')
  })

  it('keeps text without links, and shape labels, as plain text', () => {
    const text: TextElement = {
      id: 'text',
      type: 'text',
      x: 0,
      y: 0,
      width: 300,
      height: 40,
      text: 'plain',
      textStyle: defaultTextStyle
    }
    const node = renderElement(text, insertElement(createEmptyDocument(), text))!
    expect(node.childNodes).toHaveLength(1)
    expect(node.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    const shape: ShapeElement = {
      id: 'shape',
      type: 'shape',
      shape: 'rectangle',
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      style: defaultShapeStyle,
      text: 'https://example.com',
      textStyle: defaultTextStyle
    }
    const label = renderElement(shape, insertElement(createEmptyDocument(), shape))!
    expect(label.textContent).toBe('https://example.com')
    expect(label.querySelector('a')).toBeNull()
  })
})
