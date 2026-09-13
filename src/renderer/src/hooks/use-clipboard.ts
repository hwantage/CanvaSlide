import { useEffect } from 'react'
import { findImageFile } from '@/lib/clipboard-image'
import { insertClipboardText, insertFile, isPdfFile } from '@/lib/external-content'
import {
  copySelection,
  cutSelection,
  memoryPayload,
  nativePasteArrived,
  pasteObjects
} from '@/lib/object-clipboard'
import { isEditableTarget } from '@/lib/platform-keys'
import { showErrorMessage } from '@/platform/document-file-access'
import { usePresentationStore } from '@/store/presentation-store'

/** A PDF copied from the file manager arrives as a file item on engines that expose it. */
function findPdfFile(data: DataTransfer | null): File | null {
  return [...(data?.files ?? [])].find(isPdfFile) ?? null
}

function ignoring(event: ClipboardEvent): boolean {
  return isEditableTarget(event.target) || usePresentationStore.getState().active
}

/** Native copy/cut/paste events: objects first (our JSON), then images, then plain text. */
export function useClipboard(): void {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (ignoring(event)) {
        return
      }
      const payload = cut ? cutSelection() : copySelection()
      if (payload && event.clipboardData) {
        event.clipboardData.setData('text/plain', JSON.stringify(payload))
        event.preventDefault()
      }
    }
    // Why: whatever is on the system clipboard wins; the in-memory copy is only for engines that
    // hand us a paste event with its data withheld.
    const onPaste = async (event: ClipboardEvent) => {
      if (ignoring(event)) {
        return
      }
      nativePasteArrived()
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const file = findImageFile(event.clipboardData) ?? findPdfFile(event.clipboardData)
      if (file) {
        event.preventDefault()
        try {
          await insertFile(file)
        } catch (error) {
          await showErrorMessage(error instanceof Error ? error.message : String(error))
        }
        return
      }
      if (text !== '' && insertClipboardText(text)) {
        event.preventDefault()
        return
      }
      const remembered = memoryPayload()
      if (text === '' && remembered) {
        event.preventDefault()
        pasteObjects(remembered)
      }
    }
    const copy = (event: ClipboardEvent) => onCopy(event, false)
    const cut = (event: ClipboardEvent) => onCopy(event, true)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
}
