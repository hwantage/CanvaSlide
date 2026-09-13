import { create } from 'zustand'
import type { AnchorSide, Rect } from '@shared/canvas/element-types'
import type { SnapGuide } from '@shared/canvas/snap-guides'
import type { ToolId } from './tool-store'

/** Transient world-space overlays driven by pointer sessions (drag box, creation preview). */
export type InteractionOverlayState = {
  dragBox: Rect | null
  createPreview: { tool: ToolId; rect: Rect } | null
  snapGuides: SnapGuide[]
  setSnapGuides: (guides: SnapGuide[]) => void
  /** Host under a dragged connector end: its four anchors, with the chosen side highlighted. */
  anchorPreview: { rect: Rect; side: AnchorSide } | null
  setAnchorPreview: (preview: { rect: Rect; side: AnchorSide } | null) => void
  setDragBox: (rect: Rect | null) => void
  setCreatePreview: (preview: { tool: ToolId; rect: Rect } | null) => void
}

export const useInteractionOverlayStore = create<InteractionOverlayState>()((set) => ({
  dragBox: null,
  createPreview: null,
  snapGuides: [],
  setSnapGuides: (snapGuides) => set({ snapGuides }),
  anchorPreview: null,
  setAnchorPreview: (anchorPreview) => set({ anchorPreview }),
  setDragBox: (dragBox) => set({ dragBox }),
  setCreatePreview: (createPreview) => set({ createPreview })
}))
