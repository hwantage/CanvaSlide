import type { CameraPreparation } from '@shared/canvas/camera-animator'
import type { Camera, ImageElement, Size } from '@shared/canvas/element-types'
import { imagesAlongCameraPath } from '@shared/canvas/image-rendering'
import { useDocumentStore } from '@/store/document-store'
import { svgPreviewCache } from './svg-preview-cache'

/**
 * Why: marking the camera as animating re-lays the world out at the flight's layout scale, and
 * that commit is not free on a dense document. Starting the tween in the same frame makes the
 * first tenth of a second of the move stutter — most visibly when replaying a transition from a
 * frame the world had already settled crisp at. Two frames hand the browser a painted layout first.
 */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/** Everything a flight wants in place before it starts moving: raster caches, and a settled layout. */
export function prepareCameraFlight(
  from: Camera,
  target: Camera,
  viewport: Size
): CameraPreparation {
  const { document } = useDocumentStore.getState()
  const images = Object.values(document.elements).filter(
    (element): element is ImageElement =>
      element.type === 'image' && document.assets[element.assetId]?.mime === 'image/svg+xml'
  )
  const leases = imagesAlongCameraPath(images, from, target, viewport).map((image) =>
    svgPreviewCache.acquire(document.assets[image.assetId]!, image.width / image.height)
  )
  return {
    ready: Promise.all([afterNextPaint(), ...leases.map((lease) => lease.ready)]),
    release: () => leases.forEach((lease) => lease.release())
  }
}
