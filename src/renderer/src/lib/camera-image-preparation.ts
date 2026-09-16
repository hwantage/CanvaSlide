import type { CameraPreparation } from '@shared/canvas/camera-animator'
import type { Camera, ImageElement, Size } from '@shared/canvas/element-types'
import { imagesAlongCameraPath } from '@shared/canvas/image-rendering'
import { useDocumentStore } from '@/store/document-store'
import { svgPreviewCache } from './svg-preview-cache'

export function prepareCameraImages(
  from: Camera,
  target: Camera,
  viewport: Size
): CameraPreparation | undefined {
  const { document } = useDocumentStore.getState()
  const images = Object.values(document.elements).filter(
    (element): element is ImageElement =>
      element.type === 'image' && document.assets[element.assetId]?.mime === 'image/svg+xml'
  )
  const leases = imagesAlongCameraPath(images, from, target, viewport).map((image) =>
    svgPreviewCache.acquire(document.assets[image.assetId]!, image.width / image.height)
  )
  if (!leases.length) {
    return undefined
  }
  return {
    ready: Promise.all(leases.map((lease) => lease.ready)),
    release: () => leases.forEach((lease) => lease.release())
  }
}
