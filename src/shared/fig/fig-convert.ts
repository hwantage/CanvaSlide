import { createImageAsset } from '../canvas/document-assets'
import {
  defaultTextStyle,
  type CanvasElement,
  type ImageAsset,
  type Point,
  type Rect,
  type ShapeElement
} from '../canvas/element-types'
import { rectContainsRect, unionRects } from '../canvas/element-bounds'
import { clipFigText, figText } from './fig-text'
import {
  FIG_IDENTITY,
  figBounds,
  figChildren,
  figClips,
  figPages,
  figTreeBounds,
  figTurnedBox,
  multiplyFigMatrix,
  intersectFigClip
} from './fig-scene'
import { createFigSvgRenderer, figColor, figDataUrl, figImageMime } from './fig-svg'
import {
  emptyFigWarnings,
  figId,
  type FigFile,
  type FigMatrix,
  type FigNode,
  type FigWarnings
} from './fig-types'

export type FigImportOptions = {
  pages: string[]
  mode: 'editable' | 'appearance'
  origin: Point
  firstFrameOrder: number
  idPrefix: string
}
export type FigImportResult = {
  assets: ImageAsset[]
  elements: CanvasElement[]
  frameIds: string[]
  warnings: FigWarnings
  pages: number
}

function nativeShape(node: FigNode, matrix: FigMatrix, id: string): ShapeElement | null {
  const box = figTurnedBox(node, matrix)
  if (
    !box ||
    node.effects?.some((effect) => effect.visible !== false) ||
    node.mask ||
    node.isMask ||
    (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode))
  ) {
    return null
  }
  const fills = (node.fillPaints ?? []).filter((paint) => paint.visible !== false)
  const strokes = (node.strokePaints ?? []).filter((paint) => paint.visible !== false)
  if (
    fills.length > 1 ||
    strokes.length > 1 ||
    [...fills, ...strokes].some(
      (paint) =>
        paint.type !== 'SOLID' || !paint.color || (paint.blendMode && paint.blendMode !== 'NORMAL')
    )
  ) {
    return null
  }
  const fill = fills[0]
  const stroke = strokes[0]
  const color = fill?.color
    ? figColor(fill.color, (fill.opacity ?? 1) * (node.opacity ?? 1))
    : 'transparent'
  const base = { id, ...box }
  if (
    ['ROUNDED_RECTANGLE', 'RECTANGLE', 'ELLIPSE'].includes(node.type) &&
    ![
      node.rectangleTopLeftCornerRadius,
      node.rectangleTopRightCornerRadius,
      node.rectangleBottomLeftCornerRadius,
      node.rectangleBottomRightCornerRadius
    ].some((value) => value !== undefined) &&
    (!stroke || node.strokeAlign === 'CENTER')
  ) {
    const scale = Math.hypot(matrix.m00, matrix.m10)
    const strokeWidth = stroke ? (node.strokeWeight ?? 1) * scale : 0
    const cornerRadius = (node.cornerRadius ?? 0) * scale
    if (strokeWidth > 64 || cornerRadius > 512) {
      return null
    }
    return {
      ...base,
      type: 'shape',
      shape: node.type === 'ELLIPSE' ? 'ellipse' : 'rectangle',
      text: '',
      textStyle: { ...defaultTextStyle },
      style: {
        fill: color,
        stroke: stroke?.color
          ? figColor(stroke.color, (stroke.opacity ?? 1) * (node.opacity ?? 1))
          : 'none',
        strokeWidth,
        cornerRadius
      }
    }
  }
  return null
}

