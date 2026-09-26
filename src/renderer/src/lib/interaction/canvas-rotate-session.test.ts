import { describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { applyRotateSession, beginRotateSession } from './canvas-rotate-session'
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

describe('canvas rotate session', () => {
  it.each(['empty', 'frame', 'connector'] as const)(
    'rejects a %s selection without starting an edit',
    (kind) => {
      loadElements(
        kind === 'empty' ? [] : [kind === 'frame' ? frame('a') : connector('a')],
        kind === 'empty' ? [] : ['a']
      )
      expect(beginRotateSession({ x: 100, y: 25 })).toBeNull()
      expect(doc().editBaseline).toBeNull()
    }
  )

  it('rotates from the original angle and commits repeated updates as one edit', () => {
    const before = loadElements([shape('a')], ['a'])
    const session = beginRotateSession({ x: 100, y: 25 })!
    applyRotateSession(session, { x: 50, y: 75 }, false)
    expect(doc().document.elements.a).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 90
    })
    applyRotateSession(session, { x: 0, y: 25 }, false)
    expect(doc().document.elements.a).toMatchObject({ rotation: 180 })
    expect(useInteractionOverlayStore.getState().rotationGuide?.degrees).toBe(180)
    expect(doc().past).toEqual([])
    doc().endEdit()
    expectSingleUndo(before)
  })

  it('snaps the absolute angle of a previously rotated element', () => {
    loadElements([shape('a', { rotation: 10 })], ['a'])
    const session = beginRotateSession({ x: 100, y: 25 })!
    const angle = (12 * Math.PI) / 180
    applyRotateSession(
      session,
      { x: 50 + 50 * Math.cos(angle), y: 25 + 50 * Math.sin(angle) },
      true
    )
    expect(doc().document.elements.a).toMatchObject({ rotation: expect.closeTo(15) })
    expect(useInteractionOverlayStore.getState().rotationGuide?.degrees).toBeCloseTo(15)
  })

  it('rotates multiple shapes and a free connector around the selection centre', () => {
    const before = loadElements(
      [
        shape('a', { width: 50 }),
        shape('b', { x: 150, width: 50 }),
        connector('line', { start: { x: 50, y: 25 }, end: { x: 150, y: 25 } })
      ],
      ['a', 'b', 'line']
    )
    const session = beginRotateSession({ x: 200, y: 25 })!
    applyRotateSession(session, { x: 100, y: 125 }, false)
    expect(doc().document.elements.a?.x).toBeCloseTo(75)
    expect(doc().document.elements.a?.y).toBeCloseTo(-75)
    expect(doc().document.elements.b?.x).toBeCloseTo(75)
    expect(doc().document.elements.b?.y).toBeCloseTo(75)
    expect(doc().document.elements.line).toMatchObject({
      start: { x: 100, y: -25 },
      end: { x: 100, y: 75 }
    })
    doc().endEdit()
    expectSingleUndo(before)
  })

  it('pins attached ends during rotation and restores the baseline when turned back', () => {
    const before = loadElements(
      [
        shape('a'),
        connector('line', {
          start: { x: 100, y: 25, elementId: 'a', side: 'right' },
          end: { x: 300, y: 25 }
        })
      ],
      ['a']
    )
    const session = beginRotateSession({ x: 100, y: 25 })!
    applyRotateSession(session, { x: 50, y: 75 }, false)
    const line = doc().document.elements.line
    expect(line).toMatchObject({ start: { elementId: 'a', side: 'right', pinned: true } })
    if (line?.type !== 'connector') {
      throw new Error('Expected connector')
    }
    expect(line.start.x).toBeCloseTo(50)
    expect(line.start.y).toBeCloseTo(75)
    applyRotateSession(session, { x: 100, y: 25 }, false)
    expect(doc().document).toEqual(before)
    doc().endEdit()
    expect(doc().past).toEqual([])
    expect(doc().dirty).toBe(false)
  })
})
