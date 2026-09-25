import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument, type CanvasElement } from '@shared/canvas/element-types'
import { FRAME_FROM_SELECTION_PADDING } from '@shared/canvas/frame-from-selection'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'
import { frameSelection, selectedFrameIndex, startEditingSelection } from './selection-commands'

const shape = (id: string, x: number, y: number): CanvasElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x,
  y,
  width: 100,
  height: 50,
  style: { fill: '#fff', stroke: '#000', strokeWidth: 1, cornerRadius: 0 },
  text: '',
  textStyle: { color: '#000', fontSize: 16, align: 'center', bold: false }
})
const frame = (id: string, order: number, x: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order,
  x,
  y: 0,
  width: 500,
  height: 500
})

describe('selection-commands', () => {
  beforeEach(() => {
    useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
    useToolStore.getState().setEditingTextId(null)
  })

  it('wraps the selection in a padded frame and selects the frame', () => {
    const store = useDocumentStore.getState()
    store.insertElement(shape('a', 100, 100), false)
    store.insertElement(shape('b', 300, 200), false)
    store.setSelection(['a', 'b'])
    expect(frameSelection()).toBe(true)
    const { document, selectedIds } = useDocumentStore.getState()
    const created = document.elements[selectedIds[0] as string]
    expect(created?.type).toBe('frame')
    expect(created).toMatchObject({
      x: 100 - FRAME_FROM_SELECTION_PADDING,
      y: 100 - FRAME_FROM_SELECTION_PADDING,
      width: 300 + FRAME_FROM_SELECTION_PADDING * 2,
      height: 150 + FRAME_FROM_SELECTION_PADDING * 2
    })
    // The new frame is now the selection, and wrapping that would only add a duplicate slide.
    expect(frameSelection()).toBe(false)
    store.undo()
    expect(useDocumentStore.getState().document.order).toEqual(['a', 'b'])
  })

  it('refuses to wrap a selection that is nothing but frames', () => {
    const store = useDocumentStore.getState()
    store.insertElement(frame('f1', 1, 0), false)
    store.insertElement(frame('f2', 2, 900), false)
    const before = useDocumentStore.getState().document.order

    store.setSelection(['f1'])
    expect(frameSelection()).toBe(false)
    store.setSelection(['f1', 'f2'])
    expect(frameSelection()).toBe(false)
    expect(useDocumentStore.getState().document.order).toEqual(before)

    // A frame alongside content is still worth wrapping.
    store.insertElement(shape('a', 100, 100), false)
    store.setSelection(['f1', 'a'])
    expect(frameSelection()).toBe(true)
  })

  it('finds the frame to present from: selected frame, else the one containing the selection', () => {
    const store = useDocumentStore.getState()
    store.insertElement(frame('f1', 1, 0), false)
    store.insertElement(frame('f2', 2, 1000), false)
    store.insertElement(shape('inside', 1100, 100), false)
    store.setSelection(['f2'])
    expect(selectedFrameIndex()).toBe(1)
    store.setSelection(['inside'])
    expect(selectedFrameIndex()).toBe(1)
    store.setSelection([])
    expect(selectedFrameIndex()).toBe(-1)
  })

  it('starts text editing for one shape, and frames only when asked', () => {
    const store = useDocumentStore.getState()
    store.insertElement(shape('a', 0, 0), false)
    store.insertElement(frame('f', 1, 0), false)
    store.setSelection(['a'])
    expect(startEditingSelection({ frames: false })).toBe(true)
    expect(useToolStore.getState().editingTextId).toBe('a')
    store.setSelection(['f'])
    expect(startEditingSelection({ frames: false })).toBe(false)
    expect(startEditingSelection({ frames: true })).toBe(true)
    expect(useToolStore.getState().editingTextId).toBe('f')
    store.setSelection(['a', 'f'])
    expect(startEditingSelection({ frames: true })).toBe(false)
  })
})
