import { imageLayoutScale } from '@shared/canvas/image-rendering'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { worldLayerCssTransform } from '@shared/canvas/camera-transform'
import type { Camera } from '@shared/canvas/element-types'
import { worldLayerWillChange, zoomLayerCssStyle } from '@shared/canvas/zoom-layer-style'
import { useSettledZoom } from '@/hooks/use-settled-zoom'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'
import { selectEditingTextId, useToolStore } from '@/store/tool-store'
import { ElementView } from './element-view'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { autoplayVideoIds, frameVideos } from '@shared/canvas/video-playback'

const DENSE_VECTOR_COUNT = 256

/** Single transformed layer; frames render beneath all content regardless of z-order. */
export function WorldLayer({ readOnly = false }: { readOnly?: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const previewing = usePresentationStore((s) => s.previewFrameId !== null)
  const flightZoom = useCameraStore((s) => (previewing ? s.flightZoom : null))
  const document = useDocumentStore(selectDocument)
  const session = useDocumentStore((s) => s.session)
  const active = usePresentationStore((s) => s.active)
  const overview = usePresentationStore((s) => s.overview)
  const index = usePresentationStore((s) => s.index)
  const animating = useCameraStore((s) => s.animationActive)
  const frameId =
    active && !previewing && !overview ? (orderedFrames(document)[index]?.id ?? null) : null
  const videos = useMemo(() => frameVideos(document, frameId), [document, frameId])
  const autoplayIds = useMemo(() => new Set(autoplayVideoIds(videos)), [videos])
  const memberIds = useMemo(() => new Set(videos.map((video) => video.id)), [videos])
  const selectedIds = useDocumentStore(selectSelectedIds)
  const editingTextId = useToolStore(selectEditingTextId)
  const denseVectors = useMemo(
    () =>
      document.order.filter((id) => {
        const type = document.elements[id]?.type
        return type === 'shape' || type === 'text' || type === 'connector'
      }).length >= DENSE_VECTOR_COUNT,
    [document]
  )
  const baseZoom = useSettledZoom(denseVectors)
  const willChange = worldLayerWillChange({
    denseVectors,
    presenting: active,
    previewing,
    userAgent: navigator.userAgent
  })

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

  useLayoutEffect(() => {
    if (outerRef.current) {
      outerRef.current.style.willChange = willChange
    }
  }, [willChange])

  const frameIds = document.order.filter((id) => document.elements[id]?.type === 'frame')
  const contentIds = document.order.filter((id) => document.elements[id]?.type !== 'frame')

  const render = (id: string) => {
    const element = document.elements[id]
    if (!element) {
      return null
    }
    return (
      <ElementView
        key={
          element.type === 'video'
            ? `${session}:${id}:${active ? (frameId ?? 'passive') : 'editor'}`
            : id
        }
        element={element}
        editing={!readOnly && editingTextId === id}
        selected={!readOnly && selectedIds.includes(id)}
        videoMode={
          !active
            ? 'editor'
            : animating || !memberIds.has(id)
              ? 'passive'
              : autoplayIds.has(id)
                ? 'auto'
                : 'manual'
        }
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
