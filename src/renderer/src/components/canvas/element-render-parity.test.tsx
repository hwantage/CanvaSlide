import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { insertElement } from '@shared/canvas/document-mutations'
import {
  createEmptyDocument,
  defaultConnectorStyle,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type ConnectorElement as ConnectorModel,
  type ImageElement as ImageModel,
  type ShapeElement as ShapeModel,
  type TextElement as TextModel
} from '@shared/canvas/element-types'
import { renderElement } from '@shared/render/element-dom'
import { useDocumentStore } from '@/store/document-store'
import { ConnectorElement } from './connector-element'
import { ImageElement } from './image-element'
import { ShapeElement } from './shape-element'
import { TextElement } from './text-element'

/** The editor canvas and the static renderer behind HTML and PDF export draw an element alike. */

const TEXT_PROPERTIES = [
  'color',
  'font-size',
  'line-height',
  'text-align',
  'font-weight',
  'font-style',
  'font-family',
  'white-space',
  'overflow-wrap'
]
const TURN_PROPERTIES = ['transform', 'transform-origin']
const PLACE_PROPERTIES = ['left', 'top', 'width']
const SHAPE_LABEL_PROPERTIES = [
  'position',
  'left',
  'top',
  'width',
  'height',
  'box-sizing',
  'display',
  'flex-direction',
  'justify-content',
  'padding'
]
const LABEL_BOX_PROPERTIES = [
  'position',
  'left',
  'top',
  'transform',
  'box-sizing',
  'width',
  'min-width',
  'max-width',
  'padding',
  'border-radius',
  'background'
]
const textStyle = {
  ...defaultTextStyle,
  color: '#c026d3',
  fontSize: 18,
  lineHeight: 1.6,
  align: 'center' as const,
  bold: true,
  italic: true,
  fontFamily: 'serif'
}

function css(node: Element | null | undefined, properties: string[]): Record<string, string> {
  const style = (node as HTMLElement | null)?.style
  return Object.fromEntries(properties.map((name) => [name, style?.getPropertyValue(name) ?? '']))
}

/** Guards against a comparison of two empty styles, which would prove nothing. */
function filled(values: Record<string, string>): Record<string, string> {
  expect(Object.entries(values).filter(([, value]) => value === '')).toEqual([])
  return values
}

/** Every SVG node under `root` with its attributes; classes and test hooks are host details. */
function svgTree(root: Element | null | undefined): { tag: string; attributes: object }[] {
  const svg = root?.querySelector(':scope > svg')
  return [svg, ...(svg?.querySelectorAll('*') ?? [])].map((node) => ({
    tag: node?.tagName ?? 'missing',
    attributes: Object.fromEntries(
      [...(node?.attributes ?? [])]
        .filter(({ name }) => name !== 'class' && !name.startsWith('data-'))
        .map(({ name, value }) => [name, value])
    )
  }))
}

function load(...elements: CanvasElement[]): CanvasDocument {
  const doc = elements.reduce(insertElement, createEmptyDocument())
  useDocumentStore.getState().loadDocument(doc, null)
  return doc
}

function staticNode(element: CanvasElement, doc: CanvasDocument): HTMLElement {
  const node = renderElement(element, doc)
  if (!node) {
    throw new Error(`${element.type} rendered nothing`)
  }
  return node
}

afterEach(cleanup)

