import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { syncConnectorGeometry } from '@shared/canvas/connector-geometry'
import { upsertAsset } from '@shared/canvas/document-assets'
import { groupElements, ungroupElements } from '@shared/canvas/element-groups'
import { alignElements, distributeElements } from '@shared/canvas/element-alignment'
import {
  applyFrameOrders,
  duplicateElements,
  insertElement,
  patchElements,
  removeElements,
  reorderZ,
  translateElements
} from '@shared/canvas/document-mutations'
import {
  createEmptyDocument,
  type CanvasDocument,
  type ElementId
} from '@shared/canvas/element-types'
import {
  moveFrameInSequence,
  moveFrameToIndex,
  orderedFrames
} from '@shared/canvas/presentation-sequence'
import { syncTextHeight } from '@shared/canvas/text-height'
import { popRedo, popUndo, pushSnapshot } from './document-history'
import type { DocumentState, DocumentStore } from './document-state'

export type { DocumentActions, DocumentState, DocumentStore, SaveSnapshot } from './document-state'

const initialState: DocumentState = {
  document: createEmptyDocument(),
  selectedIds: [],
  filePath: null,
  dirty: false,
  revision: 0,
  session: 0,
  past: [],
  future: [],
  editBaseline: null
}

export const newElementId = (): ElementId => nanoid(10)

export const useDocumentStore = create<DocumentStore>()((set, get) => {
  const recorded = (updater: (document: CanvasDocument) => CanvasDocument) => {
    const { document, past, future, revision } = get()
    const next = syncConnectorGeometry(updater(document))
    if (next === document) {
      return
    }
    set({
      document: next,
      dirty: true,
      revision: revision + 1,
      ...pushSnapshot({ past, future }, document)
    })
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
    takeSaveSnapshot: () => ({
      document: get().document,
      session: get().session,
      revision: get().revision
    }),
    completeSave: (snapshot, filePath) =>
      set((s) => {
        if (s.session !== snapshot.session) {
          return s
        }
        return { filePath, dirty: s.revision === snapshot.revision ? false : s.dirty }
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
        return next === s.document ? s : { document: next, dirty: true, revision: s.revision + 1 }
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
              editBaseline: null,
              revision: s.revision + (s.document === s.editBaseline ? 0 : 1)
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
    insertImage: (asset, element) => {
      recorded((d) => insertElement(upsertAsset(d, asset), element))
      set({ selectedIds: [element.id] })
    },
    insertImported: (assets, elements, select) => {
      if (elements.length === 0) {
        return
      }
      recorded((d) => {
        let next = assets.reduce((doc, asset) => upsertAsset(doc, asset), d)
        for (const element of elements) {
          next = insertElement(next, element)
        }
        return next
      })
      set({ selectedIds: select })
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
    updateSettings: (patch, record = true) => {
      const apply = (d: CanvasDocument) => ({ ...d, settings: { ...d.settings, ...patch } })
      if (record) {
        recorded(apply)
      } else {
        get().applyLive(apply)
      }
    },
    renameDocument: (name) => recorded((d) => ({ ...d, name })),

    undo: () => {
      const { past, future, document, revision } = get()
      const result = popUndo({ past, future }, document)
      if (result) {
        set({
          document: result.document,
          ...result.stacks,
          dirty: true,
          revision: revision + 1,
          editBaseline: null
        })
        pruneSelection(set, get)
      }
    },
    redo: () => {
      const { past, future, document, revision } = get()
      const result = popRedo({ past, future }, document)
      if (result) {
        set({
          document: result.document,
          ...result.stacks,
          dirty: true,
          revision: revision + 1,
          editBaseline: null
        })
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
