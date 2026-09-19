import type { Rect } from './element-types'
import { parseVideoSource } from './video-source'

export const VIDEO_CHROME_HEIGHT = 46

export function videoAspectRatio(width: unknown, height: unknown): number | null {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  const ratio = width / height
  return ratio >= 0.1 && ratio <= 10 ? ratio : null
}

/** Shorts links provide a portrait hint when the provider cannot supply dimensions. */
export function initialVideoAspectRatio(raw: string): number {
  return parseVideoSource(raw)?.provider === 'youtube' &&
    new URL(raw.trim()).pathname.startsWith('/shorts/')
    ? 9 / 16
    : 16 / 9
}

/** Reserve controls separately so the actual video surface keeps its source ratio. */
export function videoInsertionRect(ratio: number, box: Rect): Rect {
  const aspect = videoAspectRatio(ratio, 1) ?? 16 / 9
  const width = Math.max(
    1,
    Math.min(640, box.width - 2, (box.height - VIDEO_CHROME_HEIGHT) * aspect, 640 * aspect)
  )
  const outerWidth = width + 2
  const height = width / aspect + VIDEO_CHROME_HEIGHT
  return {
    x: box.x + (box.width - outerWidth) / 2,
    y: box.y + (box.height - height) / 2,
    width: outerWidth,
    height
  }
}
