import {
  contentBounds,
  elementRect,
  rectContainsRect,
  selectionBounds
} from '@shared/canvas/element-bounds'
import { frameRectAround, selectionIsOnlyFrames } from '@shared/canvas/frame-from-selection'
import { insertElement } from '@shared/canvas/document-mutations'
import { frameIndexById, orderedFrames } from '@shared/canvas/presentation-sequence'
import { createFrameElement } from '@/lib/element-factory'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'

/** Commands that act on the current selection; shared by shortcuts, the panel and the context menu. */

/** Fit-all: the whole board in view, never past 100%; nothing to do on an empty board. */
export function zoomToContent(): boolean {
  const bounds = contentBounds(useDocumentStore.getState().document)
  if (!bounds) {
    return false
  }
  useCameraStore.getState().fitContent(bounds)
  return true
}

export function zoomToSelection(): boolean {
  const { document, selectedIds } = useDocumentStore.getState()
  const bounds = selectionBounds(document, selectedIds)
  if (!bounds) {
    return false
  }
  useCameraStore.getState().fitSelection(bounds)
  return true
}

/** Wraps the selected elements in a new presentation frame and selects it. */
export function frameSelection(): boolean {
  const store = useDocumentStore.getState()
  // Why: wrapping frames in a frame only adds a duplicate slide to the deck, never what was meant.
  if (selectionIsOnlyFrames(store.document, store.selectedIds)) {
    return false
  }
  const bounds = selectionBounds(store.document, store.selectedIds)
  if (!bounds) {
    return false
  }
  const frame = createFrameElement(store.document, frameRectAround(bounds))
  store.applyEdit((d) => insertElement(d, frame))
  store.setSelection([frame.id])
  return true
}

/** The selected frame, or the first frame that fully contains the selection. */
export function selectedFrameIndex(): number {
  const { document, selectedIds } = useDocumentStore.getState()
  const frames = orderedFrames(document)
  for (const id of selectedIds) {
    const index = frameIndexById(frames, id)
    if (index !== -1) {
      return index
    }
  }
  const bounds = selectionBounds(document, selectedIds)
  if (!bounds) {
    return -1
  }
  return frames.findIndex((frame) => rectContainsRect(elementRect(frame), bounds))
}

export function presentFromSelection(): void {
  const index = selectedFrameIndex()
  usePresentationStore.getState().start(index === -1 ? 0 : index)
}

/** Enter: edit the label of the single selected text/shape/connector; F2 also renames frames. */
export function startEditingSelection(options: { frames: boolean }): boolean {
  const { document, selectedIds } = useDocumentStore.getState()
  if (selectedIds.length !== 1) {
    return false
  }
  const element = document.elements[selectedIds[0] as string]
  if (!element || element.type === 'image' || (element.type === 'frame' && !options.frames)) {
    return false
  }
  useToolStore.getState().setEditingTextId(element.id)
  return true
}
