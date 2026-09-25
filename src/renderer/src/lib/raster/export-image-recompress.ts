import { createImageAsset, mimeOfDataUrl } from '@shared/canvas/document-assets'
import type { CanvasDocument, ImageAsset } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { drawScaled, loadBitmap } from './scaled-bitmap'

export const exportQualities = ['original', 'balanced', 'small'] as const
export type ExportQuality = (typeof exportQualities)[number]

/** Labels and hints live in the i18n resources under `export.quality.*`. */
export const exportQualityPresets: Record<
  ExportQuality,
  { maxEdge: number; quality: number } | null
> = {
  original: null,
  balanced: { maxEdge: 1600, quality: 0.85 },
  small: { maxEdge: 1200, quality: 0.75 }
}

/** Prefers WebP (alpha-safe, smallest); falls back when the engine cannot encode it. */
function encode(canvas: HTMLCanvasElement, sourceMime: string, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) {
    return webp
  }
  return sourceMime === 'image/png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', quality)
}

export async function recompressAsset(
  asset: ImageAsset,
  preset: { maxEdge: number; quality: number }
): Promise<ImageAsset> {
  const img = await loadBitmap(asset.data, () => t('error.decodeAsset'))
  let scaled: ReturnType<typeof drawScaled>
  try {
    scaled = drawScaled(img, preset.maxEdge, () => t('error.canvasContext'))
  } catch {
    // Why: no 2D context means nothing can be re-encoded; the original is still a valid export.
    return asset
  }
  const { canvas, width, height } = scaled
  const data = encode(canvas, mimeOfDataUrl(asset.data), preset.quality)
  // Why: never let "compression" grow a file (tiny PNGs re-encode larger).
  if (data.length >= asset.data.length) {
    return asset
  }
  return { ...createImageAsset(data, width, height), id: asset.id }
}

/** Returns a copy of the document whose assets are re-encoded per the preset. */
export async function recompressDocumentAssets(
  document: CanvasDocument,
  quality: ExportQuality
): Promise<CanvasDocument> {
  const preset = exportQualityPresets[quality]
  if (!preset) {
    return document
  }
  const entries = await Promise.all(
    Object.values(document.assets).map(
      async (asset) => [asset.id, await recompressAsset(asset, preset)] as const
    )
  )
  return { ...document, assets: Object.fromEntries(entries) }
}
