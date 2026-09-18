import { t } from '@/i18n/ui-strings'
import { drawScaled, loadBitmap } from './scaled-bitmap'

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

/** Downscales large images so documents stay small; keeps PNG for transparency, else JPEG. */
export async function decodeImageFile(
  file: File,
  maxEdge: number = MAX_PASTED_IMAGE_EDGE
): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadBitmap(objectUrl, () => t('error.decodePasted'))
    const { canvas, width, height } = drawScaled(img, maxEdge, () => t('error.canvasContext'))
    const mime = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg'
    return { src: canvas.toDataURL(mime, 0.92), width, height }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
