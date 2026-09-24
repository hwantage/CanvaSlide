import type { Rect } from './element-types'
import { FIG_IDENTITY, figClips, figPath, multiplyFigMatrix } from './fig-scene'
import {
  figId,
  type FigColor,
  type FigFile,
  type FigGeometry,
  type FigMatrix,
  type FigNode,
  type FigPaint,
  type FigWarnings
} from './fig-types'
import { rasterImageMime } from './image-signature'

export function figXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function figColor(color: FigColor, opacity = 1): string {
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255)
  return `rgba(${channel(color.r)},${channel(color.g)},${channel(color.b)},${Math.max(0, Math.min(1, (color.a ?? 1) * opacity))})`
}

function figMatrixAttribute(m: FigMatrix): string {
  return `matrix(${m.m00} ${m.m10} ${m.m01} ${m.m11} ${m.m02} ${m.m12})`
}

export function figDataUrl(bytes: Uint8Array, mime: string): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  }
  return `data:${mime};base64,${btoa(chunks.join(''))}`
}

const figImageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function figImageMime(bytes: Uint8Array): string | null {
  const mime = rasterImageMime(bytes)
  return mime && figImageTypes.has(mime) ? mime : null
}

export function createFigSvgRenderer(
  file: FigFile,
  children: Map<string, FigNode[]>,
  warnings: FigWarnings
) {
  const paths = new Map<number, string>()
  const images = new Map<string, string>()
  let definitions: string[] = []
  let glyphIds = new Map<number, string>()
  let serial = 0
  const fresh = () => `f${serial++}`
  const path = (index: number): string => {
    if (!paths.has(index)) {
      const bytes = file.blobs[index]?.bytes
      paths.set(index, bytes ? figPath(bytes) : '')
      if (!bytes) {
        warnings.unsupported += 1
      }
    }
    return paths.get(index)!
  }
  const geometry = (entries: FigGeometry[]): string =>
    entries
      .map(
        (entry) =>
          `<path d="${path(entry.commandsBlob)}" fill-rule="${entry.windingRule === 'ODD' ? 'evenodd' : 'nonzero'}"/>`
      )
      .join('')

  function silhouette(node: FigNode): string {
    const width = node.size?.x ?? 0
    const height = node.size?.y ?? 0
    if (node.fillGeometry?.length) {
      return geometry(node.fillGeometry)
    }
    if (node.type === 'ELLIPSE') {
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}"/>`
    }
    if (node.type === 'LINE') {
      return `<path d="M0 0 L${width} ${height}"/>`
    }
    if (
      ['ROUNDED_RECTANGLE', 'RECTANGLE', 'FRAME', 'SECTION', 'SYMBOL', 'INSTANCE'].includes(
        node.type
      )
    ) {
      return `<rect width="${width}" height="${height}" rx="${Math.min(node.cornerRadius ?? 0, width / 2, height / 2)}"/>`
    }
    return ''
  }

  function paintContent(paint: FigPaint, shape: string, node: FigNode): string {
    if (paint.visible === false || !shape) {
      return ''
    }
    const opacity = paint.opacity ?? 1
    if (paint.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(paint.blendMode)) {
      warnings.paint += 1
    }
    if (paint.type === 'SOLID' && paint.color) {
      return `<g fill="${figColor(paint.color, opacity)}">${shape}</g>`
    }
    const width = node.size?.x ?? 1
    const height = node.size?.y ?? 1
    if (paint.type === 'IMAGE') {
      const hash = paint.image?.hash
      const key = hash
        ? Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
        : ''
      if (!images.has(key)) {
        const bytes = file.images.get(key)
        const mime = bytes && figImageMime(bytes)
        if (!bytes || !mime) {
          warnings.missingImage += 1
          return ''
        }
        images.set(key, figDataUrl(bytes, mime))
      }
      const clip = fresh()
      definitions.push(`<clipPath id="${clip}">${shape}</clipPath>`)
      let image: string
      if (paint.imageScaleMode === 'STRETCH' || paint.imageScaleMode === 'CROP') {
        const m = paint.transform ?? FIG_IDENTITY
        const det = m.m00 * m.m11 - m.m01 * m.m10
        if (Math.abs(det) < 1e-9) {
          warnings.paint += 1
          return ''
        }
        const inverse = {
          m00: (width * m.m11) / det,
          m01: (-width * m.m01) / det,
          m02: (width * (m.m01 * m.m12 - m.m11 * m.m02)) / det,
          m10: (-height * m.m10) / det,
          m11: (height * m.m00) / det,
          m12: (height * (m.m10 * m.m02 - m.m00 * m.m12)) / det
        }
        image = `<image width="1" height="1" preserveAspectRatio="none" transform="${figMatrixAttribute(inverse)}" href="${images.get(key)}"/>`
      } else {
        if (paint.imageScaleMode && !['FILL', 'FIT'].includes(paint.imageScaleMode)) {
          warnings.paint += 1
        }
        image = `<image width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${paint.imageScaleMode === 'FIT' ? 'meet' : 'slice'}" href="${images.get(key)}"/>`
      }
      return `<g clip-path="url(#${clip})" opacity="${opacity}">${image}</g>`
    }
    if (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL') {
      const id = fresh()
      const m = paint.transform ?? FIG_IDENTITY
      const stops = (paint.stops ?? [])
        .map(
          (stop) =>
            `<stop offset="${stop.position}" stop-color="${figColor(stop.color, opacity)}"/>`
        )
        .join('')
      const transform = figMatrixAttribute({
        ...m,
        m00: m.m00 * width,
        m01: m.m01 * width,
        m02: m.m02 * width,
        m10: m.m10 * height,
        m11: m.m11 * height,
        m12: m.m12 * height
      })
      const tag = paint.type === 'GRADIENT_LINEAR' ? 'linearGradient' : 'radialGradient'
      definitions.push(
        `<${tag} id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="${transform}">${stops}</${tag}>`
      )
      warnings.paint += 1
      return `<g fill="url(#${id})">${shape}</g>`
    }
    warnings.paint += 1
    return ''
  }

  function textShape(node: FigNode): string {
    const glyphs = node.derivedTextData?.glyphs
    if (glyphs?.length) {
      const styles = new Map<number, Partial<FigNode>>()
      for (const style of [
        ...(node.textStyleTable ?? []),
        ...(node.textData?.styleOverrideTable ?? [])
      ]) {
        if (style.styleID !== undefined) {
          styles.set(style.styleID, style)
        }
      }
      return glyphs
        .map((glyph) => {
          let id = glyphIds.get(glyph.commandsBlob)
          if (!id) {
            id = fresh()
            glyphIds.set(glyph.commandsBlob, id)
            definitions.push(`<path id="${id}" d="${path(glyph.commandsBlob)}"/>`)
          }
          const shape = `<use href="#${id}" transform="translate(${glyph.position.x} ${glyph.position.y}) rotate(${glyph.rotation ?? 0}) scale(${glyph.fontSize} ${-glyph.fontSize})"/>`
          const styleId = node.textData?.characterStyleIDs?.[glyph.firstCharacter ?? 0] ?? 0
          const fills = styles.get(styleId)?.fillPaints
          return fills ? fills.map((paint) => paintContent(paint, shape, node)).join('') : shape
        })
        .join('')
    }
    warnings.text += 1
    const size = node.fontSize ?? 16
    return (node.textData?.characters ?? '')
      .split('\n')
      .map(
        (line, index) =>
          `<text x="0" y="${size * (1 + index * 1.2)}" font-size="${size}" font-family="${figXml(node.fontName?.family ?? 'sans-serif')}">${figXml(line)}</text>`
      )
      .join('')
  }

  function render(node: FigNode, depth = 0, ownOnly = false): string {
    if (depth > 128) {
      throw new Error('FIG_LIMIT')
    }
    if (node.effects?.some((effect) => effect.visible !== false)) {
      warnings.effects += 1
    }
    if (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) {
      warnings.paint += 1
    }
    let shape = node.type === 'TEXT' ? textShape(node) : silhouette(node)
    let body = (node.fillPaints ?? []).map((paint) => paintContent(paint, shape, node)).join('')
    if (node.strokeGeometry?.length) {
      const stroke = geometry(node.strokeGeometry)
      body += (node.strokePaints ?? []).map((paint) => paintContent(paint, stroke, node)).join('')
    } else {
      for (const paint of node.strokePaints ?? []) {
        if (paint.visible === false) {
          continue
        }
        if (paint.type !== 'SOLID' || !paint.color) {
          warnings.paint += 1
          continue
        }
        body += `<g fill="none" stroke="${figColor(paint.color, paint.opacity)}" stroke-width="${node.strokeWeight ?? 1}">${shape}</g>`
      }
    }
    if (!shape && !node.strokeGeometry?.length && node.type !== 'GROUP') {
      warnings.unsupported += 1
    }
    if (node.type === 'INSTANCE' && !children.get(figId(node.guid))?.length) {
      warnings.unsupported += 1
    }
    const siblings =
      ownOnly || (node.type === 'BOOLEAN_OPERATION' && node.fillGeometry?.length)
        ? []
        : (children.get(figId(node.guid)) ?? [])
    let contents = ''
    let maskOpen = false
    for (const child of siblings) {
      if (child.mask || child.isMask) {
        if (maskOpen) {
          contents += '</g>'
        }
        const id = fresh()
        definitions.push(
          `<mask id="${id}" maskUnits="userSpaceOnUse" x="-1000000" y="-1000000" width="2000000" height="2000000" style="mask-type:alpha">${render(child, depth + 1)}</mask>`
        )
        contents += `<g mask="url(#${id})">`
        maskOpen = true
      } else {
        contents += render(child, depth + 1)
      }
    }
    if (maskOpen) {
      contents += '</g>'
    }
    if (figClips(node) && contents) {
      const id = fresh()
      shape = silhouette(node)
      definitions.push(`<clipPath id="${id}">${shape}</clipPath>`)
      contents = `<g clip-path="url(#${id})">${contents}</g>`
    }
    return body || contents
      ? `<g transform="${figMatrixAttribute(node.transform ?? FIG_IDENTITY)}" opacity="${node.opacity ?? 1}">${body}${contents}</g>`
      : ''
  }

  return (node: FigNode, parent: FigMatrix, bounds: Rect, ownOnly = false): string => {
    definitions = []
    glyphIds = new Map()
    serial = 0
    const transform = multiplyFigMatrix(parent, node.transform ?? FIG_IDENTITY)
    transform.m02 -= bounds.x
    transform.m12 -= bounds.y
    const body = render({ ...node, transform }, 0, ownOnly)
    if (!body) {
      return ''
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><defs>${definitions.join('')}</defs>${body}</svg>`
  }
}
