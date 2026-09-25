import { rectContainsRect } from '../canvas/element-bounds'
import { rotatedBounds } from '../canvas/element-rotation'
import type { Rect, TextElement } from '../canvas/element-types'
import { figBounds, figTurnedBox, intersectFigClip } from './fig-scene'
import { figColor } from './fig-svg'
import type { FigMatrix, FigNode, FigWarnings } from './fig-types'

/** Text stays editable even when a source style needs approximation. */
export function figText(
  node: FigNode,
  matrix: FigMatrix,
  id: string,
  warnings: FigWarnings
): TextElement {
  const firstStyle = node.textData?.characterStyleIDs?.[0]
  const override = firstStyle
    ? (node.textData?.styleOverrideTable?.find((style) => style.styleID === firstStyle) ??
      node.textStyleTable?.find((style) => style.styleID === firstStyle))
    : undefined
  const source = { ...node, ...override }
  const fills = (source.fillPaints ?? []).filter((paint) => paint.visible !== false)
  const fill = fills.find((paint) => paint.type === 'SOLID' && paint.color)
  const baseSize = source.fontSize ?? 16
  const scaledSize = baseSize * Math.hypot(matrix.m00, matrix.m10)
  const fontSize = Math.max(4, Math.min(1024, scaledSize))
  const fontStyle = source.fontName?.style ?? ''
  const lineHeight = source.lineHeight
  // Rotation carries over; skews and mirrors fall back to the upright bounds.
  const turned = figTurnedBox(node, matrix)
  const ratio = !lineHeight
    ? 1.4
    : lineHeight.units === 'PIXELS'
      ? lineHeight.value / baseSize
      : lineHeight.units === 'PERCENT'
        ? lineHeight.value / 100
        : lineHeight.value
  if (
    node.textData?.characterStyleIDs?.some((value) => value !== 0) ||
    node.strokePaints?.some((paint) => paint.visible !== false) ||
    fills.some((paint) => paint.type !== 'SOLID') ||
    fills.length > 1 ||
    !turned ||
    fontSize !== scaledSize ||
    source.textAlignHorizontal === 'JUSTIFIED'
  ) {
    warnings.text += 1
  }
  if (node.effects?.some((effect) => effect.visible !== false)) {
    warnings.effects += 1
  }
  if (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) {
    warnings.paint += 1
  }
  return {
    id,
    type: 'text',
    ...(turned ?? figBounds(node, matrix)),
    text: node.textData?.characters ?? '',
    textStyle: {
      color: fill?.color
        ? figColor(fill.color, (fill.opacity ?? 1) * (node.opacity ?? 1))
        : fills.length > 0
          ? '#000000'
          : 'transparent',
      fontSize,
      fontFamily: source.fontName?.family,
      bold: /bold|black|heavy/i.test(fontStyle),
      italic: /italic|oblique/i.test(fontStyle),
      lineHeight: Math.max(0.1, Math.min(10, ratio)),
      align:
        source.textAlignHorizontal === 'CENTER'
          ? 'center'
          : source.textAlignHorizontal === 'RIGHT'
            ? 'right'
            : 'left'
    }
  }
}

/** Insets can't cut a turned box square, so turned text its frame cuts stands upright instead. */
export function clipFigText(
  source: TextElement,
  clip?: Rect,
  warnings?: FigWarnings
): TextElement | null {
  let element = source
  if (source.rotation && clip) {
    const bounds = rotatedBounds(source)
    if (rectContainsRect(clip, bounds)) {
      return source
    }
    const { rotation: _rotation, ...upright } = source
    element = { ...upright, ...bounds }
  }
  const visible = intersectFigClip(element, clip)
  if (!visible) {
    return null
  }
  if (element !== source && warnings) {
    warnings.text += 1
  }
  if (visible.width === element.width && visible.height === element.height) {
    return element
  }
  return {
    ...element,
    clip: {
      top: (visible.y - element.y) / element.height,
      left: (visible.x - element.x) / element.width,
      bottom: Math.max(
        0,
        (element.y + element.height - visible.y - visible.height) / element.height
      ),
      right: Math.max(0, (element.x + element.width - visible.x - visible.width) / element.width)
    }
  }
}
