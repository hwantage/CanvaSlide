import { useEffect, useState } from 'react'
import type { Camera, ImageAsset, ImageElement, Size } from '@shared/canvas/element-types'
import { imageDetailRegions, type ImageDetailRegion } from '@shared/canvas/image-detail'
import { ZOOM_SETTLE_MS } from '@shared/canvas/camera-transform'
import type { ImagePreview } from '@/lib/svg-image-preview'
import { svgDetailCache } from '@/lib/svg-preview-cache'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

export const IMAGE_DETAIL_SETTLE_MS = ZOOM_SETTLE_MS * 2
type DetailTile = ImageDetailRegion & { src: string }
type Detail = {
  element: ImageElement
  source: string
  camera: Camera
  viewport: Size
  density: number
  tiles: DetailTile[]
}

export function useImageDetail(
  element: ImageElement,
  asset: ImageAsset | undefined,
  preview: Pick<ImagePreview, 'src' | 'size'> | undefined
): DetailTile[] | undefined {
  const [detail, setDetail] = useState<Detail | null>(null)
  const source = preview?.src
  const width = preview?.size?.width
  const height = preview?.size?.height
  useEffect(() => {
    if (!asset || !source || !width || !height) {
      return
    }
    let generation = 0
    let displayed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let leases: ReturnType<typeof svgDetailCache.acquire>[] = []
    const clear = () => {
      generation++
      clearTimeout(timer)
      leases.forEach((lease) => lease.release())
      leases = []
    }
    const render = async () => {
      const state = useCameraStore.getState()
      if (state.isAnimating() || useDocumentStore.getState().editBaseline) {
        return
      }
      const density = window.devicePixelRatio
      const regions = imageDetailRegions(element, state.camera, state.viewport, density, {
        width,
        height
      })
      if (!regions.length) {
        return
      }
      const current = generation
      const priority = useDocumentStore.getState().document.order.indexOf(element.id)
      leases = regions.map((region) =>
        svgDetailCache.acquire(asset, element.width / element.height, region, priority)
      )
      const results = await Promise.all(leases.map((lease) => lease.ready))
      if (current !== generation) {
        return
      }
      // Replace the entire visible crop atomically so transparency is never composited twice.
      if (results.every((result) => result.size)) {
        displayed = true
        setDetail({
          element,
          source,
          camera: state.camera,
          viewport: state.viewport,
          density,
          tiles: regions.map((region, index) => ({ ...region, src: results[index]!.src }))
        })
      } else {
        clear()
      }
    }
    const schedule = () => {
      clear()
      if (displayed) {
        displayed = false
        setDetail(null)
      }
      if (!useCameraStore.getState().animationActive && !useDocumentStore.getState().editBaseline) {
        timer = setTimeout(() => void render(), IMAGE_DETAIL_SETTLE_MS)
      }
    }
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (
        state.camera !== previous.camera ||
        state.viewport !== previous.viewport ||
        state.animationActive !== previous.animationActive
      ) {
        schedule()
      }
    })
    const unsubscribeEdits = useDocumentStore.subscribe((state, previous) => {
      if (Boolean(state.editBaseline) !== Boolean(previous.editBaseline)) {
        schedule()
      }
    })
    let density: MediaQueryList
    const watchDensity = () => {
      density?.removeEventListener('change', watchDensity)
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      density.addEventListener('change', watchDensity)
      schedule()
    }
    watchDensity()
    return () => {
      clear()
      unsubscribe()
      unsubscribeEdits()
      density.removeEventListener('change', watchDensity)
    }
  }, [element, asset, source, width, height])
  const state = useCameraStore.getState()
  return detail?.element === element &&
    detail.source === source &&
    detail.camera === state.camera &&
    detail.viewport === state.viewport &&
    detail.density === window.devicePixelRatio
    ? detail.tiles
    : undefined
}
