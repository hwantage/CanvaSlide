import { createVideoFocus } from '@shared/canvas/video-focus'
import { createCameraAnimator } from '@shared/canvas/camera-animator'
import { worldLayerCssTransform } from '@shared/canvas/camera-transform'
import { zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { contentBounds } from '@shared/canvas/element-bounds'
import type { Camera, CanvasDocument, Size } from '@shared/canvas/element-types'
import { cameraForOverview, fitRectToViewport } from '@shared/canvas/frame-fit'
import {
  LEVEL_SHOT,
  frameShot,
  frameShotAt,
  shotCamera,
  shotTween,
  spotlightMaskPath,
  stageRollStyle,
  type Shot
} from '@shared/canvas/presentation-shot'
import { orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
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

/** Slideshow controller for the standalone player: same math and timings as the app. */
export function createPlayerPresentation(doc: CanvasDocument, mount: Mount) {
  const frames = orderedFrames(doc)
  let flight = 0
  let camera: Camera = { x: 0, y: 0, zoom: 1 }
  let index = 0
  let overview = false
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

  /** Runs the shot on the camera's eased clock so it lands with the move; same maths as the app. */
  const shotProgress = (to: Shot) => {
    const tween = shotTween(shot, to)
    return (
      tween &&
      ((t: number) => {
        shot = tween(t)
        paintShot()
      })
    )
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
    getViewport: viewportSize
  })
  const videos = createPlayerVideos(doc, mount.zoomLayer, videoFocus)

  const notify = () => {
    mount.viewport.classList.toggle('uc-overview', overview)
    mount.frameNodes.forEach(({ node, index: i }) =>
      node.classList.toggle('is-current', i === index)
    )
    for (const listener of listeners) {
      listener()
    }
  }

  const flyToFrame = (i: number, durationMs?: number) => {
    const at = frameShotAt(doc, i)
    if (!at) {
      return
    }
    const token = ++flight
    animator.animateTo(shotCamera(at, viewportSize()), durationMs ?? at.motion.ms, {
      rho: at.motion.arc,
      easing: at.motion.easing,
      onProgress: shotProgress(frameShot(at)),
      onDone: () => {
        if (token === flight && !overview) {
          videos.show(frames[i]?.id ?? null)
        }
      }
    })
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
      flight++
      animator.cancel()
      videos.dispose()
      listeners.clear()
      viewListeners.clear()
    },
    goTo: (i: number) => {
      if (i < 0 || i >= frames.length) {
        return
      }
      if (i !== index || overview) {
        videos.show(null)
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
      flight++
      videos.show(null)
      notify()
      // Why: the overview is level and lit, and the hole fades where it stands.
      animator.animateTo(target, doc.settings.transitionMs, {
        onProgress: shotProgress(LEVEL_SHOT)
      })
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
      if (videoFocus.refit()) {
        return
      }
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
