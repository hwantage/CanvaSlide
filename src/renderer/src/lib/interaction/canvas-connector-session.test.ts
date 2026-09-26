import { describe, expect, it } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { useToolStore } from '@/store/tool-store'
import {
  beginConnectorCreate,
  beginConnectorEndDrag,
  finishConnectorCreate,
  finishConnectorEndDrag,
  previewConnectorHostAt,
  resolveConnectorEndAt,
  updateConnectorEnd
} from './canvas-connector-session'
import {
  connector,
  expectSingleUndo,
  frame,
  loadElements,
  resetSessionStores,
  shape
} from './canvas-session-fixtures'

resetSessionStores()
const doc = () => useDocumentStore.getState()
const overlay = () => useInteractionOverlayStore.getState()

describe('canvas connector session', () => {
  it('creates a connector between pinned ports with one undo entry', () => {
    const before = loadElements([shape('a'), shape('b', { x: 300 })])
    useToolStore.getState().setTool('connector')
    useToolStore.getState().setConnectorPreset({ route: 'orthogonal' })
    const session = beginConnectorCreate({ x: 100, y: 25 })
    updateConnectorEnd(session.id, 'end', { x: 200, y: 80 })
    updateConnectorEnd(session.id, 'end', { x: 300, y: 25 })
    expect(doc().document.elements[session.id]).toMatchObject({
      route: 'orthogonal',
      start: { x: 100, y: 25, elementId: 'a', side: 'right', pinned: true },
      end: { x: 300, y: 25, elementId: 'b', side: 'left', pinned: true }
    })
    expect(doc().selectedIds).toEqual([session.id])
    expect(doc().past).toEqual([])
    expect(overlay().anchorPreview?.side).toBe('left')
    finishConnectorCreate(session, { x: 300, y: 25 })
    expect(overlay().anchorPreview).toBeNull()
    expect(useToolStore.getState().tool).toBe('select')
    expectSingleUndo(before)
  })

  it('discards a connector shorter than the minimum without history or dirty state', () => {
    const before = loadElements([shape('a')])
    useToolStore.getState().setTool('connector')
    const session = beginConnectorCreate({ x: 100, y: 25 })
    updateConnectorEnd(session.id, 'end', { x: 101, y: 25 })
    finishConnectorCreate(session, { x: 101, y: 25 })
    expect(doc().document).toEqual(before)
    expect(doc().selectedIds).toEqual([])
    expect(doc().editBaseline).toBeNull()
    expect(doc().past).toEqual([])
    expect(doc().dirty).toBe(false)
    expect(overlay().anchorPreview).toBeNull()
    expect(useToolStore.getState().tool).toBe('select')
  })

  it.each(['start', 'end'] as const)(
    'reattaches then detaches the %s endpoint and undoes the whole drag',
    (which) => {
      const before = loadElements(
        [
          shape('a'),
          shape('b', { x: 300 }),
          connector('line', {
            start: { x: 100, y: 25, elementId: 'a', side: 'right', pinned: true },
            end: { x: 200, y: 150 }
          })
        ],
        ['line']
      )
      const original = before.elements.line
      if (original?.type !== 'connector') {
        throw new Error('Expected connector')
      }
      const other = which === 'start' ? 'end' : 'start'
      const session = beginConnectorEndDrag('line', which)
      updateConnectorEnd(session.id, session.which, { x: 300, y: 25 })
      expect(doc().document.elements.line).toMatchObject({
        [which]: { elementId: 'b', side: 'left', pinned: true }
      })
      updateConnectorEnd(session.id, session.which, { x: 500, y: 200 })
      const next = doc().document.elements.line
      if (next?.type !== 'connector') {
        throw new Error('Expected connector')
      }
      expect(next[which]).toEqual({ x: 500, y: 200 })
      expect(next[other]).toEqual(original[other])
      expect(overlay().anchorPreview).toBeNull()
      expect(doc().past).toEqual([])
      finishConnectorEndDrag()
      expectSingleUndo(before)
    }
  )

  it('chooses the side facing the other end away from a port, but pins a nearby port', () => {
    const document = loadElements([shape('a', { height: 100 })])
    expect(resolveConnectorEndAt(document, { x: 80, y: 20 }, '', { x: -200, y: 50 })).toEqual({
      x: 80,
      y: 20,
      elementId: 'a',
      side: 'left'
    })
    expect(resolveConnectorEndAt(document, { x: 100, y: 50 }, '', { x: -200, y: 50 })).toEqual({
      x: 100,
      y: 50,
      elementId: 'a',
      side: 'right',
      pinned: true
    })
  })

  it.each([
    { zoom: 1, attaches: true },
    { zoom: 2, attaches: false }
  ])('uses a screen-space host halo at zoom $zoom', ({ zoom, attaches }) => {
    const document = loadElements([shape('a')])
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom } })
    const end = resolveConnectorEndAt(document, { x: 112, y: 25 }, '')
    expect(end.elementId).toBe(attaches ? 'a' : undefined)
    expect(end.pinned).toBe(attaches ? true : undefined)
    expect(overlay().anchorPreview !== null).toBe(attaches)
  })

  it('uses the topmost connectable host while excluding frames, lines and the excluded id', () => {
    const document = loadElements([shape('bottom'), shape('top'), frame('f'), connector('line')])
    expect(resolveConnectorEndAt(document, { x: 100, y: 25 }, 'line').elementId).toBe('top')
    expect(resolveConnectorEndAt(document, { x: 100, y: 25 }, 'top').elementId).toBe('bottom')
  })

  it('rejects an ellipse empty corner and clears its hover preview', () => {
    const document = loadElements([shape('a', { shape: 'ellipse', width: 200, height: 200 })])
    previewConnectorHostAt(document, { x: 200, y: 100 })
    expect(overlay().anchorPreview).toMatchObject({ side: 'right', outline: 'ellipse' })
    previewConnectorHostAt(document, { x: 0, y: 0 })
    expect(overlay().anchorPreview).toBeNull()
    expect(resolveConnectorEndAt(document, { x: 0, y: 0 }, '')).toEqual({ x: 0, y: 0 })
  })

  it('does not notify hover subscribers again for the same port', () => {
    const document = loadElements([shape('a')])
    previewConnectorHostAt(document, { x: 100, y: 25 })
    const preview = overlay().anchorPreview
    expect(preview?.side).toBe('right')
    previewConnectorHostAt(document, { x: 100, y: 25 })
    expect(overlay().anchorPreview).toBe(preview)
    previewConnectorHostAt(document, { x: 50, y: 0 })
    expect(overlay().anchorPreview?.side).toBe('top')
  })
})
