import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ImageAsset, ImageElement } from '@shared/canvas/element-types'
import { imageIntersectsViewport } from '@shared/canvas/image-rendering'
import { svgPreviewCache } from '@/lib/svg-preview-cache'
import type { ImagePreview } from '@/lib/svg-image-preview'
import { useCameraStore } from '@/store/camera-store'

function visible(element: ImageElement, selected: boolean): boolean {
  const { camera, viewport } = useCameraStore.getState()
  return selected || imageIntersectsViewport(element, camera, viewport)
}

export function useImageSource(
  element: ImageElement,
  asset: ImageAsset | undefined,
  selected: boolean,
  layoutScale: number
): Pick<ImagePreview, 'src' | 'size'> | undefined {
  const [inView, setInView] = useState(() => visible(element, selected))
  const aspect = element.width / element.height
  const [preview, setPreview] = useState<{ asset: ImageAsset; image: ImagePreview } | null>(null)
  const displayedLease = useRef<{ release: () => void } | null>(null)
  if (preview && (!inView || preview.asset !== asset)) {
    setPreview(null)
  }
  useLayoutEffect(() => {
    const update = () => setInView(visible(element, selected))
    update()
    return useCameraStore.subscribe(update)
  }, [element, selected])
  const svg = asset?.mime === 'image/svg+xml'
  useEffect(() => {
    if (!asset || !svg || !inView) {
      displayedLease.current?.release()
      displayedLease.current = null
      return
    }
    const lease = svgPreviewCache.acquire(asset, aspect)
    let active = true
    let displayed = false
    void lease.ready.then((result) => {
      if (active) {
        const previous = displayedLease.current
        displayedLease.current = lease
        displayed = true
        setPreview({ asset, image: result })
        previous?.release()
      }
    })
    return () => {
      active = false
      // Keep the displayed lease alive while a resized preview is being prepared.
      if (!displayed) {
        lease.release()
      }
    }
  }, [asset, svg, inView, aspect])
  useEffect(
    () => () => {
      displayedLease.current?.release()
      displayedLease.current = null
    },
    []
  )
  if (!inView || !asset) {
    return undefined
  }
  if (!svg) {
    return { src: asset.data }
  }
  if (preview?.asset !== asset) {
    return undefined
  }
  // Compare detail demand with the original SVG's actual raster dimensions.
  return preview.image.size
    ? preview.image
    : {
        src: preview.image.src,
        size: {
          width: element.width * layoutScale * window.devicePixelRatio,
          height: element.height * layoutScale * window.devicePixelRatio
        }
      }
}
