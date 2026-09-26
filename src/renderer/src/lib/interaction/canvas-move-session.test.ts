import { describe, expect, it } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import {
  applyMoveSession,
  beginMoveSession,
  moveModifiers,
  wantsDuplicate
} from './canvas-move-session'
import {
  connector,
  expectSingleUndo,
  frame,
  loadElements,
  resetSessionStores,
  shape
} from './canvas-session-fixtures'

resetSessionStores()
const free = { disableSnap: true, constrainAxis: false }
const doc = () => useDocumentStore.getState()

describe('canvas move session', () => {
  it('moves a selection from its original positions and records one undo entry', () => {
    const before = loadElements(
      [shape('a'), shape('b', { x: 200 }), shape('outside', { x: 500 })],
      ['a', 'b']
    )
    const session = beginMoveSession('a', { world: { x: 10, y: 20 } }, false)
    applyMoveSession(session, { x: 30, y: 50 }, free)
    applyMoveSession(session, { x: 60, y: 10 }, free)
    expect(doc().document.elements.a).toMatchObject({ x: 50, y: -10 })
    expect(doc().document.elements.b).toMatchObject({ x: 250, y: -10 })
    expect(doc().document.elements.outside).toEqual(before.elements.outside)
    expect(doc().past).toEqual([])
    doc().endEdit()
    expectSingleUndo(before)
  })

  it('moves an unselected target without moving the previous selection', () => {
    loadElements([shape('a'), shape('b', { x: 200 })], ['a'])
    const session = beginMoveSession('b', { world: { x: 0, y: 0 } }, false)
    applyMoveSession(session, { x: 30, y: 20 }, free)
    expect(doc().selectedIds).toEqual(['b'])
    expect(doc().document.elements.a).toMatchObject({ x: 0, y: 0 })
    expect(doc().document.elements.b).toMatchObject({ x: 230, y: 20 })
  })

  it.each([
    { zoom: 1, disableSnap: false, x: 200, guides: true },
    { zoom: 2, disableSnap: false, x: 195, guides: false },
    { zoom: 1, disableSnap: true, x: 195, guides: false }
  ])(
    'uses a screen-space snapping tolerance: $zoom / disabled $disableSnap',
    ({ zoom, disableSnap, x, guides }) => {
      loadElements([shape('a'), shape('target', { x: 200, y: 300 })], ['a'])
      useCameraStore.setState({ camera: { x: 0, y: 0, zoom } })
      const session = beginMoveSession('a', { world: { x: 0, y: 0 } }, false)
      applyMoveSession(session, { x: 195, y: 80 }, { disableSnap, constrainAxis: false })
      expect(doc().document.elements.a).toMatchObject({ x, y: 80 })
      expect(useInteractionOverlayStore.getState().snapGuides.length > 0).toBe(guides)
    }
  )

  it('clears snap guides when snapping is disabled mid-drag', () => {
    loadElements([shape('a'), shape('b', { x: 200, y: 300 })], ['a'])
    const session = beginMoveSession('a', { world: { x: 0, y: 0 } }, false)
    applyMoveSession(session, { x: 195, y: 80 }, { ...free, disableSnap: false })
    expect(useInteractionOverlayStore.getState().snapGuides.length).toBeGreaterThan(0)
    applyMoveSession(session, { x: 195, y: 80 }, free)
    expect(doc().document.elements.a?.x).toBe(195)
    expect(useInteractionOverlayStore.getState().snapGuides).toEqual([])
  })

  it.each([
    { x: 40, y: 10, expected: { x: 40, y: 0 } },
    { x: -10, y: -40, expected: { x: 0, y: -40 } }
  ])('constrains the dominant axis for $x,$y', ({ x, y, expected }) => {
    loadElements([shape('a')], ['a'])
    const session = beginMoveSession(null, { world: { x: 0, y: 0 } }, false)
    applyMoveSession(session, { x, y }, { ...free, constrainAxis: true })
    expect(doc().document.elements.a).toMatchObject(expected)
  })

  it('duplicates and moves a selection in one undo step, leaving originals intact', () => {
    const before = loadElements([shape('a'), shape('b', { x: 200 })], ['a', 'b'])
    const session = beginMoveSession(null, { world: { x: 0, y: 0 } }, true)
    applyMoveSession(session, { x: 30, y: 40 }, free)
    applyMoveSession(session, { x: 60, y: 80 }, free)
    expect(doc().document.order).toHaveLength(4)
    expect(doc().selectedIds).toEqual(session.ids)
    expect(session.ids).toHaveLength(2)
    expect(session.ids).not.toContain('a')
    expect(session.ids).not.toContain('b')
    expect(session.ids.map((id) => doc().document.elements[id])).toMatchObject([
      { x: 60, y: 80 },
      { x: 260, y: 80 }
    ])
    expect(doc().document.elements.a).toEqual(before.elements.a)
    expect(doc().document.elements.b).toEqual(before.elements.b)
    doc().endEdit()
    expectSingleUndo(before)
  })

  it('carries frame contents and translates free connector endpoints', () => {
    const before = loadElements(
      [
        frame('f'),
        shape('a', { x: 50, y: 50 }),
        connector('line', { start: { x: 60, y: 70 }, end: { x: 180, y: 150 } }),
        shape('outside', { x: 600 })
      ],
      ['f']
    )
    const session = beginMoveSession('f', { world: { x: 0, y: 0 } }, false)
    applyMoveSession(session, { x: 20, y: 30 }, free)
    expect(new Set(doc().selectedIds)).toEqual(new Set(['f', 'a', 'line']))
    expect(doc().document.elements.f).toMatchObject({ x: 20, y: 30 })
    expect(doc().document.elements.a).toMatchObject({ x: 70, y: 80 })
    expect(doc().document.elements.line).toMatchObject({
      start: { x: 80, y: 100 },
      end: { x: 200, y: 180 }
    })
    expect(doc().document.elements.outside).toEqual(before.elements.outside)
  })

  it('does not snap to connectors', () => {
    loadElements(
      [shape('a'), connector('line', { start: { x: 200, y: 300 }, end: { x: 300, y: 350 } })],
      ['a']
    )
    const session = beginMoveSession('a', { world: { x: 0, y: 0 } }, false)
    applyMoveSession(session, { x: 195, y: 80 }, { ...free, disableSnap: false })
    expect(doc().document.elements.a?.x).toBe(195)
    expect(useInteractionOverlayStore.getState().snapGuides).toEqual([])
  })

  it('maps every modifier combination to duplication, axis lock and snapping', () => {
    for (const altKey of [false, true]) {
      for (const shiftKey of [false, true]) {
        for (const primaryKey of [false, true]) {
          const modifiers = { altKey, shiftKey, primaryKey }
          expect(wantsDuplicate(modifiers)).toBe(altKey || (shiftKey && primaryKey))
          expect(moveModifiers(modifiers)).toEqual({
            disableSnap: primaryKey,
            constrainAxis: shiftKey
          })
        }
      }
    }
  })
})
