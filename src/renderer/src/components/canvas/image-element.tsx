import type { ImageElement as ImageElementModel } from '@shared/canvas/element-types'
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { mergeDetailTiles } from '@shared/canvas/image-detail'
import { rotationCss } from '@shared/canvas/element-style'
import { svgImageLayoutScale } from '@shared/canvas/image-rendering'
import { imageSurfaceStyle } from '@shared/canvas/image-surface'
import { useImageSource } from '@/hooks/use-image-source'
import { useImageDetail } from '@/hooks/use-image-detail'
import {
  detailPainted,
  detailRevealed,
  subscribeDetailReveal
} from '@/lib/raster/image-detail-reveal'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

export function ImageElement({
  element,
  selected,
  layoutScale
}: {
  element: ImageElementModel
  selected: boolean
  layoutScale: number
}) {
  const asset = useDocumentStore((s) => s.document.assets[element.assetId])
  const scale = Math.max(svgImageLayoutScale(element), layoutScale)
  const preview = useImageSource(element, asset, selected, scale)
  const { tiles: detail, visible } = useImageDetail(element, asset, preview)
  const surface = useRef<HTMLCanvasElement | null>(null)
  const paintedCamera = useRef(useCameraStore.getState().camera)
  const merged = useMemo(() => (detail ? mergeDetailTiles(detail) : null), [detail])
  const [painted, setPainted] = useState<typeof detail>()
  useLayoutEffect(() => {
    if (!detail || !merged) {
      return
    }
    const frame = requestAnimationFrame(() => {
      const canvas = surface.current
      if (!canvas || detail.some((tile) => !tile.canvas.width)) {
        return
      }
      // Keep the surface painted through its transform, without a separate accelerated layer.
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        return
      }
      // Copy every surface before hiding the preview; PNG encoding blocks WebKit's main thread.
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const [index, tile] of detail.entries()) {
        context.drawImage(tile.canvas, merged.offsets[index]!.x, merged.offsets[index]!.y)
      }
      paintedCamera.current = useCameraStore.getState().camera
      setPainted(detail)
      // Retained preview tiles keep the reveal batch they were painted for.
      detailPainted(paintedCamera.current, element.id)
    })
    return () => cancelAnimationFrame(frame)
  }, [detail, merged, element.id])
  const revealed = useSyncExternalStore(subscribeDetailReveal, () =>
    detailRevealed(paintedCamera.current)
  )
  const showDetail = visible && detail && painted === detail && revealed
  // An SVG shown as-is is rasterized at its layout size: lay it out larger and scale it back.
  const vector = asset?.mime === 'image/svg+xml' && preview?.src === asset.data
  const turn = rotationCss(element)
  const previewSize = vector
    ? { width: element.width * scale, height: element.height * scale }
    : (preview?.size ?? asset ?? element)
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        transform: `translate(${element.x}px, ${element.y}px) ${turn.transform ?? ''}`.trim(),
        // Why: the wrapper has no size of its own; turn about the image's centre, not its corner.
        transformOrigin: turn.transformOrigin ?? '0 0'
      }}
    >
      <img
        src={preview?.src}
        alt=""
        draggable={false}
        data-element-id={element.id}
        data-element-type="image"
        className="absolute left-0 top-0 max-w-none select-none"
        style={{
          ...imageSurfaceStyle(element, previewSize),
          visibility: preview && !showDetail ? 'visible' : 'hidden'
        }}
      />
      {merged && (
        <canvas
          ref={surface}
          width={merged.pixels.width}
          height={merged.pixels.height}
          aria-hidden="true"
          data-image-detail-id={element.id}
          className="absolute left-0 top-0 max-w-none select-none"
          style={{
            ...imageSurfaceStyle(element, merged.pixels, merged.crop),
            visibility: showDetail ? 'visible' : 'hidden'
          }}
        />
      )}
    </div>
  )
}
