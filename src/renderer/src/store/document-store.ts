import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { createDocumentContentComparator } from '@shared/canvas/document-content'
import { syncConnectorGeometry } from '@shared/canvas/connector-geometry'
import { groupElements, ungroupElements } from '@shared/canvas/element-groups'
import {
  alignElements,
  distributeElements,
  type AlignMode,
  type DistributeAxis
} from '@shared/canvas/element-alignment'
import type { FilePath } from '@/platform/file-path'
import {
  applyFrameOrders,
  duplicateElements,
  insertElement,
  insertElements,
  patchElements,
  removeElements,
  reorderZ,
  translateElements,
  type ElementPatch,
  type ZDirection
} from '@shared/canvas/document-mutations'
import {
  createEmptyDocument,
  type CanvasDocument,
  type CanvasElement,
  type DocumentSettings,
  type ElementId,
  type ImageAsset,
  type ImageElement,
  type Point
} from '@shared/canvas/element-types'
import {
  moveFrameInSequence,
  moveFrameToIndex,
  orderedFrames
} from '@shared/canvas/presentation-sequence'
import { syncTextHeight } from '@shared/canvas/text-height'
import { popRedo, popUndo, pushSnapshot, type HistoryStacks } from './document-history'

/** What a save started from; completing it must not clear edits made while the file was written. */
export type SaveSnapshot = { document: CanvasDocument; session: number }

