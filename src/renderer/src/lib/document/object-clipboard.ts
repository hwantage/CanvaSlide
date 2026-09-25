import {
  buildClipboardPayload,
  clipboardPayloadKey,
  pasteClipboardPayload,
  type ClipboardPayload
} from '@shared/canvas/clipboard-payload'
import { elementBounds } from '@shared/canvas/element-bounds'
import { newElementId, useDocumentStore } from '@/store/document-store'
import type { Point } from '@shared/canvas/element-types'
import { objectPastePlacement, type ObjectPastePlacement } from '@shared/canvas/paste-placement'
import type { PastePointer } from '@/lib/interaction/canvas-paste-pointer'

/**
 * Real engines (Chromium, WebView2, WKWebView with an Edit menu) dispatch `paste` within a few
 * milliseconds of ⌘V; only keyboard automation without a clipboard never does.
 */
const KEYBOARD_FALLBACK_DELAY_MS = 200

/** Runs a ⌘V that got no native `paste` event; `valid` turns false if one arrives after all. */
export type KeyboardPasteFallback = (target: Point | null, valid: () => boolean) => void

export type ObjectClipboard = {
  copySelection: () => ClipboardPayload | null
  cutSelection: () => ClipboardPayload | null
  /** Where a keyboard or native paste lands: the pointer, if it moved over the canvas since copy. */
  objectPasteTarget: () => Point | null
  pasteObjects: (payload: ClipboardPayload, target?: Point | null) => void
  /** Last in-app copy; only for paste events whose clipboard data the engine withheld. */
  memoryPayload: () => ClipboardPayload | null
  /** The native `paste` event owns this ⌘V: drop every pending keyboard fallback. */
  nativePasteArrived: () => void
  /**
   * ⌘V fallback for engines that never dispatch `paste`: give the native event time to arrive
   * (it cancels us), then run `fallback`.
   */
  requestKeyboardPaste: (fallback: KeyboardPasteFallback) => void
}

/**
 * Object clipboard. The payload goes to the system clipboard as JSON text so it survives across
 * documents/windows; an in-memory copy covers engines that block clipboard reads.
 */
export function createObjectClipboard(pointer: () => PastePointer): ObjectClipboard {
  let memory: ClipboardPayload | null = null
  let copyPointerRevision = 0
  let placement: (ObjectPastePlacement & { payloadKey: string }) | null = null
  let pendingFallbacks: ReturnType<typeof setTimeout>[] = []
  let nativePasteRevision = 0

  const copySelection = () => {
    const { document, selectedIds } = useDocumentStore.getState()
    const payload = buildClipboardPayload(document, selectedIds)
    if (!payload) {
      return null
    }
    memory = payload
    placement = null
    copyPointerRevision = pointer().revision
    void navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => undefined)
    return payload
  }

  const objectPasteTarget = () => {
    const current = pointer()
    return current.revision > copyPointerRevision ? current.world : null
  }

  const pasteObjects = (payload: ClipboardPayload, target = objectPasteTarget()) => {
    const payloadKey = clipboardPayloadKey(payload)
    const previous = placement?.payloadKey === payloadKey ? placement : null
    const extents = payload.elements.map(elementBounds)
    placement = { ...objectPastePlacement(extents, target, previous), payloadKey }
    const { offset } = placement
    let newIds: string[] = []
    useDocumentStore.getState().applyEdit((d) => {
      const result = pasteClipboardPayload(d, payload, newElementId, offset)
      newIds = result.newIds
      return result.document
    })
    useDocumentStore.getState().setSelection(newIds)
  }

  return {
    copySelection,
    cutSelection: () => {
      const payload = copySelection()
      if (payload) {
        const store = useDocumentStore.getState()
        store.setSelection(payload.elements.map((element) => element.id))
        store.deleteSelected()
      }
      return payload
    },
    objectPasteTarget,
    pasteObjects,
    memoryPayload: () => memory,
    nativePasteArrived: () => {
      nativePasteRevision++
      for (const timer of pendingFallbacks) {
        clearTimeout(timer)
      }
      pendingFallbacks = []
    },
    requestKeyboardPaste: (fallback) => {
      const target = objectPasteTarget()
      const revision = nativePasteRevision
      const timer = setTimeout(() => {
        pendingFallbacks = pendingFallbacks.filter((t) => t !== timer)
        fallback(target, () => revision === nativePasteRevision)
      }, KEYBOARD_FALLBACK_DELAY_MS)
      pendingFallbacks.push(timer)
    }
  }
}
