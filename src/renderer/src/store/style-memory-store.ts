import { create } from 'zustand'
import type { ConnectorHeads } from '@shared/canvas/connector-markers'
import type { NewElementContext } from '@shared/canvas/element-factory'
import type { CanvasElement, ElementId } from '@shared/canvas/element-types'
import { newElementId, useDocumentStore } from './document-store'
import {
  defaultStyleMemory,
  rememberStyleFrom,
  type StyleMemory
} from '@shared/canvas/style-memory'

export type StyleMemoryStore = {
  memory: StyleMemory
  /** Called after the user changes a style in the panel so the next new element inherits it. */
  rememberFrom: (element: CanvasElement) => void
  /** The connector tool's flyout: ends for the next connector drawn. */
  setConnectorHeads: (patch: Partial<ConnectorHeads>) => void
}

/** Session-scoped: a fresh launch starts from the defaults again. */
export const useStyleMemoryStore = create<StyleMemoryStore>()((set, get) => ({
  memory: defaultStyleMemory,
  rememberFrom: (element) => {
    const memory = rememberStyleFrom(get().memory, element)
    if (memory !== get().memory) {
      set({ memory })
    }
  },
  setConnectorHeads: (patch) =>
    set((s) => ({
      memory: { ...s.memory, connectorHeads: { ...s.memory.connectorHeads, ...patch } }
    }))
}))

export function currentStyleMemory(): StyleMemory {
  return useStyleMemoryStore.getState().memory
}

/** Why here: the shared factories stay store-free, so the editor supplies both from its stores. */
export function newElementContext(): NewElementContext {
  return { id: newElementId(), style: currentStyleMemory() }
}

/** After a panel edit, the first selected element's style becomes the default for new ones. */
export function rememberSelectionStyle(ids: readonly ElementId[]): void {
  const { document } = useDocumentStore.getState()
  const first = ids[0] === undefined ? undefined : document.elements[ids[0]]
  if (first) {
    useStyleMemoryStore.getState().rememberFrom(first)
  }
}
