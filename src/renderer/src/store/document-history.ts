import type { CanvasDocument } from '@shared/canvas/element-types'

export const HISTORY_LIMIT = 100

export type HistoryStacks = { past: CanvasDocument[]; future: CanvasDocument[] }

export function pushSnapshot(stacks: HistoryStacks, snapshot: CanvasDocument): HistoryStacks {
  const past = [...stacks.past, snapshot]
  if (past.length > HISTORY_LIMIT) {
    past.shift()
  }
  return { past, future: [] }
}

export function popUndo(
  stacks: HistoryStacks,
  current: CanvasDocument
): { stacks: HistoryStacks; document: CanvasDocument } | null {
  const previous = stacks.past.at(-1)
  if (!previous) {
    return null
  }
  return {
    document: previous,
    stacks: { past: stacks.past.slice(0, -1), future: [current, ...stacks.future] }
  }
}

export function popRedo(
  stacks: HistoryStacks,
  current: CanvasDocument
): { stacks: HistoryStacks; document: CanvasDocument } | null {
  const [next, ...future] = stacks.future
  if (!next) {
    return null
  }
  return { document: next, stacks: { past: [...stacks.past, current], future } }
}
