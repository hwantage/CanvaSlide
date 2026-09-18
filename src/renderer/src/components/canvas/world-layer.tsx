import { imageLayoutScale } from '@shared/canvas/image-rendering'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { worldLayerCssTransform } from '@shared/canvas/camera-transform'
import type { Camera } from '@shared/canvas/element-types'
import { zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { useSettledZoom } from '@/hooks/use-settled-zoom'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'
import { ElementView } from './element-view'

const COMPOSITE_VECTOR_COUNT = 256

/** Single transformed layer; frames render beneath all content regardless of z-order. */
export function WorldLayer() {
  const outerRef = useRef<HTMLDivElement>(null)
  const previewing = usePresentationStore((s) => s.previewFrameId !== null)
  const flightZoom = useCameraStore((s) => (previewing ? s.flightZoom : null))
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
  const baseZoom = useSettledZoom(compositeVectors)

  // Why: the camera changes every frame while panning or animating; writing the transform straight
  // to the DOM keeps React (and its 500+ children) out of the per-frame path.
  useLayoutEffect(() => {
    const apply = (camera: Camera) => {
      if (outerRef.current) {
        outerRef.current.style.transform = worldLayerCssTransform(camera, baseZoom)
      }
    }
    apply(useCameraStore.getState().camera)
    return useCameraStore.subscribe((state) => apply(state.camera))
  }, [baseZoom])

  // Why: repainting thousands of SVG roots every frame stalls WebKit, so a dense world is
  // composited. Light documents avoid that backing store; both settle at native layout resolution
  // in editing and previews because WebViews may rasterize transformed content at its layout scale.
  useLayoutEffect(() => {
    if (outerRef.current) {
      outerRef.current.style.willChange = compositeVectors ? 'transform' : 'auto'
    }
  }, [compositeVectors])

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
        layoutScale={
          element.type === 'image' ? imageLayoutScale(element, baseZoom, flightZoom ?? baseZoom) : 1
        }
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
      {/* Why: editing and previews re-layout with CSS zoom once the camera rests to stay sharp;
          light slideshows keep their layout (see worldLayoutZoom). Text metrics must not
          depend on the zoom either way (see zoomLayerCssStyle). */}
      <div
        className="absolute left-0 top-0"
        style={zoomLayerCssStyle(baseZoom, navigator.userAgent)}
      >
        {frameIds.map(render)}
        {contentIds.map(render)}
      </div>
    </div>
  )
}
