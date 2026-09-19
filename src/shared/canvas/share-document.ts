import { SaxesParser } from 'saxes'
import { MAX_SHARE_BYTES } from '../cloud-share'
import type { CanvasDocument } from './element-types'
import { parseVideoSource } from './video-source'

const imageDataPrefix =
  /^data:(image\/(?:png|jpeg|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml))(?:;charset=(?:utf-8|us-ascii))?(;base64)?,/i

type ImageBudget = { remaining: number }

function isEmbeddedImage(
  data: string,
  budget: ImageBudget,
  depth = 0,
  expectedMime?: string
): boolean {
  const match = imageDataPrefix.exec(data)
  const mime = match?.[1]?.toLowerCase()
  if (!match || !mime || (expectedMime && mime !== expectedMime.toLowerCase()) || depth > 8) {
    return false
  }
  const payload = data.slice(match[0].length)
  if (!payload) {
    return false
  }
  if (match[2] && (payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload))) {
    return false
  }
  if (mime !== 'image/svg+xml') {
    return Boolean(match[2])
  }
  try {
    const svg = match[2]
      ? new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
        )
      : decodeURIComponent(payload)
    budget.remaining -= svg.length
    if (budget.remaining < 0) {
      return false
    }
    let root = false
    const reject = () => {
      throw new Error('Unsafe shared SVG')
    }
    const parser = new SaxesParser({ xmlns: true })
    parser.on('doctype', reject)
    parser.on('processinginstruction', reject)
    parser.on('opentag', (tag) => {
      if (!root && (tag.local !== 'svg' || (tag.uri && tag.uri !== 'http://www.w3.org/2000/svg'))) {
        reject()
      }
      root = true
      for (const attribute of Object.values(tag.attributes)) {
        if (attribute.local === 'href' && !attribute.value.startsWith('#')) {
          if (!isEmbeddedImage(attribute.value, budget, depth + 1)) {
            reject()
          }
        }
        if (attribute.name === 'xml:base') {
          reject()
        }
      }
    })
    parser.write(svg).close()
    return root
  } catch {
    return false
  }
}

// Shared documents must not make the viewer contact an image server chosen by the uploader.
export function hasOnlyEmbeddedImages(document: CanvasDocument): boolean {
  const budget = { remaining: MAX_SHARE_BYTES }
  return Object.values(document.assets).every((asset) =>
    isEmbeddedImage(asset.data, budget, 0, asset.mime)
  )
}

export function hasAllowedShareVideos(document: CanvasDocument, serviceOrigin: string): boolean {
  return Object.values(document.elements).every((element) => {
    if (element.type !== 'video') {
      return true
    }
    const source = parseVideoSource(element.url, true)
    return (
      source !== null &&
      (source.provider !== 'direct' || new URL(source.url).origin === serviceOrigin)
    )
  })
}
