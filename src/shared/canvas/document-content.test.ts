import { describe, expect, it } from 'vitest'
import { createDocumentContentComparator } from './document-content'
import {
  createEmptyDocument,
  defaultTextStyle,
  defaultShapeStyle,
  defaultConnectorStyle,
  type CanvasDocument
} from './element-types'
import { syncTextHeight } from './text-height'

const sameDocumentContent = createDocumentContentComparator()

function document(): CanvasDocument {
  return {
    ...createEmptyDocument('Saved'),
    order: ['text', 'line'],
    elements: {
      text: {
        id: 'text',
        type: 'text',
        text: 'Hello',
        x: 0,
        y: 0,
        width: 200,
        height: 28,
        textStyle: defaultTextStyle
      },
      line: {
        id: 'line',
        type: 'connector',
        x: 100,
        y: 28,
        width: 100,
        height: 100,
        start: { x: 100, y: 28, elementId: 'text', side: 'bottom', pinned: true },
        end: { x: 200, y: 128 },
        route: 'straight',
        startHead: 'none',
        endHead: 'arrow',
        style: defaultConnectorStyle,
        label: '',
        textStyle: defaultTextStyle
      }
    }
  }
}

describe('sameDocumentContent', () => {
  it('rechecks a previously differing element and finds changes elsewhere after it is restored', () => {
    const sameContent = createDocumentContentComparator()
    const saved = document()
    const moved = structuredClone(saved)
    moved.elements.text!.x = 10
    expect(sameContent(moved, saved)).toBe(false)
    const restored = structuredClone(saved)
    const line = restored.elements.line!
    if (line.type !== 'connector') {
      throw new Error('fixture')
    }
    line.label = 'Unsaved'
    expect(sameContent(restored, saved)).toBe(false)
    expect(sameContent(structuredClone(saved), saved)).toBe(true)
  })

  it('rechecks the previous difference against a replaced saved document', () => {
    const sameContent = createDocumentContentComparator()
    const opened = document()
    const saved = structuredClone(opened)
    saved.elements.text!.x = 10
    expect(sameContent(saved, opened)).toBe(false)
    expect(sameContent(structuredClone(saved), saved)).toBe(true)
    expect(sameContent(opened, saved)).toBe(false)
    expect(sameContent(structuredClone(opened), opened)).toBe(true)
  })

  it('handles the previously differing element disappearing from one or both documents', () => {
    const sameContent = createDocumentContentComparator()
    const saved = document()
    const edited = structuredClone(saved)
    edited.elements.text!.x = 10
    expect(sameContent(edited, saved)).toBe(false)
    delete edited.elements.text
    expect(sameContent(edited, saved)).toBe(false)
    const replacement = structuredClone(edited)
    expect(sameContent(replacement, edited)).toBe(true)
    replacement.name = 'Another file'
    expect(sameContent(replacement, edited)).toBe(false)
  })

  it('compares independently constructed content and ignores key order and omitted optional fields', () => {
    const a = document()
    const b = structuredClone(a)
    b.elements = { line: b.elements.line!, text: b.elements.text! }
    b.elements.text = { ...b.elements.text!, groupId: undefined }
    expect(sameDocumentContent(a, b)).toBe(true)
  })

  it('treats a re-measured rotated text box as the same content', () => {
    const upright = document()
    const saved = {
      ...upright,
      elements: { ...upright.elements, text: { ...upright.elements.text!, rotation: 30 } }
    } as CanvasDocument
    const measured = syncTextHeight(saved, 'text', 80)
    expect(measured.elements.text).not.toMatchObject({ x: 0, y: 0 })
    expect(sameDocumentContent(saved, measured)).toBe(true)
    const moved = { ...measured.elements.text!, x: measured.elements.text!.x + 1 }
    expect(
      sameDocumentContent(saved, { ...measured, elements: { ...measured.elements, text: moved } })
    ).toBe(false)
  })

  it('ignores navigation and measured text/attached connector geometry', () => {
    const a = document()
    const b = syncTextHeight(a, 'text', 80)
    expect(b.elements.line).not.toEqual(a.elements.line)
    expect(sameDocumentContent(a, { ...b, camera: { x: 100, y: 200, zoom: 2 } })).toBe(true)
  })

  it.each([
    'name',
    'settings',
    'order',
    'assets',
    'text',
    'width',
    'position',
    'style',
    'endpoint',
    'port',
    'detach',
    'pin',
    'clip',
    'group',
    'route'
  ])('detects authored changes to %s', (field) => {
    const a = document()
    const b = structuredClone(a)
    const text = b.elements.text!
    const line = b.elements.line!
    if (text.type !== 'text' || line.type !== 'connector') {
      throw new Error('fixture')
    }
    switch (field) {
      case 'name':
        b.name = 'Changed'
        break
      case 'settings':
        b.settings.spotlight = 1
        break
      case 'order':
        b.order = ['line', 'text']
        break
      case 'assets':
        b.assets.a = {
          id: 'a',
          data: 'data:image/png;base64,AA==',
          mime: 'image/png',
          width: 1,
          height: 1
        }
        break
      case 'text':
        text.text = 'Changed'
        break
      case 'width':
        text.width += 10
        break
      case 'position':
        text.y += 10
        break
      case 'style':
        text.textStyle.fontSize += 1
        break
      case 'endpoint':
        line.end.x += 10
        break
      case 'detach':
        line.start = { x: line.start.x, y: line.start.y }
        break
      case 'pin':
        line.start.pinned = false
        break
      case 'clip':
        text.clip = { top: 0.1, bottom: 0, left: 0, right: 0 }
        break
      case 'group':
        text.groupId = 'group'
        break
      case 'route':
        line.route = 'curved'
        break
      case 'port':
        line.start.side = 'left'
        break
    }
    expect(sameDocumentContent(a, b)).toBe(false)
  })

  it('ignores automatic ports but compares pinned ports and free endpoint coordinates', () => {
    const a = document()
    const line = a.elements.line!
    if (line.type !== 'connector') {
      throw new Error('fixture')
    }
    line.start.pinned = false
    const b = structuredClone(a)
    const changed = b.elements.line!
    if (changed.type !== 'connector') {
      throw new Error('fixture')
    }
    delete changed.start.pinned
    changed.start.side = 'left'
    changed.start.x += 10
    expect(sameDocumentContent(a, b)).toBe(true)
    changed.end.y += 1
    expect(sameDocumentContent(a, b)).toBe(false)
  })

  it('compares explicit heights on elements without measured text bounds', () => {
    const a = document()
    a.elements.shape = {
      id: 'shape',
      type: 'shape',
      shape: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: '',
      textStyle: defaultTextStyle,
      style: defaultShapeStyle
    }
    const b = structuredClone(a)
    b.elements.shape!.height += 1
    expect(sameDocumentContent(a, b)).toBe(false)
  })

  it('detects removed elements even when order is unchanged', () => {
    const a = document()
    const b = structuredClone(a)
    delete b.elements.line
    expect(sameDocumentContent(a, b)).toBe(false)
  })
})
