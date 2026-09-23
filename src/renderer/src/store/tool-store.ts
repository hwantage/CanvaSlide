import { create } from 'zustand'
import type { ConnectorRoute, ElementId } from '@shared/canvas/element-types'

export const toolIds = [
  'select',
  'hand',
  'text',
  'rectangle',
  'ellipse',
  'diamond',
  'triangle',
  'frame',
  'connector'
] as const
export type ToolId = (typeof toolIds)[number]

// Why no ends here: they live in style memory, which panel edits update too.
export type ConnectorPreset = { route: ConnectorRoute }

export type ToolState = {
  tool: ToolId
  /** Defaults for the next connector drawn with the connector tool. */
  connectorPreset: ConnectorPreset
  /** Space bar held: temporary hand tool without losing the active tool. */
  spaceHeld: boolean
  editingTextId: ElementId | null
}

export type ToolActions = {
  setTool: (tool: ToolId) => void
  setConnectorPreset: (patch: Partial<ConnectorPreset>) => void
  setSpaceHeld: (held: boolean) => void
  setEditingTextId: (id: ElementId | null) => void
}

export type ToolStore = ToolState & ToolActions

export const useToolStore = create<ToolStore>()((set) => ({
  tool: 'select',
  connectorPreset: { route: 'straight' },
  spaceHeld: false,
  editingTextId: null,
  setTool: (tool) => set({ tool, editingTextId: null }),
  setConnectorPreset: (patch) =>
    set((s) => ({ connectorPreset: { ...s.connectorPreset, ...patch } })),
  setSpaceHeld: (spaceHeld) => set({ spaceHeld }),
  setEditingTextId: (editingTextId) => set({ editingTextId })
}))

export const selectTool = (s: ToolStore) => s.tool
export const selectEffectiveTool = (s: ToolStore): ToolId => (s.spaceHeld ? 'hand' : s.tool)
export const selectEditingTextId = (s: ToolStore) => s.editingTextId
