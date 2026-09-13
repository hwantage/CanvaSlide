import type { ImageElement as ImageElementModel } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'

export function ImageElement({ element }: { element: ImageElementModel }) {
  const src = useDocumentStore((s) => s.document.assets[element.assetId]?.data)
  if (!src) {
    return null
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-element-id={element.id}
      data-element-type="image"
      className="absolute max-w-none select-none"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    />
  )
}
