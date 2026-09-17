import type { ImageElement as ImageElementModel } from '@shared/canvas/element-types'
import { useLayoutEffect, useRef, useState } from 'react'
import { useImageSource } from '@/hooks/use-image-source'
import { useImageDetail } from '@/hooks/use-image-detail'
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
  const scale = asset?.mime === 'image/svg+xml' ? layoutScale : 1
  const preview = useImageSource(element, asset, selected)
  const { tiles: detail, visible } = useImageDetail(element, asset, preview)
  const tiles = useRef<(HTMLCanvasElement | null)[]>([])
  const [painted, setPainted] = useState<typeof detail>()
  useLayoutEffect(() => {
    if (!detail) {
      return
    }
    const frame = requestAnimationFrame(() => {
      if (detail.some((tile, index) => !tile.canvas.width || !tiles.current[index])) {
        return
      }
      // Copy every surface before hiding the preview; PNG encoding blocks WebKit's main thread.
      for (const [index, tile] of detail.entries()) {
        const context = tiles.current[index]!.getContext('2d')
        if (!context) {
          return
        }
        context.clearRect(0, 0, tile.pixels.width, tile.pixels.height)
        context.drawImage(tile.canvas, 0, 0)
      }
      setPainted(detail)
    })
    return () => cancelAnimationFrame(frame)
  }, [detail])
  const showDetail = visible && detail && painted === detail
  return (
    <>
      <img
        src={preview?.src}
        alt=""
        draggable={false}
        data-element-id={element.id}
        data-element-type="image"
        className="absolute max-w-none select-none"
        style={{
          left: element.x,
          top: element.y,
          width: element.width * scale,
          height: element.height * scale,
          transform: scale > 1 ? `scale(${1 / scale})` : undefined,
          transformOrigin: '0 0',
          willChange: scale > 1 ? 'transform' : undefined,
          visibility: preview && !showDetail ? 'visible' : 'hidden'
        }}
      />
      {detail?.map(({ crop, pixels }, index) => (
        <canvas
          key={index}
          ref={(node) => {
            tiles.current[index] = node
          }}
          width={pixels.width}
          height={pixels.height}
          aria-hidden="true"
          data-image-detail-id={element.id}
          className="absolute max-w-none select-none"
          style={{
            left: element.x + crop.x * element.width,
            top: element.y + crop.y * element.height,
            width: crop.width * element.width,
            height: crop.height * element.height,
            visibility: showDetail ? 'visible' : 'hidden'
          }}
        />
      ))}
    </>
  )
}
