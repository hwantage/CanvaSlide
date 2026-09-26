import { describe, expect, it } from 'vitest'
import type { ImageElement } from '@shared/canvas/element-types'
import { useDocumentStore } from '@/store/document-store'
import { applyResizeSession, beginResizeSession } from './canvas-resize-session'
import {
  connector,
  expectSingleUndo,
  loadElements,
  resetSessionStores,
  shape
} from './canvas-session-fixtures'

resetSessionStores()
const doc = () => useDocumentStore.getState()
const image: ImageElement = {
  id: 'image',
  type: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  assetId: 'asset',
  naturalWidth: 100,
  naturalHeight: 50
}

describe('canvas resize session', () => {
  it('ignores an empty selection', () => {
    loadElements([])
    expect(beginResizeSession('se', { x: 0, y: 0 }, false)).toBeNull()
    expect(doc().editBaseline).toBeNull()
  })

  it.each([
    { label: 'unconstrained shape', element: shape('a'), shift: false, height: 60 },
    { label: 'Shift shape', element: shape('a'), shift: true, height: 100 },
    { label: 'single image', element: image, shift: false, height: 100 }
  ])(
    'resizes $label from the original geometry with one undo entry',
    ({ element, shift, height }) => {
      const before = loadElements([element], [element.id])
      const session = beginResizeSession('se', { x: 100, y: 50 }, shift)!
      applyResizeSession(session, { x: 150, y: 55 })
      applyResizeSession(session, { x: 200, y: 60 })
      expect(doc().document.elements[element.id]).toMatchObject({ x: 0, y: 0, width: 200, height })
      expect(doc().past).toEqual([])
      doc().endEdit()
      expectSingleUndo(before)
    }
  )

  it('resizes a rotated element along its local axes and keeps the opposite corner fixed', () => {
    const before = loadElements([shape('a', { rotation: 90 })], ['a'])
    const session = beginResizeSession('se', { x: 25, y: 75 }, false)!
    applyResizeSession(session, { x: 5, y: 95 })
    applyResizeSession(session, { x: -25, y: 175 })
    const element = doc().document.elements.a!
    expect(element.x).toBeCloseTo(-75)
    expect(element.y).toBeCloseTo(25)
    expect(element.width).toBeCloseTo(200)
    expect(element.height).toBeCloseTo(100)
    expect(element).toMatchObject({ rotation: 90 })
    doc().endEdit()
    expectSingleUndo(before)
  })

  it('scales a mixed selection and connector endpoints without forcing the image aspect ratio', () => {
    const before = loadElements(
      [
        image,
        shape('a', { x: 150, width: 50 }),
        connector('line', {
          start: { x: 100, y: 25 },
          end: { x: 150, y: 25 }
        })
      ],
      ['image', 'a', 'line']
    )
    const session = beginResizeSession('se', { x: 200, y: 50 }, false)!
    applyResizeSession(session, { x: 400, y: 75 })
    expect(doc().document.elements.image).toMatchObject({ x: 0, y: 0, width: 200, height: 75 })
    expect(doc().document.elements.a).toMatchObject({ x: 300, y: 0, width: 100, height: 75 })
    expect(doc().document.elements.line).toMatchObject({
      start: { x: 200, y: 37.5 },
      end: { x: 300, y: 37.5 }
    })
    doc().endEdit()
    expectSingleUndo(before)
  })
})
