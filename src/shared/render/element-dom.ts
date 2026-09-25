import type {
  CanvasDocument,
  CanvasElement,
  ConnectorElement,
  Rect,
  ShapeElement,
  TextStyle
} from '../canvas/element-types'
import { connectorHosts, connectorMidpoint } from '../canvas/connector-geometry'
import { connectorDrawing } from '../canvas/connector-markers'
import {
  connectorLabelCss,
  connectorPaths,
  rotationCss,
  shapeLabelCss,
  shapePaint,
  textCss,
  type SvgPaint
} from '../canvas/element-style'
import { connectorCanvasRect, shapeGeometry } from '../canvas/shape-svg'
import { textClipPath } from '../canvas/text-clip'

/**
 * Static DOM for one element, without React: the HTML export player and PDF export draw with it.
 * Styling comes from `element-style.ts`, as the editor canvas's does; `element.css` holds the
 * few class rules these nodes need.
 */

type Css = { [K in keyof CSSStyleDeclaration]?: CSSStyleDeclaration[K] | undefined }

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  style: Css = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  applyCss(node, style)
  return node
}

function applyCss(node: HTMLElement, style: Css): void {
  const target = node.style as unknown as Record<string, unknown>
  for (const [name, value] of Object.entries(style)) {
    if (value !== undefined) {
      target[name] = value
    }
  }
}

function place(node: HTMLElement, rect: Rect): void {
  applyCss(node, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  })
}

function textNode(className: string, text: string, style: TextStyle, box: Css = {}): HTMLElement {
  const node = el('div', className, { ...box, ...textCss(style) })
  node.textContent = text
  return node
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

/** `strokeWidth` → `stroke-width`: paint is spelled for React, attributes for the DOM. */
function paintAttributes(paint: SvgPaint & { d?: string }): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(paint)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([name, value]) => [name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value])
  )
}

function shapeSvg(element: ShapeElement): SVGElement {
  const { width, height } = element
  const { tag, ...geometry } = shapeGeometry(element)
  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}` })
  svg.append(svgEl(tag, { ...geometry, ...paintAttributes(shapePaint(element)) }))
  return svg
}

/** One element's static node; null for frames and for images whose asset is missing. */
export function renderElement(element: CanvasElement, doc: CanvasDocument): HTMLElement | null {
  const node = elementNode(element, doc)
  if (node && 'rotation' in element) {
    applyCss(node, rotationCss(element))
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
      const node = textNode('uc-el uc-text', element.text, element.textStyle)
      place(node, element)
      applyCss(node, {
        height: 'auto',
        minHeight: `${element.height}px`,
        clipPath: textClipPath(element.clip)
      })
      return node
    }
    case 'shape': {
      const node = el('div', 'uc-el uc-shape')
      place(node, element)
      node.append(shapeSvg(element))
      if (element.text !== '') {
        const wrap = el('div', 'uc-shape-label', shapeLabelCss(element))
        wrap.append(textNode('uc-text', element.text, element.textStyle))
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

function connectorNode(element: ConnectorElement, doc: CanvasDocument): HTMLElement {
  const hosts = connectorHosts(doc, element)
  const box = connectorCanvasRect(element)
  const node = el('div', 'uc-el uc-connector')
  place(node, box)
  const svg = svgEl('svg', {
    width: box.width,
    height: box.height,
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`
  })
  const { line, markers } = connectorPaths(element, connectorDrawing(element, hosts))
  for (const path of [line, ...markers]) {
    svg.append(svgEl('path', paintAttributes(path)))
  }
  node.append(svg)
  if (element.label !== '') {
    const mid = connectorMidpoint(element, hosts)
    node.append(
      textNode(
        'uc-text uc-connector-label',
        element.label,
        element.textStyle,
        connectorLabelCss(mid, box, element.textStyle.fontSize)
      )
    )
  }
  return node
}
