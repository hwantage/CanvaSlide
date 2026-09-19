import {
  buildClipboardPayload,
  clipboardPayloadKey,
  pasteClipboardPayload,
  type ClipboardPayload
} from '@shared/canvas/clipboard-payload'
import { newElementId, useDocumentStore } from '@/store/document-store'
import type { Point } from '@shared/canvas/element-types'
import { objectPastePlacement, type ObjectPastePlacement } from '@shared/canvas/paste-placement'
import { canvasPastePointer } from './canvas-paste-pointer'

/**
 * Real engines (Chromium, WebView2, WKWebView with an Edit menu) dispatch `paste` within a few
 * milliseconds of ⌘V; only keyboard automation without a clipboard never does.
 */
const KEYBOARD_FALLBACK_DELAY_MS = 200

/**
 * Object clipboard. The payload goes to the system clipboard as JSON text so it survives across
 * documents/windows; an in-memory copy covers engines that block clipboard reads.
 */
let memory: ClipboardPayload | null = null
let copyPointerRevision = 0
let placement: (ObjectPastePlacement & { payloadKey: string }) | null = null
let pendingFallbacks: ReturnType<typeof setTimeout>[] = []
let nativePasteRevision = 0

/** The native `paste` event owns this ⌘V: drop every pending keyboard fallback. */
export function nativePasteArrived(): void {
  nativePasteRevision++
  for (const timer of pendingFallbacks) {
    clearTimeout(timer)
  }
  pendingFallbacks = []
}

let keyboardFallback: (target: Point | null, valid: () => boolean) => void = (target) => {
  if (memory) {
    pasteObjects(memory, target)
  }
}

/** Lets the clipboard hook swap in a richer fallback (native image/text) than the memory copy. */
export function setKeyboardPasteFallback(
  fallback: (target: Point | null, valid: () => boolean) => void
): void {
  keyboardFallback = fallback
}

/**
 * ⌘V fallback for engines that never dispatch `paste`: give the native event time to arrive
 * (it cancels us), then run the registered fallback.
 */
export function requestKeyboardPaste(): void {
  const target = objectPasteTarget()
  const revision = nativePasteRevision
  const timer = setTimeout(() => {
    pendingFallbacks = pendingFallbacks.filter((t) => t !== timer)
    keyboardFallback(target, () => revision === nativePasteRevision)
  }, KEYBOARD_FALLBACK_DELAY_MS)
  pendingFallbacks.push(timer)
}

export function copySelection(): ClipboardPayload | null {
  const { document, selectedIds } = useDocumentStore.getState()
  const payload = buildClipboardPayload(document, selectedIds)
  if (!payload) {
    return null
  }
  memory = payload
  placement = null
  copyPointerRevision = canvasPastePointer().revision
  void navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => undefined)
  return payload
}

export function cutSelection(): ClipboardPayload | null {
  const payload = copySelection()
  if (payload) {
    const store = useDocumentStore.getState()
    store.setSelection(payload.elements.map((element) => element.id))
    store.deleteSelected()
  }
  return payload
}

export function objectPasteTarget(): Point | null {
  const pointer = canvasPastePointer()
  return pointer.revision > copyPointerRevision ? pointer.world : null
}

export function pasteObjects(payload: ClipboardPayload, target = objectPasteTarget()): void {
  const payloadKey = clipboardPayloadKey(payload)
  const previous = placement?.payloadKey === payloadKey ? placement : null
  placement = { ...objectPastePlacement(payload.elements, target, previous), payloadKey }
  const { offset } = placement
  let newIds: string[] = []
  useDocumentStore.getState().applyEdit((d) => {
    const result = pasteClipboardPayload(d, payload, newElementId, offset)
    newIds = result.newIds
    return result.document
  })
  useDocumentStore.getState().setSelection(newIds)
}

/** Last in-app copy; only for paste events whose clipboard data the engine withheld. */
export function memoryPayload(): ClipboardPayload | null {
  return memory
}
