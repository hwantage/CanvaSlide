import type { FilePath } from '@/platform/file-path'
import type { AlignMode, DistributeAxis } from '@shared/canvas/element-alignment'
import type { ElementPatch, ZDirection } from '@shared/canvas/document-mutations'
import type {
  CanvasDocument,
  CanvasElement,
  DocumentSettings,
  ElementId,
  ImageAsset,
  ImageElement,
  Point
} from '@shared/canvas/element-types'
import type { HistoryStacks } from './document-history'

/** What a save started from; completing it must not clear edits made while the file was written. */
export type SaveSnapshot = { document: CanvasDocument; session: number; revision: number }

export type DocumentState = HistoryStacks & {
  document: CanvasDocument
  selectedIds: ElementId[]
  filePath: FilePath | null
  dirty: boolean
  /** Counts content edits; renderer measurements do not invalidate an in-flight save. */
  revision: number
  /** Bumped on new/open so an in-flight save can't attach its path to another document. */
  session: number
  /** Snapshot taken at the start of a drag; committed as one undo step on end. */
  editBaseline: CanvasDocument | null
}
export type DocumentActions = {
  loadDocument: (document: CanvasDocument, filePath: FilePath | null) => void
  newDocument: () => void
  takeSaveSnapshot: () => SaveSnapshot
  /** Applies a finished save: path + name always, `dirty=false` only if nothing changed since. */
  completeSave: (snapshot: SaveSnapshot, filePath: FilePath | null) => void
  setSelection: (ids: ElementId[]) => void
  toggleSelected: (id: ElementId) => void
  selectAll: () => void
  clearSelection: () => void
  /** One-shot recorded edit. */
  applyEdit: (updater: (document: CanvasDocument) => CanvasDocument) => void
  /** Unrecorded live change between beginEdit/endEdit (drags, typing). */
  applyLive: (updater: (document: CanvasDocument) => CanvasDocument) => void
  syncTextHeight: (id: ElementId, measuredHeight: number) => void
  beginEdit: () => void
  endEdit: () => void
  /** Drops everything since beginEdit (e.g. an aborted connector drag). */
  cancelEdit: () => void
  insertElement: (element: CanvasElement, select?: boolean) => void
  /** Adds the asset (deduplicated by content hash) and the element in one undo step. */
  insertImage: (asset: ImageAsset, element: ImageElement) => void
  /** Bulk import (e.g. PDF pages): every asset and element lands in one undo step. */
  insertImported: (assets: ImageAsset[], elements: CanvasElement[], select: ElementId[]) => void
  patchElements: (ids: ElementId[], patch: ElementPatch, record?: boolean) => void
  translateSelected: (delta: Point) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  reorderSelected: (direction: ZDirection) => void
  moveFrameOrder: (id: ElementId, direction: 'up' | 'down') => void
  moveFrameTo: (id: ElementId, index: number) => void
  /** Groups the selection (frames excluded); the new group becomes the selection. */
  groupSelected: () => void
  ungroupSelected: () => void
  alignSelected: (mode: AlignMode) => void
  distributeSelected: (axis: DistributeAxis) => void
  /** `record: false` is the live half of a slider drag, between `beginEdit` and `endEdit`. */
  updateSettings: (patch: Partial<DocumentSettings>, record?: boolean) => void
  renameDocument: (name: string) => void
  undo: () => void
  redo: () => void
}

export type DocumentStore = DocumentState & DocumentActions
