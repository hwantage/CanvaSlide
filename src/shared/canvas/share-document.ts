import type { CanvasDocument, ImageAsset } from './element-types'

const imageDataPrefix =
  /^data:(image\/(?:png|jpeg|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml))(?:;charset=(?:utf-8|us-ascii))?(;base64)?,/i

function isEmbeddedImage(asset: ImageAsset): boolean {
  const match = imageDataPrefix.exec(asset.data)
  const mime = match?.[1]?.toLowerCase()
  if (!match || !mime || mime !== asset.mime.toLowerCase()) {
    return false
  }
  const payload = asset.data.slice(match[0].length)
  if (!payload) {
    return false
  }
  if (match[2]) {
    return payload.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  }
  return mime === 'image/svg+xml'
}

// Shared documents must not make the viewer contact an image server chosen by the uploader.
export function hasOnlyEmbeddedImages(document: CanvasDocument): boolean {
  return Object.values(document.assets).every(isEmbeddedImage)
}
