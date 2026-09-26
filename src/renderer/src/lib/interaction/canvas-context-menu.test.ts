import { describe, expect, it } from 'vitest'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'
import { openContextMenu } from './canvas-context-menu'
import { frame, loadElements, resetSessionStores, shape } from './canvas-session-fixtures'

resetSessionStores()
const doc = () => useDocumentStore.getState()

describe('canvas context menu', () => {
  it('selects the topmost hit, ends text editing, and stores both coordinate spaces', () => {
    const before = loadElements([shape('bottom'), shape('top')], ['bottom'])
    useToolStore.getState().setEditingTextId('bottom')
    openContextMenu({ x: 420, y: 230 }, { x: 20, y: 20 })
    expect(doc().selectedIds).toEqual(['top'])
    expect(useToolStore.getState().editingTextId).toBeNull()
    expect(useContextMenuStore.getState()).toMatchObject({
      position: { x: 420, y: 230 },
      world: { x: 20, y: 20 }
    })
    expect(doc().document).toEqual(before)
    expect(doc().past).toEqual([])
    expect(doc().dirty).toBe(false)
  })

  it.each([
    { x: 20, y: 20 },
    { x: 150, y: 20 }
  ])('preserves multi-selection over a selected object or its gap: %j', (world) => {
    loadElements([shape('a'), shape('b', { x: 200 })], ['a', 'b'])
    openContextMenu({ x: 10, y: 10 }, world)
    expect(doc().selectedIds).toEqual(['a', 'b'])
    expect(useContextMenuStore.getState().world).toEqual(world)
  })

  it('clears selection on empty canvas outside the selection bounds', () => {
    loadElements([shape('a')], ['a'])
    openContextMenu({ x: 500, y: 500 }, { x: 500, y: 500 })
    expect(doc().selectedIds).toEqual([])
    expect(useContextMenuStore.getState().position).toEqual({ x: 500, y: 500 })
  })

  it.each([
    { zoom: 1, selected: ['f'] },
    { zoom: 2, selected: [] }
  ])('hit-tests frame title chrome at zoom $zoom', ({ zoom, selected }) => {
    loadElements([frame('f')])
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom } })
    openContextMenu({ x: 50, y: 50 }, { x: 50, y: -20 })
    expect(doc().selectedIds).toEqual(selected)
  })
})
