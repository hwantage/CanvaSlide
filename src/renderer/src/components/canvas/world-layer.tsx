import { useLayoutEffect, useMemo, useRef } from 'react'
import { worldLayerCssTransform } from '@shared/canvas/camera-transform'
import type { Camera } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { useSettledZoom } from '@/hooks/use-settled-zoom'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'
import { ElementView } from './element-view'

/** Single transformed layer; frames render beneath all content regardless of z-order. */
export function WorldLayer() {
  const outerRef = useRef<HTMLDivElement>(null)
  const baseZoom = useSettledZoom()
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingTextId = useToolStore(selectEditingTextId)

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

  const frameIndexById = useMemo(() => {
    const map = new Map<string, number>()
    orderedFrames(document).forEach((frame, index) => map.set(frame.id, index))
    return map
  }, [document])

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
        frameIndex={frameIndexById.get(id) ?? 0}
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
