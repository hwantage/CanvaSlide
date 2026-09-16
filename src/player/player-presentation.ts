import { createCameraAnimator } from '@shared/canvas/camera-animator'
import {
  ZOOM_SETTLE_MS,
  layoutZoomFor,
  worldLayerCssTransform
} from '@shared/canvas/camera-transform'
import { contentBounds, elementRect } from '@shared/canvas/element-bounds'
import type { Camera, CanvasDocument, Size } from '@shared/canvas/element-types'
import { cameraForOverview, fitRectToViewport } from '@shared/canvas/frame-fit'
import { orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import type { FrameNode } from './player-dom'

type Mount = {
  viewport: HTMLElement
  world: HTMLElement
  zoomLayer: HTMLElement
  frameNodes: FrameNode[]
}

/** Slideshow controller for the standalone player: same math and timings as the app. */
export function createPlayerPresentation(doc: CanvasDocument, mount: Mount) {
  const frames = orderedFrames(doc)
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  let index = 0
  let overview = false
  const listeners = new Set<() => void>()

  const viewportSize = (): Size => ({
    width: Math.max(1, mount.viewport.clientWidth),
    height: Math.max(1, mount.viewport.clientHeight)
  })

  // Why: CSS zoom re-lays out the whole document; during a fly the layer is scaled on the
  // compositor instead, and the zoom is committed once the camera has settled.
  let baseZoom = 1
  let settle: ReturnType<typeof setTimeout> | null = null
  const paint = () => {
    mount.world.style.transformOrigin = '0 0'
    mount.world.style.transform = worldLayerCssTransform(camera, baseZoom)
    // Why: frame outlines are in world units; keep them ~2px on screen at any zoom.
    mount.zoomLayer.style.setProperty('--stroke-px', `${2 / camera.zoom}px`)
    if (settle !== null) {
      clearTimeout(settle)
    }
    settle = setTimeout(() => {
      settle = null
      baseZoom = layoutZoomFor(camera.zoom)
      mount.zoomLayer.style.zoom = String(baseZoom)
      mount.world.style.transform = worldLayerCssTransform(camera, baseZoom)
    }, ZOOM_SETTLE_MS)
  }

  const animator = createCameraAnimator({
    getCamera: () => camera,
    setCamera: (next) => {
      camera = next
      paint()
    },
    getViewport: viewportSize
  })

  const notify = () => {
    mount.viewport.classList.toggle('uc-overview', overview)
    mount.frameNodes.forEach(({ node, index: i }) =>
      node.classList.toggle('is-current', i === index)
    )
    for (const listener of listeners) {
      listener()
    }
  }

  const flyToFrame = (i: number, durationMs = doc.settings.transitionMs) => {
    const frame = frames[i]
    if (!frame) {
      return
    }
    animator.animateTo(fitRectToViewport(elementRect(frame), viewportSize()), durationMs)
  }

  const api = {
    get index() {
      return index
    },
    get overview() {
      return overview
    },
    get count() {
      return frames.length
    },
    frames,
    onChange: (listener: () => void) => listeners.add(listener),
    goTo: (i: number) => {
      if (i < 0 || i >= frames.length) {
        return
      }
      index = i
      overview = false
      notify()
      flyToFrame(i)
    },
    next: () => api.step(1),
    previous: () => api.step(-1),
    step: (direction: 1 | -1) => {
      const nextIndex = stepFrameIndex(index, frames.length, direction)
      if (nextIndex === index && !overview) {
        return
      }
      api.goTo(nextIndex)
    },
    showOverview: () => {
      const target = cameraForOverview(doc, viewportSize())
      if (!target) {
        return
      }
      overview = true
      notify()
      animator.animateTo(target, doc.settings.transitionMs)
    },
    toggleOverview: () => {
      if (overview) {
        api.goTo(index)
      } else {
        api.showOverview()
      }
    },
    start: () => {
      if (frames.length === 0) {
        const bounds = contentBounds(doc)
        if (bounds) {
          animator.animateTo(fitRectToViewport(bounds, viewportSize(), 0.08), 0)
        }
        return
      }
      notify()
      flyToFrame(0, 0)
    },
    refit: () => {
      if (overview) {
        api.showOverview()
      } else if (frames.length > 0) {
        flyToFrame(index, 0)
      }
    }
  }

  paint()
  return api
}

export type PlayerPresentation = ReturnType<typeof createPlayerPresentation>
