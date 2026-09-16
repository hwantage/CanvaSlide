import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  layoutZoomFor,
  worldLayerCssTransform,
  ZOOM_SETTLE_MS
} from '@shared/canvas/camera-transform'
import type { Camera } from '@shared/canvas/element-types'
import { useSettledZoom } from '@/hooks/use-settled-zoom'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'
import { ElementView } from './element-view'

const COMPOSITE_VECTOR_COUNT = 256

/** Single transformed layer; frames render beneath all content regardless of z-order. */
export function WorldLayer() {
  const outerRef = useRef<HTMLDivElement>(null)
  const baseZoom = useSettledZoom()
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingTextId = useToolStore(selectEditingTextId)
  const compositeVectors = useMemo(
    () =>
      document.order.filter((id) => {
        const type = document.elements[id]?.type
        return type === 'shape' || type === 'text' || type === 'connector'
      }).length >= COMPOSITE_VECTOR_COUNT,
    [document]
  )

  // Why: the camera changes every frame while panning or animating; writing the transform straight
  // to the DOM keeps React (and its 500+ children) out of the per-frame path.
  useLayoutEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    const apply = (camera: Camera, gesture = false) => {
      if (outerRef.current) {
        outerRef.current.style.transform = worldLayerCssTransform(camera, baseZoom)
        if (settleTimer !== null) {
          clearTimeout(settleTimer)
          settleTimer = null
        }
        // Repainting thousands of SVG roots stalls WebKit; image previews already have raster caches.
        if (compositeVectors) {
          outerRef.current.style.willChange = 'transform'
        } else if (
          gesture &&
          !useCameraStore.getState().animationActive &&
          layoutZoomFor(camera.zoom) === baseZoom
        ) {
          outerRef.current.style.willChange = 'transform'
          settleTimer = setTimeout(() => apply(useCameraStore.getState().camera), ZOOM_SETTLE_MS)
        } else {
          // Release transient backing stores so a stationary document paints at its actual scale.
          outerRef.current.style.willChange = 'auto'
        }
      }
    }
    apply(useCameraStore.getState().camera)
    const unsubscribe = useCameraStore.subscribe((state, previous) =>
      apply(state.camera, state.camera !== previous.camera)
    )
    return () => {
      unsubscribe()
      if (settleTimer !== null) {
        clearTimeout(settleTimer)
      }
    }
  }, [baseZoom, compositeVectors])

  const frameIds = document.order.filter((id) => document.elements[id]?.type === 'frame')
  const contentIds = document.order.filter((id) => document.elements[id]?.type !== 'frame')

  const render = (id: string) => {
    const element = document.elements[id]
    if (!element) {
      return null
    }
    return (
      <ElementView
        key={id}
        element={element}
        editing={editingTextId === id}
        selected={selectedIds.includes(id)}
      />
    )
  }

  return (
    <div
      ref={outerRef}
      data-testid="world-layer"
      className="pointer-events-none absolute left-0 top-0"
      style={{ transformOrigin: '0 0' }}
    >
      {/* Why: CSS zoom re-lays out at the real scale, so vectors and text stay sharp at any zoom;
          transform: scale() would upscale a bitmap rasterized at 100%. It is committed only at rest. */}
      <div className="absolute left-0 top-0" style={{ zoom: baseZoom }}>
        {frameIds.map(render)}
        {contentIds.map(render)}
      </div>
    </div>
  )
}
