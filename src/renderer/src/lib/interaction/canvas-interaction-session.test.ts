import { describe, expect, it } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'
import { createCanvasInteraction } from './canvas-interaction-session'
import {
  connector,
  expectSingleUndo,
  loadElements,
  pointer,
  resetSessionStores,
  shape
} from './canvas-session-fixtures'

resetSessionStores()
const doc = () => useDocumentStore.getState()
const overlay = () => useInteractionOverlayStore.getState()

describe('canvas interaction lifecycle', () => {
  it('starts a drag at three screen pixels and applies the threshold-crossing sample', () => {
    const before = loadElements([shape('a')], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(10, 10))
    interaction.pointerMove(pointer(11, 10))
    expect(doc().document).toBe(before)
    expect(doc().editBaseline).toBeNull()
    interaction.pointerMove(pointer(13, 10))
    expect(doc().document.elements.a?.x).toBe(3)
    expect(doc().past).toEqual([])
    interaction.pointerUp(pointer(13, 10))
    expect(interaction.isActive()).toBe(false)
    expectSingleUndo(before)
  })

  it('measures the drag threshold in screen coordinates at high zoom', () => {
    loadElements([shape('a')], ['a'])
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 4 } })
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(10, 10, { screen: { x: 40, y: 40 } }))
    interaction.pointerMove(pointer(11, 10, { screen: { x: 44, y: 40 } }))
    expect(doc().document.elements.a?.x).toBe(1)
    interaction.pointerUp(pointer(11, 10))
    expect(doc().past).toHaveLength(1)
  })

  it('keeps multi-selection during press and collapses it on click release without an edit', () => {
    const before = loadElements([shape('a'), shape('b', { x: 200 })], ['a', 'b'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    expect(doc().selectedIds).toEqual(['a', 'b'])
    interaction.pointerUp(pointer(20, 20))
    expect(doc().selectedIds).toEqual(['a'])
    expect(doc().document).toBe(before)
    expect(doc().past).toEqual([])
  })

  it('moves a selection by its gap and clears selection on a gap click', () => {
    const before = loadElements([shape('a'), shape('b', { x: 200 })], ['a', 'b'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(150, 20))
    interaction.pointerMove(pointer(170, 40, { primaryKey: true }))
    interaction.pointerMove(pointer(180, 50, { primaryKey: true }))
    interaction.pointerUp(pointer(180, 50))
    expect(doc().document.elements.a).toMatchObject({ x: 30, y: 30 })
    expect(doc().document.elements.b).toMatchObject({ x: 230, y: 30 })
    expectSingleUndo(before)
    interaction.pointerDown(pointer(180, 50))
    interaction.pointerUp(pointer(180, 50))
    expect(doc().selectedIds).toEqual([])
  })

  it('duplicates from Alt at pointerDown even when it is released before moving', () => {
    const before = loadElements([shape('a')], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20, { altKey: true }))
    interaction.pointerMove(pointer(100, 100))
    expect(doc().document.order).toHaveLength(2)
    expect(doc().selectedIds).toHaveLength(1)
    const duplicateId = doc().selectedIds[0]!
    expect(duplicateId).not.toBe('a')
    expect(doc().document.elements[duplicateId]).toMatchObject({ x: 80, y: 80 })
    interaction.pointerMove(pointer(160, 150))
    expect(doc().document.elements[duplicateId]).toMatchObject({ x: 140, y: 130 })
    expect(doc().document.elements.a).toEqual(before.elements.a)
    expect(doc().past).toEqual([])
    interaction.pointerUp(pointer(160, 150))
    expectSingleUndo(before)
  })

  it('uses Shift from each pointerMove to lock and release the drag axis', () => {
    const before = loadElements([shape('a')], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    interaction.pointerMove(pointer(50, 30, { shiftKey: true }))
    expect(doc().document.elements.a).toMatchObject({ x: 30, y: 0 })
    interaction.pointerMove(pointer(60, 35, { shiftKey: true }))
    expect(doc().document.elements.a).toMatchObject({ x: 40, y: 0 })
    interaction.pointerMove(pointer(70, 40))
    expect(doc().document.elements.a).toMatchObject({ x: 50, y: 20 })
    expect(doc().past).toEqual([])
    interaction.pointerUp(pointer(70, 40))
    expectSingleUndo(before)
  })

  it('uses the primary key from each pointerMove to disable and restore snapping', () => {
    const before = loadElements([shape('a'), shape('target', { x: 200, y: 300 })], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    interaction.pointerMove(pointer(215, 100, { primaryKey: true }))
    expect(doc().document.elements.a).toMatchObject({ x: 195, y: 80 })
    expect(overlay().snapGuides).toEqual([])
    interaction.pointerMove(pointer(215, 100))
    expect(doc().document.elements.a).toMatchObject({ x: 200, y: 80 })
    expect(overlay().snapGuides.length).toBeGreaterThan(0)
    interaction.pointerMove(pointer(215, 100, { primaryKey: true }))
    expect(doc().document.elements.a).toMatchObject({ x: 195, y: 80 })
    expect(overlay().snapGuides).toEqual([])
    expect(doc().document.elements.target).toEqual(before.elements.target)
    expect(doc().past).toEqual([])
    interaction.pointerUp(pointer(215, 100, { primaryKey: true }))
    expectSingleUndo(before)
  })

  it.each([{ shiftKey: true }, { primaryKey: true }])(
    'toggles selection on modifier release: %j',
    (modifiers) => {
      loadElements([shape('a'), shape('b', { x: 200 })], ['a'])
      const interaction = createCanvasInteraction()
      const at = pointer(220, 20, modifiers)
      interaction.pointerDown(at)
      expect(doc().selectedIds).toEqual(['a'])
      interaction.pointerUp(at)
      expect(doc().selectedIds).toEqual(['a', 'b'])
      interaction.pointerDown(at)
      interaction.pointerUp(at)
      expect(doc().selectedIds).toEqual(['a'])
      expect(doc().past).toEqual([])
    }
  )

  it('expands marquee hits to groups and restores the original selection on cancel', () => {
    loadElements(
      [shape('a', { groupId: 'g' }), shape('b', { x: 200, groupId: 'g' }), shape('c', { x: 500 })],
      ['c']
    )
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(-20, -20, { shiftKey: true }))
    interaction.pointerMove(pointer(110, 60, { shiftKey: true }))
    expect(new Set(doc().selectedIds)).toEqual(new Set(['a', 'b', 'c']))
    expect(overlay().dragBox).toEqual({ x: -20, y: -20, width: 130, height: 80 })
    interaction.cancel()
    expect(doc().selectedIds).toEqual(['c'])
    expect(overlay().dragBox).toBeNull()
    expect(doc().past).toEqual([])
    expect(interaction.isActive()).toBe(false)
  })

  it('commits an existing-element drag on cancel and clears snapping overlays', () => {
    const before = loadElements([shape('a'), shape('b', { x: 200, y: 300 })], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    interaction.pointerMove(pointer(215, 100))
    expect(overlay().snapGuides.length).toBeGreaterThan(0)
    interaction.cancel()
    expect(doc().document.elements.a?.x).toBe(200)
    expect(overlay().snapGuides).toEqual([])
    expect(interaction.isActive()).toBe(false)
    expectSingleUndo(before)
  })

  it('cancels an unfinished connector without leaving content, history or a preview', () => {
    const before = loadElements([shape('a')])
    useToolStore.getState().setTool('connector')
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(100, 25))
    interaction.pointerMove(pointer(300, 25))
    expect(doc().document.order).toHaveLength(2)
    interaction.cancel()
    expect(doc().document).toEqual(before)
    expect(doc().past).toEqual([])
    expect(doc().dirty).toBe(false)
    expect(doc().editBaseline).toBeNull()
    expect(overlay().anchorPreview).toBeNull()
    expect(interaction.isActive()).toBe(false)
  })

  it('previews a Shift-square and inserts it only on release', () => {
    const before = loadElements([])
    useToolStore.getState().setTool('rectangle')
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(10, 20))
    interaction.pointerMove(pointer(110, 50, { shiftKey: true }))
    expect(doc().document).toEqual(before)
    expect(overlay().createPreview).toEqual({
      tool: 'rectangle',
      rect: { x: 10, y: 20, width: 100, height: 100 }
    })
    interaction.pointerUp(pointer(110, 50, { shiftKey: true }))
    expect(Object.values(doc().document.elements)).toMatchObject([
      { type: 'shape', x: 10, y: 20, width: 100, height: 100 }
    ])
    expect(overlay().createPreview).toBeNull()
    expect(useToolStore.getState().tool).toBe('select')
    expectSingleUndo(before)
  })

  it('pans by consecutive screen deltas without editing the document', () => {
    const before = loadElements([shape('a')])
    useCameraStore.setState({ camera: { x: 10, y: 20, zoom: 2 } })
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(10, 10, { button: 1 }))
    interaction.pointerMove(pointer(30, 40))
    interaction.pointerMove(pointer(50, 70))
    interaction.pointerUp(pointer(50, 70))
    expect(useCameraStore.getState().camera).toEqual({ x: 50, y: 80, zoom: 2 })
    expect(doc().document).toBe(before)
    expect(doc().past).toEqual([])
  })

  it.each(['resize', 'rotate', 'connector'] as const)(
    'routes and finishes a %s handle drag as one edit',
    (kind) => {
      const before = loadElements(
        [shape('a'), connector('line', { start: { x: 300, y: 0 }, end: { x: 400, y: 50 } })],
        ['a']
      )
      const interaction = createCanvasInteraction()
      if (kind === 'resize') {
        interaction.startResize('se', pointer(100, 50))
      }
      if (kind === 'rotate') {
        interaction.startRotate(pointer(100, 25))
      }
      if (kind === 'connector') {
        interaction.startConnectorEnd('line', 'end')
      }
      interaction.pointerMove(pointer(50, 75))
      interaction.pointerMove(pointer(0, 100))
      expect(doc().past).toEqual([])
      interaction.pointerUp(pointer(0, 100))
      expect(interaction.isActive()).toBe(false)
      expect(overlay().rotationGuide).toBeNull()
      expect(overlay().anchorPreview).toBeNull()
      expectSingleUndo(before)
    }
  )

  it('ignores context menus and a second press during a drag', () => {
    loadElements([shape('a')], ['a'])
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    interaction.pointerMove(pointer(40, 40))
    interaction.contextMenu(pointer(500, 500))
    interaction.pointerDown(pointer(500, 500))
    interaction.pointerMove(pointer(60, 60))
    interaction.pointerUp(pointer(60, 60))
    expect(doc().document.elements.a).toMatchObject({ x: 40, y: 40 })
    expect(useContextMenuStore.getState().position).toBeNull()
    interaction.contextMenu(pointer(60, 60))
    expect(useContextMenuStore.getState().position).toEqual({ x: 60, y: 60 })
  })

  it('ignores editing gestures and menus while presenting', () => {
    const before = loadElements([shape('a')])
    usePresentationStore.setState({ active: true })
    const interaction = createCanvasInteraction()
    interaction.pointerDown(pointer(20, 20))
    interaction.pointerMove(pointer(50, 50))
    interaction.pointerUp(pointer(50, 50))
    interaction.doubleClick(pointer(20, 20))
    interaction.contextMenu(pointer(20, 20))
    expect(interaction.isActive()).toBe(false)
    expect(doc().document).toBe(before)
    expect(doc().selectedIds).toEqual([])
    expect(useToolStore.getState().editingTextId).toBeNull()
    expect(useContextMenuStore.getState().position).toBeNull()
  })

  it('double-clicks into editing and leaves that element pointer to its editor', () => {
    loadElements([shape('a')])
    const interaction = createCanvasInteraction()
    interaction.doubleClick(pointer(20, 20))
    expect(doc().selectedIds).toEqual(['a'])
    expect(useToolStore.getState().editingTextId).toBe('a')
    interaction.pointerDown(pointer(20, 20))
    expect(interaction.isActive()).toBe(false)
    expect(doc().editBaseline).toBeNull()
  })
})