/** Preserve page-local positions, offset pages apart, and flatten only unsupported visual subtrees. */
export function convertFigFile(file: FigFile, options: FigImportOptions): FigImportResult {
  const warnings = emptyFigWarnings()
  const children = figChildren(file)
  const textSubtrees = new Map<string, boolean>()
  const hasText = (node: FigNode, depth = 0): boolean => {
    if (depth > 128) {
      throw new Error('FIG_LIMIT')
    }
    const key = figId(node.guid)
    if (!textSubtrees.has(key)) {
      textSubtrees.set(
        key,
        node.type === 'TEXT' || (children.get(key) ?? []).some((child) => hasText(child, depth + 1))
      )
    }
    return textSubtrees.get(key)!
  }
  const render = createFigSvgRenderer(file, children, warnings)
  const elements: CanvasElement[] = []
  const assets = new Map<string, ImageAsset>()
  const bitmapAssets = new Map<string, ImageAsset>()
  let assetBytes = 0
  const addAsset = (asset: ImageAsset) => {
    if (!assets.has(asset.id)) {
      assetBytes += asset.data.length
      if (assetBytes > 256 * 1024 * 1024) {
        throw new Error('FIG_LIMIT')
      }
      assets.set(asset.id, asset)
    }
  }
  const frameIds: string[] = []
  let serial = 0
  let frameOrder = options.firstFrameOrder
  let pageX = options.origin.x
  let pageCount = 0
  const id = () => `${options.idPrefix}-${serial++}`
  for (const page of figPages(file, children).filter((page) => options.pages.includes(page.id))) {
    const roots = (children.get(page.id) ?? []).filter(
      (node) => !['VARIABLE_SET', 'VARIABLE'].includes(node.type)
    )
    const bounds = unionRects(roots.map((node) => figTreeBounds(node, FIG_IDENTITY, children)))
    if (!bounds) {
      continue
    }
    if (
      Object.values(bounds).some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 100_000_000
      )
    ) {
      throw new Error('FIG_INVALID')
    }
    const offset = { x: pageX - bounds.x, y: options.origin.y - bounds.y }
    const place = (element: CanvasElement): CanvasElement => ({
      ...element,
      x: element.x + offset.x,
      y: element.y + offset.y
    })
    const pageId = id()
    elements.push(
      place({ id: pageId, type: 'frame', name: page.name, order: frameOrder++, ...bounds })
    )
    frameIds.push(pageId)
    pageCount += 1

    function addFrames(node: FigNode, parent: FigMatrix, depth = 0): void {
      if (depth > 128) {
        throw new Error('FIG_LIMIT')
      }
      const matrix = multiplyFigMatrix(parent, node.transform ?? FIG_IDENTITY)
      if (['FRAME', 'SYMBOL', 'INSTANCE'].includes(node.type) && !node.resizeToFit) {
        const frameId = id()
        elements.push(
          place({
            id: frameId,
            type: 'frame',
            name: node.name ?? page.name,
            order: frameOrder++,
            ...figBounds(node, matrix)
          })
        )
        return
      }
      for (const child of children.get(figId(node.guid)) ?? []) {
        addFrames(child, matrix, depth + 1)
      }
    }

    function addSvg(
      node: FigNode,
      parent: FigMatrix,
      rect: Rect,
      groupId?: string,
      ownOnly = false
    ): void {
      const svg = render(node, parent, rect, ownOnly)
      if (!svg) {
        return
      }
      const asset = createImageAsset(
        figDataUrl(new TextEncoder().encode(svg), 'image/svg+xml'),
        rect.width,
        rect.height
      )
      addAsset(asset)
      elements.push(
        place({
          id: id(),
          type: 'image',
          ...rect,
          assetId: asset.id,
          naturalWidth: rect.width,
          naturalHeight: rect.height,
          ...(groupId ? { groupId } : {})
        })
      )
    }

    function convert(
      node: FigNode,
      parent: FigMatrix,
      groupId?: string,
      depth = 0,
      clip?: Rect,
      opacity = 1
    ): void {
      if (depth > 128) {
        throw new Error('FIG_LIMIT')
      }
      const matrix = multiplyFigMatrix(parent, node.transform ?? FIG_IDENTITY)
      const nested = children.get(figId(node.guid)) ?? []
      node = { ...node, opacity: (node.opacity ?? 1) * opacity }
      if (options.mode === 'editable' && node.type === 'TEXT') {
        const text = clipFigText(figText(node, matrix, id(), warnings), clip, warnings)
        if (text) {
          elements.push(place({ ...text, ...(groupId ? { groupId } : {}) }))
        }
        return
      }
      const flattenGroup =
        options.mode === 'editable' &&
        (node.type === 'GROUP' || (node.type === 'FRAME' && node.resizeToFit)) &&
        !figClips(node) &&
        (node.opacity ?? 1) === 1 &&
        !node.fillPaints?.length &&
        !node.strokePaints?.length &&
        !node.effects?.length &&
        !nested.some((child) => child.mask || child.isMask) &&
        (!node.blendMode || node.blendMode === 'PASS_THROUGH' || node.blendMode === 'NORMAL')
      const separateText = options.mode === 'editable' && nested.length > 0 && hasText(node)
      if (flattenGroup || separateText) {
        const group = groupId ?? id()
        if (node.fillPaints?.length || node.strokePaints?.length || node.effects?.length) {
          const own = intersectFigClip(figTreeBounds(node, parent, new Map()), clip)
          if (own) {
            addSvg(node, parent, own, group, true)
          }
        }
        const contentClip = figClips(node) ? intersectFigClip(figBounds(node, matrix), clip) : clip
        if (contentClip === null) {
          return
        }
        if (figClips(node) && (node.cornerRadius || matrix.m01 || matrix.m10)) {
          warnings.mask += 1
        }
        if (
          (node.opacity ?? 1) < 1 ||
          (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode))
        ) {
          warnings.paint += 1
        }
        let maskClip: Rect | null | undefined = contentClip
        for (const child of nested) {
          if (child.mask || child.isMask) {
            maskClip = intersectFigClip(figTreeBounds(child, matrix, children), contentClip)
            warnings.mask += 1
          } else if (maskClip !== null) {
            convert(child, matrix, group, depth + 1, maskClip, node.opacity)
          }
        }
        return
      }
      const native =
        options.mode === 'editable' && nested.length === 0 ? nativeShape(node, matrix, id()) : null
      if (native && (!clip || rectContainsRect(clip, figTreeBounds(node, parent, children)))) {
        elements.push(place({ ...native, ...(groupId ? { groupId } : {}) }))
        return
      }
      const paints = (node.fillPaints ?? []).filter((paint) => paint.visible !== false)
      const paint = paints[0]
      const sourceWidth = paint?.originalImageWidth ?? 0
      const sourceHeight = paint?.originalImageHeight ?? 0
      const transform = paint?.transform ?? FIG_IDENTITY
      const wholeImage =
        paint?.imageScaleMode === 'FILL'
          ? Math.abs(sourceWidth / sourceHeight - (node.size?.x ?? 0) / (node.size?.y ?? 1)) <
            0.00001
          : paint?.imageScaleMode === 'STRETCH' &&
            Object.entries(FIG_IDENTITY).every(
              ([key, value]) => transform[key as keyof FigMatrix] === value
            )
      // Upright images may stretch unevenly; a turned one needs a rotation and even scale.
      const imageBox =
        matrix.m00 > 0 && matrix.m11 > 0 && matrix.m01 === 0 && matrix.m10 === 0
          ? figBounds(node, matrix)
          : figTurnedBox(node, matrix)
      if (
        nested.length === 0 &&
        ['RECTANGLE', 'ROUNDED_RECTANGLE'].includes(node.type) &&
        imageBox &&
        paints.length === 1 &&
        paint?.type === 'IMAGE' &&
        paint.image?.hash &&
        wholeImage &&
        (node.opacity ?? 1) === 1 &&
        (paint.opacity ?? 1) === 1 &&
        (!node.blendMode || ['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) &&
        (!paint.blendMode || paint.blendMode === 'NORMAL') &&
        !node.cornerRadius &&
        !node.strokePaints?.length &&
        !node.effects?.length &&
        !node.mask &&
        !node.isMask &&
        (!clip || rectContainsRect(clip, figBounds(node, matrix))) &&
        [
          node.rectangleTopLeftCornerRadius,
          node.rectangleTopRightCornerRadius,
          node.rectangleBottomLeftCornerRadius,
          node.rectangleBottomRightCornerRadius
        ].every((radius) => !radius)
      ) {
        const key = Array.from(paint.image.hash, (byte) => byte.toString(16).padStart(2, '0')).join(
          ''
        )
        let asset = bitmapAssets.get(key)
        if (!asset) {
          const bytes = file.images.get(key)
          const mime = bytes && figImageMime(bytes)
          if (bytes && mime && sourceWidth > 0 && sourceHeight > 0) {
            asset = createImageAsset(figDataUrl(bytes, mime), sourceWidth, sourceHeight)
            bitmapAssets.set(key, asset)
          }
        }
        if (asset) {
          addAsset(asset)
          elements.push(
            place({
              id: id(),
              type: 'image',
              ...imageBox,
              assetId: asset.id,
              naturalWidth: asset.width,
              naturalHeight: asset.height,
              ...(groupId ? { groupId } : {})
            })
          )
          return
        }
      }
      const rect = intersectFigClip(figTreeBounds(node, parent, children), clip)
      if (rect) {
        addSvg(node, parent, rect, groupId)
      }
    }
    for (const root of roots) {
      addFrames(root, FIG_IDENTITY)
    }
    // A page-level mask affects following siblings, so keep that page's visual stack together.
    if (roots.some((node) => node.mask || node.isMask)) {
      const wrapper: FigNode = {
        guid: { sessionID: -1, localID: serial++ },
        type: 'GROUP',
        size: { x: 0, y: 0 }
      }
      children.set(figId(wrapper.guid), roots)
      convert(wrapper, FIG_IDENTITY)
    } else {
      for (const root of roots) {
        convert(root, FIG_IDENTITY)
      }
    }
    pageX += bounds.width + 400
  }
  if (pageCount === 0) {
    throw new Error('FIG_EMPTY')
  }
  return { assets: [...assets.values()], elements, frameIds, warnings, pages: pageCount }
}
