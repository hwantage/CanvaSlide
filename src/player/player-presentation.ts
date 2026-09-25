import { createVideoFocus } from '@shared/canvas/video-focus'
import { createCameraAnimator } from '@shared/canvas/camera-animator'
import { worldLayerCssTransform } from '@shared/canvas/camera-transform'
import { zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { contentBounds } from '@shared/canvas/element-bounds'
import type { Camera, CanvasDocument, Size } from '@shared/canvas/element-types'
import { fitRectToViewport } from '@shared/canvas/frame-fit'
import {
  LEVEL_SHOT,
  spotlightMaskPath,
  stageRollStyle,
  type Shot
} from '@shared/canvas/presentation-shot'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import {
  createPresentationNavigator,
  type PresentationPosition
} from '@shared/presentation/presentation-navigator'
import { createViewportRefit } from '@shared/presentation/viewport-refit'
import type { FrameNode } from './player-dom'
import { createPlayerVideos } from './player-video'

type Mount = {
  viewport: HTMLElement
  stage: HTMLElement
  world: HTMLElement
  zoomLayer: HTMLElement
  spotlight: SVGSVGElement
  spotlightPath: SVGPathElement
  frameNodes: FrameNode[]
}

/** The standalone player's adapter: DOM painting, videos and resizes around the shared navigator. */
export function createPlayerPresentation(doc: CanvasDocument, mount: Mount) {
  const frames = orderedFrames(doc)
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  let position: PresentationPosition = { index: 0, overview: false }
  const listeners = new Set<() => void>()
  const viewListeners = new Set<() => void>()

  const viewportSize = (): Size => ({
    width: Math.max(1, mount.viewport.clientWidth),
    height: Math.max(1, mount.viewport.clientHeight)
  })

  // Why: the player's world is never composited, so it is painted through its transform at the
  // real scale — as sharp as a CSS zoom re-layout, without ever reflowing (see worldLayoutZoom).
  const LAYOUT_ZOOM = 1
  Object.assign(mount.zoomLayer.style, zoomLayerCssStyle(LAYOUT_ZOOM, navigator.userAgent))
  /** Roll, dimming and the cut-out; the cut-out travels with the flight instead of jumping ahead. */
  let shot: Shot = LEVEL_SHOT

  const paintShot = () => {
    Object.assign(mount.stage.style, stageRollStyle(shot.roll))
    for (const listener of viewListeners) {
      listener()
    }
    const mask = spotlightMaskPath(shot, camera, viewportSize())
    if (!mask) {
      mount.spotlight.style.display = 'none'
      return
    }
    mount.spotlight.style.display = ''
    mount.spotlightPath.setAttribute('d', mask)
    mount.spotlightPath.setAttribute('fill-opacity', String(shot.spotlight))
  }

  const paint = () => {
    mount.world.style.transformOrigin = '0 0'
    mount.world.style.transform = worldLayerCssTransform(camera, LAYOUT_ZOOM)
    // Why: frame outlines are in world units; keep them ~2px on screen at any zoom.
    mount.zoomLayer.style.setProperty('--stroke-px', `${2 / camera.zoom}px`)
    paintShot()
  }

  const animator = createCameraAnimator({
    getCamera: () => camera,
    setCamera: (next) => {
      camera = next
      paint()
    },
    getViewport: viewportSize
  })

  const videoFocus = createVideoFocus({
    getView: () => ({ camera, shot }),
    setView: (view) => {
      animator.cancel()
      camera = view.camera
      shot = view.shot
      paint()
    },
    getRect: (id) => {
      const element = doc.elements[id]
      return element?.type === 'video' ? element : null
    },
    getViewport: viewportSize,
    onRestore: () => navigation.refit()
  })
  const videos = createPlayerVideos(doc, mount.zoomLayer, videoFocus)

  const notify = () => {
    mount.viewport.classList.toggle('uc-overview', position.overview)
    mount.frameNodes.forEach(({ node, index: i }) =>
      node.classList.toggle('is-current', i === position.index)
    )
    for (const listener of listeners) {
      listener()
    }
  }

  const navigation = createPresentationNavigator({
    getDocument: () => doc,
    getViewport: viewportSize,
    getCamera: () => camera,
    isAnimating: animator.isAnimating,
    animateTo: animator.animateTo,
    getShot: () => shot,
    setShot: (next) => {
      shot = next
      paintShot()
    },
    getPosition: () => position,
    setPosition: (next) => {
      // Leaving a frame, or leaving it for the overview, stops its videos until the next landing.
      if (next.overview || next.index !== position.index) {
        videos.show(null)
      }
      position = next
      notify()
    },
    onFrameLanded: videos.show
  })
  const viewportRefit = createViewportRefit({
    refitMedia: videoFocus.refit,
    refit: navigation.refit
  })

  const api = {
    get index() {
      return position.index
    },
    get overview() {
      return position.overview
    },
    get count() {
      return frames.length
    },
    frames,
    getView: () => ({ camera, viewport: viewportSize(), roll: shot.roll }),
    onViewChange: (listener: () => void) => {
      viewListeners.add(listener)
      return () => {
        viewListeners.delete(listener)
      }
    },
    onChange: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      viewportRefit.cancel()
      animator.cancel()
      videos.dispose()
      listeners.clear()
      viewListeners.clear()
    },
    goTo: navigation.goTo,
    next: () => navigation.step(1),
    previous: () => navigation.step(-1),
    toggleOverview: navigation.toggleOverview,
    /** Opens on the first frame; a file has no earlier view to fly in from. */
    start: () => {
      if (navigation.start()) {
        navigation.flyToCurrent(0)
        return
      }
      // Why: an exported board without frames still shows its content behind the notice.
      const bounds = contentBounds(doc)
      if (bounds) {
        animator.animateTo(fitRectToViewport(bounds, viewportSize(), 0.08), 0)
      }
    },
    /** Called on every viewport resize; the refit waits for the burst to settle. */
    resize: viewportRefit.request
  }

  paint()
  return api
}
