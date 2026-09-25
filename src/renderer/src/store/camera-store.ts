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
import { createCameraAnimator, type CameraFlightOptions } from '@shared/canvas/camera-animator'
import { prepareCameraFlight } from '@/lib/raster/camera-flight-preparation'
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
  animationActive: boolean
  stationaryCamera: Camera | null
  flightTarget: Camera | null
  flightZoom: number | null
  animationTarget: Camera | null
}

export type CameraActions = {
  setCamera: (camera: Camera) => void
  setViewport: (viewport: Size) => void
  panBy: (dx: number, dy: number) => void
  zoomAtScreenPoint: (anchor: Point, zoom: number) => void
  zoomByWheel: (anchor: Point, deltaY: number, multiplier?: number) => void
  zoomStep: (direction: 1 | -1) => void
  resetZoom: () => void
  animateTo: (camera: Camera, durationMs: number, options?: CameraFlightOptions) => void
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
    getViewport: () => get().viewport,
    prepare: (from, target, viewport) => {
      set({ flightTarget: target, flightZoom: Math.max(from.zoom, target.zoom) })
      return prepareCameraFlight(from, target, viewport)
    },
    onActiveChange: (animationActive, target) =>
      set({
        animationActive,
        animationTarget: target ?? null,
        ...(!animationActive ? { flightTarget: null, flightZoom: null } : {})
      }),
    onStationaryChange: (stationaryCamera) => {
      if (get().stationaryCamera !== stationaryCamera) {
        set({ stationaryCamera })
      }
    }
  })
  const stopAndSet = (camera: Camera) => {
    animator.cancel()
    set({ camera })
  }
  /** Animates to `zoom` about the viewport centre, so what is in the middle stays there. */
  const zoomTo = (zoom: number) => {
    const { camera, viewport } = get()
    const center = viewportCenterWorld(camera, viewport)
    animator.animateTo(cameraForWorldCenter(center, zoom, viewport), UI_ANIMATION_MS)
  }
  return {
    camera: DEFAULT_CAMERA,
    viewport: { width: 1, height: 1 },
    animationActive: false,
    stationaryCamera: null,
    flightTarget: null,
    flightZoom: null,
    animationTarget: null,
    setCamera: stopAndSet,
    setViewport: (viewport) => set({ viewport }),
    panBy: (dx, dy) => stopAndSet(panBy(get().camera, dx, dy)),
    zoomAtScreenPoint: (anchor, zoom) => stopAndSet(zoomAtScreenPoint(get().camera, anchor, zoom)),
    zoomByWheel: (anchor, deltaY, multiplier = 1) =>
      stopAndSet(zoomByWheel(get().camera, anchor, deltaY, multiplier)),
    zoomStep: (direction) => {
      const { zoom } = get().camera
      zoomTo(clampZoom(direction === 1 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP))
    },
    resetZoom: () => zoomTo(1),
    animateTo: (camera, durationMs, options) => animator.animateTo(camera, durationMs, options),
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
