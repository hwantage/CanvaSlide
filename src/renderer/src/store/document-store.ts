import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { syncConnectorGeometry } from '@shared/canvas/connector-geometry'
import { upsertAsset } from '@shared/canvas/document-assets'
import {
  alignElements,
  distributeElements,
  type AlignMode,
  type DistributeAxis
} from '@shared/canvas/element-alignment'
import {
  applyFrameOrders,
  duplicateElements,
  insertElement,
  patchElements,
  removeElements,
  reorderZ,
  translateElements,
  type ElementPatch
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
import { popRedo, popUndo, pushSnapshot, type HistoryStacks } from './document-history'

/** What a save started from; completing it must not clear edits made while the file was written. */
export type SaveSnapshot = { document: CanvasDocument; session: number }

export type DocumentState = HistoryStacks & {
  document: CanvasDocument
  selectedIds: ElementId[]
  filePath: string | null
  dirty: boolean
  /** Bumped on new/open so an in-flight save can't attach its path to another document. */
  session: number
  /** Snapshot taken at the start of a drag; committed as one undo step on end. */
  editBaseline: CanvasDocument | null
}

export type DocumentActions = {
  loadDocument: (document: CanvasDocument, filePath: string | null) => void
  newDocument: () => void
  takeSaveSnapshot: () => SaveSnapshot
  /** Applies a finished save: path + name always, `dirty=false` only if nothing changed since. */
  completeSave: (snapshot: SaveSnapshot, filePath: string | null, name: string) => void
  setSelection: (ids: ElementId[]) => void
  toggleSelected: (id: ElementId) => void
  selectAll: () => void
  clearSelection: () => void
  /** One-shot recorded edit. */
  applyEdit: (updater: (document: CanvasDocument) => CanvasDocument) => void
  /** Unrecorded live change between beginEdit/endEdit (drags, typing). */
  applyLive: (updater: (document: CanvasDocument) => CanvasDocument) => void
  beginEdit: () => void
  endEdit: () => void
  /** Drops everything since beginEdit (e.g. an aborted connector drag). */
  cancelEdit: () => void
  insertElement: (element: CanvasElement, select?: boolean) => void
  /** Adds the asset (deduplicated by content hash) and the element in one undo step. */
  insertImage: (asset: ImageAsset, element: ImageElement) => void
  patchElements: (ids: ElementId[], patch: ElementPatch, record?: boolean) => void
  translateSelected: (delta: Point) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  reorderSelected: (direction: 'front' | 'back') => void
  moveFrameOrder: (id: ElementId, direction: 'up' | 'down') => void
  moveFrameTo: (id: ElementId, index: number) => void
  alignSelected: (mode: AlignMode) => void
  distributeSelected: (axis: DistributeAxis) => void
  updateSettings: (patch: Partial<DocumentSettings>) => void
  renameDocument: (name: string) => void
  undo: () => void
  redo: () => void
}

export type DocumentStore = DocumentState & DocumentActions

const initialState: DocumentState = {
  document: createEmptyDocument(),
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
  const recorded = (updater: (document: CanvasDocument) => CanvasDocument) => {
    const { document, past, future } = get()
    const next = syncConnectorGeometry(updater(document))
    if (next === document) {
      return
    }
    set({ document: next, dirty: true, ...pushSnapshot({ past, future }, document) })
  }

  return {
    ...initialState,

    loadDocument: (document, filePath) =>
      set((s) => ({
        ...initialState,
        document: syncConnectorGeometry(document),
        filePath,
        session: s.session + 1
      })),
    newDocument: () =>
      set((s) => ({ ...initialState, document: createEmptyDocument(), session: s.session + 1 })),
    takeSaveSnapshot: () => ({ document: get().document, session: get().session }),
    completeSave: (snapshot, filePath, name) =>
      set((s) => {
        if (s.session !== snapshot.session) {
          return s
        }
        const unchanged = s.document === snapshot.document
        const document = s.document.name === name ? s.document : { ...s.document, name }
        return { document, filePath, dirty: unchanged ? false : s.dirty }
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
        return next === s.document ? s : { document: next, dirty: true }
      }),
    cancelEdit: () =>
      set((s) => (s.editBaseline ? { document: s.editBaseline, editBaseline: null } : s)),
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
    insertImage: (asset, element) => {
      recorded((d) => insertElement(upsertAsset(d, asset), element))
      set({ selectedIds: [element.id] })
    },
    patchElements: (ids, patch, record = true) => {
      const apply = (d: CanvasDocument) => patchElements(d, ids, patch)
      if (record) {
        recorded(apply)
      } else {
        get().applyLive(apply)
      }
    },
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
    alignSelected: (mode) => recorded((d) => alignElements(d, get().selectedIds, mode)),
    distributeSelected: (axis) => recorded((d) => distributeElements(d, get().selectedIds, axis)),
    updateSettings: (patch) => recorded((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    renameDocument: (name) => recorded((d) => ({ ...d, name })),

    undo: () => {
      const { past, future, document } = get()
      const result = popUndo({ past, future }, document)
      if (result) {
        set({ document: result.document, ...result.stacks, dirty: true, editBaseline: null })
        pruneSelection(set, get)
      }
    },
    redo: () => {
      const { past, future, document } = get()
      const result = popRedo({ past, future }, document)
      if (result) {
        set({ document: result.document, ...result.stacks, dirty: true, editBaseline: null })
        pruneSelection(set, get)
      }
    }
  }
})

function pruneSelection(
  set: (partial: Partial<DocumentState>) => void,
  get: () => DocumentState
): void {
  const { document, selectedIds } = get()
  const kept = selectedIds.filter((id) => document.elements[id] !== undefined)
  if (kept.length !== selectedIds.length) {
    set({ selectedIds: kept })
  }
}

export const selectDocument = (s: DocumentStore) => s.document
export const selectSelectedIds = (s: DocumentStore) => s.selectedIds
export const selectCanUndo = (s: DocumentStore) => s.past.length > 0
export const selectCanRedo = (s: DocumentStore) => s.future.length > 0
