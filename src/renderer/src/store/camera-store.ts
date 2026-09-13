import { create } from 'zustand'
import {
  DEFAULT_CAMERA,
  cameraForWorldCenter,
  clampZoom,
  panBy,
  viewportCenterWorld,
  zoomAtScreenPoint,
  zoomByWheel
} from '@shared/canvas/camera-transform'
import { createCameraAnimator } from '@shared/canvas/camera-animator'
import type { Camera, Point, Rect, Size } from '@shared/canvas/element-types'
import {
  fitContentToViewport,
  fitRectToViewport,
  fitSelectionToViewport
} from '@shared/canvas/frame-fit'

export const ZOOM_STEP = 1.25
const UI_ANIMATION_MS = 350

export type CameraState = {
  camera: Camera
  viewport: Size
}

export type CameraActions = {
  setCamera: (camera: Camera) => void
  setViewport: (viewport: Size) => void
  panBy: (dx: number, dy: number) => void
  zoomAtScreenPoint: (anchor: Point, zoom: number) => void
  zoomByWheel: (anchor: Point, deltaY: number, multiplier?: number) => void
  zoomStep: (direction: 1 | -1) => void
  resetZoom: () => void
  animateTo: (camera: Camera, durationMs: number, onDone?: () => void) => void
  fitRect: (rect: Rect, durationMs?: number) => void
  fitContent: (rect: Rect) => void
  fitSelection: (rect: Rect) => void
  cancelAnimation: () => void
  isAnimating: () => boolean
}

export type CameraStore = CameraState & CameraActions

export const useCameraStore = create<CameraStore>()((set, get) => {
  const animator = createCameraAnimator({
    getCamera: () => get().camera,
    setCamera: (camera) => set({ camera }),
    getViewport: () => get().viewport
  })
  const stopAndSet = (camera: Camera) => {
    animator.cancel()
    set({ camera })
  }
  return {
    camera: DEFAULT_CAMERA,
    viewport: { width: 1, height: 1 },
    setCamera: stopAndSet,
    setViewport: (viewport) => set({ viewport }),
    panBy: (dx, dy) => stopAndSet(panBy(get().camera, dx, dy)),
    zoomAtScreenPoint: (anchor, zoom) => stopAndSet(zoomAtScreenPoint(get().camera, anchor, zoom)),
    zoomByWheel: (anchor, deltaY, multiplier = 1) =>
      stopAndSet(zoomByWheel(get().camera, anchor, deltaY, multiplier)),
    zoomStep: (direction) => {
      const { camera, viewport } = get()
      const center = viewportCenterWorld(camera, viewport)
      const zoom = clampZoom(direction === 1 ? camera.zoom * ZOOM_STEP : camera.zoom / ZOOM_STEP)
      animator.animateTo(cameraForWorldCenter(center, zoom, viewport), UI_ANIMATION_MS)
    },
    resetZoom: () => {
      const { camera, viewport } = get()
      const center = viewportCenterWorld(camera, viewport)
      animator.animateTo(cameraForWorldCenter(center, 1, viewport), UI_ANIMATION_MS)
    },
    animateTo: (camera, durationMs, onDone) => animator.animateTo(camera, durationMs, onDone),
    fitRect: (rect, durationMs = UI_ANIMATION_MS) =>
      animator.animateTo(fitRectToViewport(rect, get().viewport), durationMs),
    fitContent: (rect) =>
      animator.animateTo(fitContentToViewport(rect, get().viewport), UI_ANIMATION_MS),
    fitSelection: (rect) =>
      animator.animateTo(fitSelectionToViewport(rect, get().viewport), UI_ANIMATION_MS),
    cancelAnimation: () => animator.cancel(),
    isAnimating: () => animator.isAnimating()
  }
})

export const selectCamera = (s: CameraStore) => s.camera
export const selectViewport = (s: CameraStore) => s.viewport
export const selectZoom = (s: CameraStore) => s.camera.zoom
