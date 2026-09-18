import {
  buildClipboardPayload,
  pasteClipboardPayload,
  type ClipboardPayload
} from '@shared/canvas/clipboard-payload'
import { newElementId, useDocumentStore } from '@/store/document-store'

const PASTE_OFFSET = 24

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
let pasteCount = 0
let pendingFallbacks: ReturnType<typeof setTimeout>[] = []

/** The native `paste` event owns this ⌘V: drop every pending keyboard fallback. */
export function nativePasteArrived(): void {
  for (const timer of pendingFallbacks) {
    clearTimeout(timer)
  }
  pendingFallbacks = []
}

let keyboardFallback: () => void = () => {
  if (memory) {
    pasteObjects(memory)
  }
}

/** Lets the clipboard hook swap in a richer fallback (native image/text) than the memory copy. */
export function setKeyboardPasteFallback(fallback: () => void): void {
  keyboardFallback = fallback
}

/**
 * ⌘V fallback for engines that never dispatch `paste`: give the native event time to arrive
 * (it cancels us), then run the registered fallback.
 */
export function requestKeyboardPaste(): void {
  const timer = setTimeout(() => {
    pendingFallbacks = pendingFallbacks.filter((t) => t !== timer)
    keyboardFallback()
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
  pasteCount = 0
  void navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => undefined)
  return payload
}

export function cutSelection(): ClipboardPayload | null {
  const payload = copySelection()
  if (payload) {
    useDocumentStore.getState().deleteSelected()
  }
  return payload
}

export function pasteObjects(payload: ClipboardPayload): void {
  pasteCount += 1
  const offset = PASTE_OFFSET * pasteCount
  let newIds: string[] = []
  useDocumentStore.getState().applyEdit((d) => {
    const result = pasteClipboardPayload(d, payload, newElementId, { x: offset, y: offset })
    newIds = result.newIds
    return result.document
  })
  useDocumentStore.getState().setSelection(newIds)
}

/** Last in-app copy; only for paste events whose clipboard data the engine withheld. */
export function memoryPayload(): ClipboardPayload | null {
  return memory
}