describe('element rendering parity', () => {
  it('draws turned text with the same style, turn and clip', () => {
    const text: TextModel = {
      id: 'text',
      type: 'text',
      x: 40,
      y: 60,
      width: 220,
      height: 90,
      text: 'Two\nlines',
      textStyle,
      rotation: 20,
      clip: { top: 0.04, right: 0, bottom: 0.1, left: 0.06 }
    }
    const doc = load(text)
    const editor = render(<TextElement element={text} editing={false} />).container
    const box = editor.querySelector('[data-element-type="text"]')
    const exported = staticNode(text, doc)
    expect(filled(css(exported, TEXT_PROPERTIES))).toEqual(
      css(box?.firstElementChild, TEXT_PROPERTIES)
    )
    const boxProperties = [...PLACE_PROPERTIES, ...TURN_PROPERTIES, 'clip-path', 'min-height']
    expect(filled(css(exported, boxProperties))).toEqual(css(box, boxProperties))
  })

  it.each(['rectangle', 'ellipse', 'diamond', 'triangle'] as const)(
    'paints a turned %s and its label the same way',
    (kind) => {
      const shape: ShapeModel = {
        id: 'shape',
        type: 'shape',
        shape: kind,
        x: 30,
        y: 40,
        width: 180,
        height: 120,
        style: { ...defaultShapeStyle, strokeWidth: 9, cornerRadius: 12 },
        text: 'Label',
        textStyle,
        rotation: -45
      }
      const doc = load(shape)
      const editor = render(<ShapeElement element={shape} editing={false} />).container
      const box = editor.querySelector('[data-element-type="shape"]')
      const exported = staticNode(shape, doc)
      const tree = svgTree(exported)
      expect(tree.map(({ tag }) => tag)).toEqual([
        'svg',
        kind === 'rectangle' ? 'rect' : kind === 'ellipse' ? 'ellipse' : 'polygon'
      ])
      expect(tree).toEqual(svgTree(box))
      const boxProperties = [...PLACE_PROPERTIES, 'height', ...TURN_PROPERTIES]
      expect(filled(css(exported, boxProperties))).toEqual(css(box, boxProperties))
      expect(filled(css(exported.lastElementChild, SHAPE_LABEL_PROPERTIES))).toEqual(
        css(box?.lastElementChild, SHAPE_LABEL_PROPERTIES)
      )
      const label = (root: Element | null | undefined) => root?.querySelector(':scope > div > div')
      expect(filled(css(label(exported), TEXT_PROPERTIES))).toEqual(
        css(label(box), TEXT_PROPERTIES)
      )
    }
  )

  it('draws a dashed connector, its markers and its label box the same way', () => {
    const connector: ConnectorModel = {
      id: 'connector',
      type: 'connector',
      x: 100,
      y: 50,
      width: 1,
      height: 240,
      start: { x: 100, y: 50 },
      end: { x: 100, y: 290 },
      route: 'straight',
      startHead: 'openArrow',
      endHead: 'arrow',
      style: { ...defaultConnectorStyle, strokeWidth: 4, dashed: true },
      label: 'First line\nsecond line',
      textStyle
    }
    const doc = load(connector)
    const editor = render(<ConnectorElement element={connector} editing={false} />).container
    const box = editor.querySelector('[data-element-type="connector"]')
    const exported = staticNode(connector, doc)
    const tree = svgTree(exported)
    expect(tree.map(({ tag }) => tag)).toEqual(['svg', 'path', 'path', 'path'])
    expect(tree).toEqual(svgTree(box))
    const boxProperties = [...PLACE_PROPERTIES, 'height']
    expect(filled(css(exported, boxProperties))).toEqual(css(box, boxProperties))
    const exportedLabel = exported.querySelector('.uc-connector-label')
    const editorLabel = box?.querySelector(':scope > div')
    expect(filled(css(exportedLabel, LABEL_BOX_PROPERTIES))).toEqual(
      css(editorLabel, LABEL_BOX_PROPERTIES)
    )
    expect(filled(css(exportedLabel, TEXT_PROPERTIES))).toEqual(
      css(editorLabel?.firstElementChild, TEXT_PROPERTIES)
    )
    expect(css(exportedLabel, ['white-space', 'width'])).toEqual({
      'white-space': 'pre-wrap',
      width: 'max-content'
    })
  })

  it('turns an image about the same centre', () => {
    const image: ImageModel = {
      id: 'image',
      type: 'image',
      x: 5,
      y: 6,
      width: 70,
      height: 80,
      assetId: 'asset',
      naturalWidth: 7,
      naturalHeight: 8,
      rotation: 90
    }
    const data = 'data:image/png;base64,AA=='
    const doc = {
      ...load(image),
      assets: { asset: { id: 'asset', mime: 'image/png', data, width: 7, height: 8 } }
    }
    useDocumentStore.getState().loadDocument(doc, null)
    const editor = render(<ImageElement element={image} selected={false} layoutScale={1} />)
    const wrapper = editor.container.firstElementChild as HTMLElement
    const exported = staticNode(image, doc)
    expect(filled(css(exported, TURN_PROPERTIES))).toEqual({
      transform: wrapper.style.transform.replace('translate(5px, 6px) ', ''),
      'transform-origin': wrapper.style.transformOrigin
    })
  })
})