export type DocumentState = HistoryStacks & {
  document: CanvasDocument
  selectedIds: ElementId[]
  filePath: FilePath | null
  dirty: boolean
  /** The content last written to or read from disk; null after a crash recovery, where none is known. */
  savedDocument: CanvasDocument | null
  /** Bumped on new/open so an in-flight save can't attach its path to another document. */
  session: number
  /** Snapshot taken at the start of a drag; committed as one undo step on end. */
  editBaseline: CanvasDocument | null
}
export type DocumentActions = {
  loadDocument: (document: CanvasDocument, filePath: FilePath | null) => void
  /** Loads a crash-recovery snapshot: the work is unsaved until the author writes it out. */
  restoreDocument: (document: CanvasDocument, filePath: FilePath | null) => void
  newDocument: () => void
  takeSaveSnapshot: () => SaveSnapshot
  /** Applies a finished save: path + baseline, preserving any content that differs from the saved snapshot. */
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

const emptyDocument = createEmptyDocument()
const initialState: DocumentState = {
  document: emptyDocument,
  savedDocument: emptyDocument,
  selectedIds: [],
  filePath: null,
  dirty: false,
  session: 0,
  past: [],
  future: [],
  editBaseline: null
}

export const newElementId = (): ElementId => nanoid(10)

export const useDocumentStore = create<DocumentStore>()((set, get) => {
  const sameDocumentContent = createDocumentContentComparator()
  /** No saved baseline means nothing on disk matches, so the document is dirty whatever it holds. */
  const isDirty = (next: CanvasDocument, saved: CanvasDocument | null) =>
    saved === null || !sameDocumentContent(next, saved)
  const recorded = (updater: (document: CanvasDocument) => CanvasDocument) => {
    const { document, savedDocument, past, future } = get()
    const next = syncConnectorGeometry(updater(document))
    if (next === document) {
      return
    }
    set({
      document: next,
      dirty: isDirty(next, savedDocument),
      ...pushSnapshot({ past, future }, document)
    })
  }

  /** Live edits between beginEdit/endEdit are unrecorded; everything else lands in history. */
  const change = (updater: (document: CanvasDocument) => CanvasDocument, record: boolean) => {
    if (record) {
      recorded(updater)
    } else {
      get().applyLive(updater)
    }
  }

  /** Lands on a history entry; a selection that no longer exists there is dropped. */
  const restore = (result: ReturnType<typeof popUndo>) => {
    if (!result) {
      return
    }
    const { selectedIds, savedDocument } = get()
    set({
      document: result.document,
      ...result.stacks,
      dirty: isDirty(result.document, savedDocument),
      editBaseline: null,
      selectedIds: selectedIds.filter((id) => result.document.elements[id] !== undefined)
    })
  }

  /** Replaces the open document; `recovered` work has no baseline on disk, so it starts dirty. */
  const replace = (document: CanvasDocument, filePath: FilePath | null, recovered: boolean) => {
    const loaded = syncConnectorGeometry(document)
    set((s) => ({
      ...initialState,
      document: loaded,
      savedDocument: recovered ? null : loaded,
      dirty: recovered,
      filePath,
      session: s.session + 1
    }))
  }

  return {
    ...initialState,

    loadDocument: (document, filePath) => replace(document, filePath, false),
    // Why one update and not `loadDocument` plus a correction: the recovery scheduler reacts to
    // every store update, and a single clean frame would tell it this work is saved and make it
    // delete the very copy it was restored from.
    restoreDocument: (document, filePath) => replace(document, filePath, true),
    newDocument: () => get().loadDocument(createEmptyDocument(), null),
    takeSaveSnapshot: () => ({
      document: get().document,
      session: get().session
    }),
    completeSave: (snapshot, filePath) =>
      set((s) => {
        if (s.session !== snapshot.session) {
          return s
        }
        return {
          filePath,
          savedDocument: snapshot.document,
          dirty: isDirty(s.document, snapshot.document)
        }
      }),

    setSelection: (ids) => set({ selectedIds: ids }),
    toggleSelected: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id]
      })),
    selectAll: () => set((s) => ({ selectedIds: [...s.document.order] })),
    clearSelection: () => set({ selectedIds: [] }),

    applyEdit: recorded,
    applyLive: (updater) =>
      set((s) => {
        const next = syncConnectorGeometry(updater(s.document))
        return next === s.document
          ? s
          : {
              document: next,
              dirty: isDirty(next, s.savedDocument)
            }
      }),
    syncTextHeight: (id, measuredHeight) =>
      set((s) => {
        const document = syncTextHeight(s.document, id, measuredHeight)
        if (document === s.document) {
          return s
        }
        // A measurement before the first keystroke must not turn focus/blur into an undo step.
        return { document, editBaseline: s.editBaseline === s.document ? document : s.editBaseline }
      }),
    cancelEdit: () =>
      set((s) =>
        s.editBaseline
          ? {
              document: s.editBaseline,
              dirty: isDirty(s.editBaseline, s.savedDocument),
              editBaseline: null
            }
          : s
      ),
    beginEdit: () => set((s) => ({ editBaseline: s.editBaseline ?? s.document })),
    endEdit: () => {
      const { editBaseline, document, past, future } = get()
      if (!editBaseline) {
        return
      }
      if (editBaseline === document) {
        set({ editBaseline: null })
        return
      }
      set({ editBaseline: null, ...pushSnapshot({ past, future }, editBaseline) })
    },

    insertElement: (element, select = true) => {
      recorded((d) => insertElement(d, element))
      if (select) {
        set({ selectedIds: [element.id] })
      }
    },
    insertImage: (asset, element) => get().insertImported([asset], [element], [element.id]),
    insertImported: (assets, elements, select) => {
      if (elements.length === 0) {
        return
      }
      recorded((d) => insertElements(d, elements, assets))
      set({ selectedIds: select })
    },
    patchElements: (ids, patch, record = true) =>
      change((d) => patchElements(d, ids, patch), record),
    translateSelected: (delta) => {
      const ids = get().selectedIds
      if (ids.length > 0) {
        recorded((d) => translateElements(d, ids, delta))
      }
    },
    deleteSelected: () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        return
      }
      recorded((d) => removeElements(d, ids))
      set({ selectedIds: [] })
    },
    duplicateSelected: () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        return
      }
      let newIds: ElementId[] = []
      recorded((d) => {
        const result = duplicateElements(d, ids, newElementId)
        newIds = result.newIds
        return result.document
      })
      set({ selectedIds: newIds })
    },
    reorderSelected: (direction) => {
      const ids = get().selectedIds
      if (ids.length > 0) {
        recorded((d) => reorderZ(d, ids, direction))
      }
    },
    moveFrameOrder: (id, direction) =>
      recorded((d) => {
        const orders = moveFrameInSequence(orderedFrames(d), id, direction)
        return Object.keys(orders).length === 0 ? d : applyFrameOrders(d, orders)
      }),
    moveFrameTo: (id, index) =>
      recorded((d) => {
        const orders = moveFrameToIndex(orderedFrames(d), id, index)
        return Object.keys(orders).length === 0 ? d : applyFrameOrders(d, orders)
      }),
    groupSelected: () => {
      const result = groupElements(get().document, get().selectedIds, newElementId)
      if (!result) {
        return
      }
      const { document: grouped, groupId } = result
      recorded(() => grouped)
      set({ selectedIds: grouped.order.filter((id) => grouped.elements[id]?.groupId === groupId) })
    },
    ungroupSelected: () => recorded((d) => ungroupElements(d, get().selectedIds)),
    alignSelected: (mode) => recorded((d) => alignElements(d, get().selectedIds, mode)),
    distributeSelected: (axis) => recorded((d) => distributeElements(d, get().selectedIds, axis)),
    updateSettings: (patch, record = true) =>
      change((d) => ({ ...d, settings: { ...d.settings, ...patch } }), record),
    renameDocument: (name) => recorded((d) => ({ ...d, name })),

    undo: () => {
      const { past, future, document } = get()
      restore(popUndo({ past, future }, document))
    },
    redo: () => {
      const { past, future, document } = get()
      restore(popRedo({ past, future }, document))
    }
  }
})

export const selectDocument = (s: DocumentStore) => s.document
export const selectSelectedIds = (s: DocumentStore) => s.selectedIds
export const selectCanUndo = (s: DocumentStore) => s.past.length > 0
export const selectCanRedo = (s: DocumentStore) => s.future.length > 0

/** Latches even an edit followed by undo while an asynchronous decision is pending. */
export function watchDocumentChanges(onChange: () => void): () => void {
  const sameDocumentContent = createDocumentContentComparator()
  return useDocumentStore.subscribe((state, previous) => {
    if (
      state.session !== previous.session ||
      !sameDocumentContent(state.document, previous.document)
    ) {
      onChange()
    }
  })
}
