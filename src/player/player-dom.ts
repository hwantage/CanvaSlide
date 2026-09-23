import type {
  CanvasDocument,
  CanvasElement,
  FrameElement,
  Rect,
  ShapeElement,
  TextStyle
} from '@shared/canvas/element-types'
import { connectorHosts, connectorMidpoint } from '@shared/canvas/connector-geometry'
import { connectorDrawing } from '@shared/canvas/connector-markers'
import { rotationTransform } from '@shared/canvas/element-rotation'
import { overviewStackRanks, overviewZIndex } from '@shared/canvas/overview-stacking'
import {
  connectorCanvasRect,
  connectorDashArray,
  shapeGeometry,
  shapeLabelRect
} from '@shared/canvas/shape-svg'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { fontStackFor } from '@shared/canvas/font-family'
import { textClipPath } from '@shared/canvas/text-clip'

/** Static DOM for a document; mirrors the app's renderer without React. */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  style: Partial<CSSStyleDeclaration> = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  Object.assign(node.style, style)
  return node
}

function place(node: HTMLElement, rect: Rect): void {
  node.style.left = `${rect.x}px`
  node.style.top = `${rect.y}px`
  node.style.width = `${rect.width}px`
  node.style.height = `${rect.height}px`
}

function applyTextStyle(node: HTMLElement, style: TextStyle): void {
  node.style.color = style.color
  node.style.fontSize = `${style.fontSize}px`
  node.style.textAlign = style.align
  node.style.fontWeight = style.bold ? '700' : '400'
  node.style.fontStyle = style.italic ? 'italic' : ''
  node.style.lineHeight = String(style.lineHeight ?? 1.4)
  node.style.fontFamily = fontStackFor(style.fontFamily) ?? ''
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** SVG element with every attribute set from `attributes`; numbers are written as-is. */
function svgEl(tag: string, attributes: Record<string, string | number | undefined>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      node.setAttribute(name, String(value))
    }
  }
  return node
}

function shapeSvg(element: ShapeElement): SVGElement {
  const { width, height, style } = element
  const { tag, ...geometry } = shapeGeometry(element)
  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}` })
  svg.append(
    svgEl(tag, {
      ...geometry,
      ...(tag === 'polygon' ? { 'stroke-linejoin': 'round' } : {}),
      fill: style.fill,
      stroke: style.stroke,
      'stroke-width': style.strokeWidth
    })
  )
  return svg
}

/** One element's static node. The PDF export reuses this so both renderers stay in step. */
export function renderElement(element: CanvasElement, doc: CanvasDocument): HTMLElement | null {
  const node = elementNode(element, doc)
  const turn = 'rotation' in element ? rotationTransform(element.rotation) : undefined
  if (node && turn) {
    // Why: text can render taller than its stored box; turn about the box centre geometry uses.
    node.style.transformOrigin = `${element.width / 2}px ${element.height / 2}px`
    node.style.transform = turn
  }
  return node
}

function elementNode(element: CanvasElement, doc: CanvasDocument): HTMLElement | null {
  switch (element.type) {
    case 'video': {
      const node = el('div', 'uc-el')
      node.dataset.videoId = element.id
      place(node, element)
      return node
    }
    case 'text': {
      const node = el('div', 'uc-el uc-text')
      place(node, element)
      node.style.height = 'auto'
      node.style.minHeight = `${element.height}px`
      node.style.clipPath = textClipPath(element.clip) ?? ''
      applyTextStyle(node, element.textStyle)
      node.textContent = element.text
      return node
    }
    case 'shape': {
      const node = el('div', 'uc-el uc-shape')
      place(node, element)
      node.append(shapeSvg(element))
      if (element.text !== '') {
        const wrap = el('div', 'uc-shape-label')
        place(wrap, shapeLabelRect(element))
        const label = el('div', 'uc-text')
        applyTextStyle(label, element.textStyle)
        label.textContent = element.text
        wrap.append(label)
        node.append(wrap)
      }
      return node
    }
    case 'image': {
      const asset = doc.assets[element.assetId]
      if (!asset) {
        return null
      }
      const node = el('img', 'uc-img')
      node.src = asset.data
      node.alt = ''
      node.draggable = false
      place(node, element)
      return node
    }
    case 'frame':
      return null
    case 'connector':
      return connectorNode(element, doc)
  }
}

function connectorNode(
  element: Extract<CanvasElement, { type: 'connector' }>,
  doc: CanvasDocument
): HTMLElement {
  const hosts = connectorHosts(doc, element)
  const box = connectorCanvasRect(element)
  const node = el('div', 'uc-el uc-connector')
  place(node, box)
  const svg = svgEl('svg', {
    width: box.width,
    height: box.height,
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`
  })
  svg.style.overflow = 'visible'
  const { stroke, strokeWidth } = element.style
  const drawing = connectorDrawing(element, hosts)
  const path = svgEl('path', {
    d: drawing.d,
    fill: 'none',
    stroke,
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': connectorDashArray(element)
  })
  svg.append(path)
  for (const marker of drawing.markers) {
    svg.append(
      svgEl('path', {
        d: marker.d,
        fill: marker.filled ? stroke : 'none',
        stroke: marker.filled ? undefined : stroke,
        'stroke-width': marker.filled ? undefined : strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
    )
  }
  node.append(svg)
  if (element.label !== '') {
    const mid = connectorMidpoint(element, hosts)
    const label = el('div', 'uc-text uc-connector-label')
    label.style.left = `${mid.x - box.x}px`
    label.style.top = `${mid.y - box.y}px`
    applyTextStyle(label, element.textStyle)
    label.textContent = element.label
    node.append(label)
  }
  return node
}

export type FrameNode = { frame: FrameElement; node: HTMLElement; index: number }

export function renderDocument(
  doc: CanvasDocument,
  zoomLayer: HTMLElement
): { frameNodes: FrameNode[] } {
  const frameNodes: FrameNode[] = []
  const frames = orderedFrames(doc)
  const ranks = overviewStackRanks(frames)
  frames.forEach((frame, index) => {
    const node = el('div', 'uc-frame')
    place(node, frame)
    // Why: a frame that covers others would otherwise swallow their clicks in overview.
    node.style.zIndex = String(overviewZIndex(ranks[frame.id] ?? 0, frames.length))
    node.dataset.frameIndex = String(index)
    const label = el('div', 'uc-frame-label')
    const badge = document.createElement('b')
    badge.textContent = String(index + 1)
    const name = document.createElement('span')
    name.textContent = frame.name
    label.append(badge, name)
    node.append(label)
    zoomLayer.append(node)
    frameNodes.push({ frame, node, index })
  })
  for (const id of doc.order) {
    const element = doc.elements[id]
    if (!element || element.type === 'frame') {
      continue
    }
    const node = renderElement(element, doc)
    if (node) {
      zoomLayer.append(node)
    }
  }
  return { frameNodes }
}
