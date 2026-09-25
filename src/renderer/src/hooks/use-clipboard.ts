import { useEffect } from 'react'
import { findImageFile } from '@/lib/raster/clipboard-image'
import {
  insertClipboardText,
  insertFile,
  isPdfFile,
  pasteFromSystemClipboard
} from '@/lib/document/external-content'
import type { ObjectClipboard } from '@/lib/document/object-clipboard'
import { isEditableTarget } from '@/lib/platform-keys'
import { reportError } from '@/platform/document-file-access'
import { isModalDialogOpen } from '@/store/modal-stack'
import { usePresentationStore } from '@/store/presentation-store'

/** A PDF copied from the file manager arrives as a file item on engines that expose it. */
function findPdfFile(data: DataTransfer | null): File | null {
  return [...(data?.files ?? [])].find(isPdfFile) ?? null
}

function ignoring(event: ClipboardEvent): boolean {
  return (
    isEditableTarget(event.target) || usePresentationStore.getState().active || isModalDialogOpen()
  )
}

/** Native copy/cut/paste events: objects first (our JSON), then images, then plain text. */
export function useClipboard(clipboard: ObjectClipboard): void {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (ignoring(event)) {
        return
      }
      const payload = cut ? clipboard.cutSelection() : clipboard.copySelection()
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
      clipboard.nativePasteArrived()
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const file = findImageFile(event.clipboardData) ?? findPdfFile(event.clipboardData)
      if (file) {
        event.preventDefault()
        try {
          await insertFile(file)
        } catch (error) {
          await reportError(error)
        }
        return
      }
      if (text !== '' && insertClipboardText(clipboard, text)) {
        event.preventDefault()
        return
      }
      if (text === '') {
        // Why: the engine fired `paste` but withheld its data; read the OS clipboard directly.
        event.preventDefault()
        void pasteFromSystemClipboard(clipboard)
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
  }, [clipboard])
}
