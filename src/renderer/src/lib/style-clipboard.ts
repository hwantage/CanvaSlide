import { extractStyleClip, styleClipPatch, type StyleClip } from '@shared/canvas/style-clipboard'
import { useDocumentStore } from '@/store/document-store'

/** In-memory only: formatting is app-specific and never needs to leave the process. */
let clip: StyleClip | null = null

export function copySelectedStyle(): boolean {
  const { document, selectedIds } = useDocumentStore.getState()
  const [id] = selectedIds
  const element = id === undefined ? undefined : document.elements[id]
  const extracted = element ? extractStyleClip(element) : null
  if (!extracted) {
    return false
  }
  clip = extracted
  return true
}

export function pasteStyleToSelection(): boolean {
  const { selectedIds, patchElements } = useDocumentStore.getState()
  if (!clip || selectedIds.length === 0) {
    return false
  }
  const current = clip
  patchElements(selectedIds, (element) => styleClipPatch(element, current))
  return true
}

export function hasCopiedStyle(): boolean {
  return clip !== null
}
