import { describe, expect, it } from 'vitest'
import { insertElement } from '../canvas/document-mutations'
import {
  createEmptyDocument,
  type FrameElement,
  type ImageElement,
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
})
