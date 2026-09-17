import { createCameraAnimator } from '@shared/canvas/camera-animator'
import { worldLayerCssTransform, worldRectToScreen } from '@shared/canvas/camera-transform'
import { zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { contentBounds, elementRect, interpolateRect } from '@shared/canvas/element-bounds'
import type { Camera, CanvasDocument, Rect, Size } from '@shared/canvas/element-types'
import { cameraForOverview, fitRectToViewport } from '@shared/canvas/frame-fit'
import { resolveFrameTransition } from '@shared/canvas/frame-transition'
import { orderedFrames, stepFrameIndex } from '@shared/canvas/presentation-sequence'
import type { FrameNode } from './player-dom'

type Mount = {
  viewport: HTMLElement
  stage: HTMLElement
  world: HTMLElement
  zoomLayer: HTMLElement
  spotlight: SVGSVGElement
  spotlightPath: SVGPathElement
  frameNodes: FrameNode[]
}

/** Times the viewport so the dim still covers every corner once the stage rolls. */
const SPOTLIGHT_COVER = 3

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

  // Why: the player's world is never composited, so it is painted through its transform at the
  // real scale — as sharp as a CSS zoom re-layout, without ever reflowing (see worldLayoutZoom).
  const LAYOUT_ZOOM = 1
  Object.assign(mount.zoomLayer.style, zoomLayerCssStyle(LAYOUT_ZOOM, navigator.userAgent))
  let roll = 0
  let spotlight = 0
  /** The cut-out in world units; it travels with the flight rather than jumping to the target. */
  let spotlightRect: Rect | null = null

  /** Roll and dimming ride the camera's own eased clock, so the shot lands with the move. */
  const paintShot = () => {
    mount.stage.style.transform = roll === 0 ? '' : `rotate(${roll}deg)`
    mount.stage.style.willChange = roll === 0 ? 'auto' : 'transform'
    if (spotlight <= 0.001 || !spotlightRect) {
      mount.spotlight.style.display = 'none'
      return
    }
    const hole = worldRectToScreen(camera, spotlightRect)
    const { width, height } = viewportSize()
    const spanX = width * SPOTLIGHT_COVER
    const spanY = height * SPOTLIGHT_COVER
    mount.spotlight.style.display = ''
    mount.spotlightPath.setAttribute(
      'd',
      `M${-spanX},${-spanY}H${spanX}V${spanY}H${-spanX}Z` +
        `M${hole.x},${hole.y}h${hole.width}v${hole.height}h${-hole.width}Z`
    )
    mount.spotlightPath.setAttribute('fill-opacity', String(spotlight))
  }

  const shotProgress = (to: { roll: number; spotlight: number; rect?: Rect }) => {
    const fromRoll = roll
    const fromSpotlight = spotlight
    const fromRect = spotlightRect ?? to.rect ?? null
    const toRect = to.rect ?? fromRect
    if (fromRoll === to.roll && fromSpotlight === to.spotlight && fromRect === toRect) {
      return undefined
    }
    return (t: number) => {
      roll = fromRoll + (to.roll - fromRoll) * t
      spotlight = fromSpotlight + (to.spotlight - fromSpotlight) * t
      spotlightRect =
        fromRect && toRect ? interpolateRect(fromRect, toRect, t) : (toRect ?? fromRect)
      paintShot()
    }
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
    const frame = frames[i]
    if (!frame) {
      return
    }
    const motion = resolveFrameTransition(frame, doc.settings)
    const onProgress = shotProgress({
      roll: motion.roll,
      spotlight: motion.spotlight,
      rect: elementRect(frame)
    })
    animator.animateTo(
      fitRectToViewport(elementRect(frame), viewportSize(), undefined, motion.roll),
      durationMs ?? motion.ms,
      { rho: motion.arc, easing: motion.easing, onProgress }
    )
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
      // Why: the overview is a plain top-down look at the board, so roll and dimming unwind.
      animator.animateTo(target, doc.settings.transitionMs, {
        // Why: the overview is level and lit, and the hole fades where it stands.
        onProgress: shotProgress({ roll: 0, spotlight: 0 })
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
