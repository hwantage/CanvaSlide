import { create } from 'zustand'
import type { CanvasElement } from '@shared/canvas/element-types'
import {
  defaultStyleMemory,
  rememberStyleFrom,
  type StyleMemory
} from '@shared/canvas/style-memory'

export type StyleMemoryStore = {
  memory: StyleMemory
  /** Called after the user changes a style in the panel so the next new element inherits it. */
  rememberFrom: (element: CanvasElement) => void
}

/** Session-scoped: a fresh launch starts from the defaults again. */
export const useStyleMemoryStore = create<StyleMemoryStore>()((set, get) => ({
  memory: defaultStyleMemory,
  rememberFrom: (element) => {
    const memory = rememberStyleFrom(get().memory, element)
    if (memory !== get().memory) {
      set({ memory })
    }
  }
}))

export function currentStyleMemory(): StyleMemory {
  return useStyleMemoryStore.getState().memory
}
