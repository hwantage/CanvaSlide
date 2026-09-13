import { create } from 'zustand'
import type { Point } from '@shared/canvas/element-types'

export type ContextMenuState = {
  /** Screen position relative to the canvas viewport; null when closed. */
  position: Point | null
  /** World point under the cursor when the menu opened; pastes land here. */
  world: Point | null
  show: (position: Point, world: Point) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuState>()((set) => ({
  position: null,
  world: null,
  show: (position, world) => set({ position, world }),
  hide: () => set({ position: null, world: null })
}))

export const selectContextMenuOpen = (s: ContextMenuState) => s.position !== null
