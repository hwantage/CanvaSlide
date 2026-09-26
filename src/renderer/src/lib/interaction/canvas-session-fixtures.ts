import { afterEach, beforeEach, expect } from 'vitest'
import type { StoreApi } from 'zustand'
import {
  createEmptyDocument,
  defaultConnectorStyle,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type ConnectorElement,
  type FrameElement,
  type ShapeElement
} from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { useDocumentStore } from '@/store/document-store'
import { useInteractionOverlayStore } from '@/store/interaction-overlay-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useStyleMemoryStore } from '@/store/style-memory-store'
import { useToolStore } from '@/store/tool-store'
import type { PointerInfo } from './canvas-interaction-session'

function storeReset<T>(store: StoreApi<T>): () => void {
  const initial = store.getInitialState()
  return () => store.setState(initial, true)
}

export function resetSessionStores(): void {
  const resets = [
    storeReset(useDocumentStore),
    storeReset(useCameraStore),
    storeReset(useContextMenuStore),
    storeReset(useInteractionOverlayStore),
    storeReset(usePresentationStore),
    storeReset(useStyleMemoryStore),
    storeReset(useToolStore)
  ]
  const reset = () => resets.forEach((restore) => restore())
  beforeEach(reset)
  afterEach(reset)
}

export function shape(id: string, patch: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id,
    type: 'shape',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    style: { ...defaultShapeStyle },
    text: '',
    textStyle: { ...defaultTextStyle },
    ...patch
  }
}

export function frame(id: string, patch: Partial<FrameElement> = {}): FrameElement {
  return { id, type: 'frame', x: 0, y: 0, width: 400, height: 300, name: id, order: 0, ...patch }
}

export function connector(id: string, patch: Partial<ConnectorElement> = {}): ConnectorElement {
  return {
    id,
    type: 'connector',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 50 },
    route: 'straight',
    startHead: 'none',
    endHead: 'arrow',
    style: { ...defaultConnectorStyle },
    label: '',
    textStyle: { ...defaultTextStyle },
    ...patch
  }
}

export function loadElements(
  elements: CanvasElement[],
  selectedIds: string[] = []
): CanvasDocument {
  useDocumentStore.getState().loadDocument(
    {
      ...createEmptyDocument(),
      elements: Object.fromEntries(elements.map((element) => [element.id, element])),
      order: elements.map((element) => element.id)
    },
    null
  )
  useDocumentStore.getState().setSelection(selectedIds)
  return useDocumentStore.getState().document
}

export function pointer(x: number, y: number, patch: Partial<PointerInfo> = {}): PointerInfo {
  return {
    screen: { x, y },
    world: { x, y },
    shiftKey: false,
    altKey: false,
    primaryKey: false,
    button: 0,
    ...patch
  }
}

export function expectSingleUndo(before: CanvasDocument): void {
  const after = useDocumentStore.getState().document
  expect(after).not.toEqual(before)
  expect(useDocumentStore.getState().editBaseline).toBeNull()
  expect(useDocumentStore.getState().past).toEqual([before])
  expect(useDocumentStore.getState().dirty).toBe(true)
  useDocumentStore.getState().undo()
  expect(useDocumentStore.getState().document).toEqual(before)
  expect(useDocumentStore.getState().past).toEqual([])
  expect(useDocumentStore.getState().dirty).toBe(false)
  useDocumentStore.getState().redo()
  expect(useDocumentStore.getState().document).toEqual(after)
  expect(useDocumentStore.getState().future).toEqual([])
  expect(useDocumentStore.getState().dirty).toBe(true)
}
