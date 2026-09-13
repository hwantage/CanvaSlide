import type {
  CanvasDocument,
  CanvasElement,
  FrameElement,
  ShapeElement,
  TextStyle
} from '@shared/canvas/element-types'
import {
  arrowHeadSize,
  connectorMidpoint,
  connectorObstacles,
  connectorPath
} from '@shared/canvas/connector-geometry'
import { orderedFrames } from '@shared/canvas/presentation-sequence'

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

function place(node: HTMLElement, element: CanvasElement): void {
  node.style.left = `${element.x}px`
  node.style.top = `${element.y}px`
  node.style.width = `${element.width}px`
  node.style.height = `${element.height}px`
}

function applyTextStyle(node: HTMLElement, style: TextStyle): void {
  node.style.color = style.color
  node.style.fontSize = `${style.fontSize}px`
  node.style.textAlign = style.align
  node.style.fontWeight = style.bold ? '700' : '400'
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function shapeSvg(element: ShapeElement): SVGSVGElement {
  const { width: w, height: h, style } = element
  const inset = style.strokeWidth / 2
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  let path: SVGElement
  switch (element.shape) {
    case 'rectangle':
      path = document.createElementNS(SVG_NS, 'rect')
      path.setAttribute('x', String(inset))
      path.setAttribute('y', String(inset))
      path.setAttribute('width', String(Math.max(0, w - inset * 2)))
      path.setAttribute('height', String(Math.max(0, h - inset * 2)))
      path.setAttribute('rx', String(style.cornerRadius))
      break
    case 'ellipse':
      path = document.createElementNS(SVG_NS, 'ellipse')
      path.setAttribute('cx', String(w / 2))
      path.setAttribute('cy', String(h / 2))
      path.setAttribute('rx', String(w / 2 - inset))
      path.setAttribute('ry', String(h / 2 - inset))
      break
    case 'diamond':
      path = document.createElementNS(SVG_NS, 'polygon')
      path.setAttribute(
        'points',
        `${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`
      )
      path.setAttribute('stroke-linejoin', 'round')
      break
  }
  path.setAttribute('fill', style.fill)
  path.setAttribute('stroke', style.stroke)
  path.setAttribute('stroke-width', String(style.strokeWidth))
  svg.append(path)
  return svg
}

function renderElement(element: CanvasElement, doc: CanvasDocument): HTMLElement | null {
  switch (element.type) {
    case 'text': {
      const node = el('div', 'uc-el uc-text')
      place(node, element)
      node.style.height = 'auto'
      node.style.minHeight = `${element.height}px`
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

const CONNECTOR_PAD = 24

function connectorNode(
  element: Extract<CanvasElement, { type: 'connector' }>,
  doc: CanvasDocument
): HTMLElement {
  const obstacles = connectorObstacles(doc, element)
  const node = el('div', 'uc-el uc-connector')
  const w = element.width + CONNECTOR_PAD * 2
  const h = element.height + CONNECTOR_PAD * 2
  node.style.left = `${element.x - CONNECTOR_PAD}px`
  node.style.top = `${element.y - CONNECTOR_PAD}px`
  node.style.width = `${w}px`
  node.style.height = `${h}px`
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `${element.x - CONNECTOR_PAD} ${element.y - CONNECTOR_PAD} ${w} ${h}`)
  svg.style.overflow = 'visible'
  const markerId = `uc-p-arrow-${element.id}`
  const defs = document.createElementNS(SVG_NS, 'defs')
  const marker = document.createElementNS(SVG_NS, 'marker')
  marker.setAttribute('id', markerId)
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '9')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerUnits', 'userSpaceOnUse')
  marker.setAttribute('markerWidth', String(arrowHeadSize(element.style.strokeWidth)))
  marker.setAttribute('markerHeight', String(arrowHeadSize(element.style.strokeWidth)))
  marker.setAttribute('orient', 'auto-start-reverse')
  const head = document.createElementNS(SVG_NS, 'path')
  head.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
  head.setAttribute('fill', element.style.stroke)
  marker.append(head)
  defs.append(marker)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', connectorPath(element, obstacles).d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', element.style.stroke)
  path.setAttribute('stroke-width', String(element.style.strokeWidth))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  if (element.style.dashed) {
    path.setAttribute(
      'stroke-dasharray',
      `${element.style.strokeWidth * 3} ${element.style.strokeWidth * 2}`
    )
  }
  if (element.startHead === 'arrow') {
    path.setAttribute('marker-start', `url(#${markerId})`)
  }
  if (element.endHead === 'arrow') {
    path.setAttribute('marker-end', `url(#${markerId})`)
  }
  svg.append(defs, path)
  node.append(svg)
  if (element.label !== '') {
    const mid = connectorMidpoint(element, obstacles)
    const label = el('div', 'uc-text uc-connector-label')
    label.style.left = `${mid.x - (element.x - CONNECTOR_PAD)}px`
    label.style.top = `${mid.y - (element.y - CONNECTOR_PAD)}px`
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
  orderedFrames(doc).forEach((frame, index) => {
    const node = el('div', 'uc-frame')
    place(node, frame)
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
