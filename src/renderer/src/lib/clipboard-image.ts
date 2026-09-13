import { t } from '@/i18n/ui-strings'
export const MAX_PASTED_IMAGE_EDGE = 2048

export type DecodedImage = { src: string; width: number; height: number }

export function findImageFile(data: DataTransfer | null): File | null {
  if (!data) {
    return null
  }
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('error.decodePasted')))
    img.src = url
  })
}

/** Downscales large images so documents stay small; keeps PNG for transparency, else JPEG. */
export async function decodeImageFile(
  file: File,
  maxEdge: number = MAX_PASTED_IMAGE_EDGE
): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error(t('error.canvasContext'))
    }
    context.drawImage(img, 0, 0, width, height)
    const mime = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg'
    return { src: canvas.toDataURL(mime, 0.92), width, height }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
