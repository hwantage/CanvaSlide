import { useEffect, useRef, useState } from 'react'
import type { Camera, ImageAsset, ImageElement, Size } from '@shared/canvas/element-types'
import { imageDetailRegions, type ImageDetailRegion } from '@shared/canvas/image-detail'
import { imageIntersectsViewport } from '@shared/canvas/image-rendering'
import { camerasEqual, ZOOM_SETTLE_MS } from '@shared/canvas/camera-transform'
import type { ImagePreview } from '@/lib/svg-image-preview'
import { svgDetailCache } from '@/lib/svg-preview-cache'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

export const IMAGE_DETAIL_SETTLE_MS = ZOOM_SETTLE_MS * 2
type DetailTile = ImageDetailRegion & { canvas: HTMLCanvasElement }
type Detail = {
  element: ImageElement
  asset: ImageAsset
  camera: Camera
  viewport: Size
  density: number
  tiles: DetailTile[]
}

function matches(detail: Detail | null, camera: Camera, viewport: Size): boolean {
  return Boolean(
    detail &&
    camerasEqual(detail.camera, camera) &&
    detail.viewport.width === viewport.width &&
    detail.viewport.height === viewport.height &&
    detail.density === window.devicePixelRatio
  )
}

export function useImageDetail(
  element: ImageElement,
  asset: ImageAsset | undefined,
  preview: Pick<ImagePreview, 'src' | 'size'> | undefined
): { tiles: DetailTile[] | undefined; visible: boolean } {
  const [detail, setDetail] = useState<Detail | null>(null)
  const latest = useRef(detail)
  const displayedLeases = useRef<ReturnType<typeof svgDetailCache.acquire>[]>([])
  const atDetail = useCameraStore((s) => matches(detail, s.camera, s.viewport))
  const inView = useCameraStore(
    (s) => s.animationActive || imageIntersectsViewport(element, s.camera, s.viewport)
  )
  const editing = useDocumentStore((s) => Boolean(s.editBaseline))
  if (detail && (!inView || detail.element !== element || detail.asset !== asset)) {
    setDetail(null)
  }
  const source = preview?.src
  const width = preview?.size?.width
  const height = preview?.size?.height
  useEffect(
    () => () => {
      displayedLeases.current.forEach((lease) => lease.release())
      displayedLeases.current = []
      latest.current = null
    },
    [element, asset, inView]
  )
  useEffect(() => {
    if (!inView || !asset || !source || !width || !height) {
      return
    }
    let generation = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: ReturnType<typeof svgDetailCache.acquire>[] = []
    const clear = () => {
      generation++
      clearTimeout(timer)
      pending.forEach((lease) => lease.release())
      pending = []
    }
    const discard = () => {
      displayedLeases.current.forEach((lease) => lease.release())
      displayedLeases.current = []
      latest.current = null
      setDetail(null)
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
        discard()
        return
      }
      const current = generation
      const priority = useDocumentStore.getState().document.order.indexOf(element.id)
      pending = regions.map((region) =>
        svgDetailCache.acquire(asset, element.width / element.height, region, priority)
      )
      const results = await Promise.all(pending.map((lease) => lease.ready))
      if (current !== generation) {
        return
      }
      if (results.every((result) => result.canvas)) {
        const previous = displayedLeases.current
        displayedLeases.current = pending
        pending = []
        const next = {
          element,
          asset,
          camera: state.camera,
          viewport: state.viewport,
          density,
          tiles: regions.map((region, index) => ({ ...region, canvas: results[index]!.canvas! }))
        }
        latest.current = next
        setDetail(next)
        previous.forEach((lease) => lease.release())
      } else {
        clear()
      }
    }
    const schedule = (viewChanged = false) => {
      clear()
      const state = useCameraStore.getState()
      // Cancellation may start a return flight next; keep tiles until its destination is known.
      const destination = state.animationActive
        ? state.flightTarget
        : viewChanged
          ? state.camera
          : null
      // Drop unrelated crops before their canvases add work to the departure relayout.
      if (latest.current && destination && !matches(latest.current, destination, state.viewport)) {
        discard()
      }
      // A preview returns to the view already displayed; retain its tiles instead of rendering again.
      if (
        !state.animationActive &&
        !useDocumentStore.getState().editBaseline &&
        !matches(latest.current, state.camera, state.viewport)
      ) {
        timer = setTimeout(() => void render(), IMAGE_DETAIL_SETTLE_MS)
      }
    }
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (
        state.camera !== previous.camera ||
        state.viewport !== previous.viewport ||
        state.flightTarget !== previous.flightTarget ||
        state.animationActive !== previous.animationActive
      ) {
        schedule(state.camera !== previous.camera || state.viewport !== previous.viewport)
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
  }, [element, asset, source, width, height, inView])
  return {
    tiles: detail?.tiles,
    visible: !editing && atDetail && detail?.element === element && detail.asset === asset
  }
}
