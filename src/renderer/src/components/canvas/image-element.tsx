import type { ImageElement as ImageElementModel } from '@shared/canvas/element-types'
import { useLayoutEffect, useRef, useState } from 'react'
import { useImageSource } from '@/hooks/use-image-source'
import { useImageDetail } from '@/hooks/use-image-detail'
import { useDocumentStore } from '@/store/document-store'

export function ImageElement({
  element,
  selected
}: {
  element: ImageElementModel
  selected: boolean
}) {
  const asset = useDocumentStore((s) => s.document.assets[element.assetId])
  const preview = useImageSource(element, asset, selected)
  const detail = useImageDetail(element, asset, preview)
  const tiles = useRef<(HTMLImageElement | null)[]>([])
  const [decoded, setDecoded] = useState<typeof detail>()
  useLayoutEffect(() => {
    if (!detail) {
      return
    }
    let active = true
    // Mounted images must be ready before hiding the fallback, even when their cached decoder is warm.
    void Promise.all(detail.map((_, index) => tiles.current[index]!.decode())).then(
      () => {
        if (active) {
          setDecoded(detail)
        }
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [detail])
  const showDetail = detail && decoded === detail
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
          width: element.width,
          height: element.height,
          visibility: preview && !showDetail ? 'visible' : 'hidden'
        }}
      />
      {detail?.map(({ crop, src }, index) => (
        <img
          key={index}
          ref={(node) => {
            tiles.current[index] = node
          }}
          src={src}
          alt=""
          draggable={false}
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
