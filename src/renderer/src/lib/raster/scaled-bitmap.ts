/** A decoded bitmap drawn onto a canvas no larger than `maxEdge` on its longest side. */
export type ScaledBitmap = { canvas: HTMLCanvasElement; width: number; height: number }

export function loadBitmap(src: string, decodeError: () => string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(decodeError()))
    img.src = src
  })
}

/** Downscales so the longest edge is at most `maxEdge`; never upscales, never yields a 0 px edge. */
export function drawScaled(
  img: HTMLImageElement,
  maxEdge: number,
  contextError: () => string
): ScaledBitmap {
  if (
    [maxEdge, img.naturalWidth, img.naturalHeight].some(
      (edge) => !Number.isFinite(edge) || edge <= 0
    )
  ) {
    throw new RangeError(contextError())
  }
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(contextError())
  }
  context.drawImage(img, 0, 0, width, height)
  return { canvas, width, height }
}
