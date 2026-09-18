import type { Rect, TextElement } from './element-types'

export function textClipPath(clip: TextElement['clip']): string | undefined {
  return clip
    ? `inset(${clip.top * 100}% ${clip.right * 100}% ${clip.bottom * 100}% ${clip.left * 100}%)`
    : undefined
}

export function visibleTextRect(element: TextElement): Rect {
  const { clip } = element
  if (!clip) {
    return element
  }
  return {
    x: element.x + element.width * clip.left,
    y: element.y + element.height * clip.top,
    width: element.width * (1 - clip.left - clip.right),
    height: element.height * (1 - clip.top - clip.bottom)
  }
}
