import { useEffect } from 'react'
import { visibleWorldRect } from '@shared/canvas/camera-transform'
import { createImageAsset } from '@shared/canvas/document-assets'
import { cascadeRect } from '@shared/canvas/paste-placement'
import { decodeImageFile, findImageFile } from '@/lib/clipboard-image'
import { createImageElement, placeImageRect } from '@/lib/element-factory'
import {
  copySelection,
  cutSelection,
  memoryPayload,
  nativePasteArrived,
  pasteObjects,
  payloadFromClipboardText
} from '@/lib/object-clipboard'
import { isEditableTarget } from '@/lib/platform-keys'
import { showErrorMessage } from '@/platform/document-file-access'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'

async function pasteImage(file: File): Promise<void> {
  const decoded = await decodeImageFile(file)
  const { camera, viewport } = useCameraStore.getState()
  const visible = visibleWorldRect(camera, viewport)
  const maxBox = {
    x: visible.x + visible.width * 0.2,
    y: visible.y + visible.height * 0.2,
    width: visible.width * 0.6,
    height: visible.height * 0.6
  }
  const asset = createImageAsset(decoded.src, decoded.width, decoded.height)
  const document = useDocumentStore.getState().document
  const rect = cascadeRect(placeImageRect(decoded, maxBox), document)
  useDocumentStore.getState().insertImage(asset, createImageElement(asset.id, decoded, rect))
  useToolStore.getState().setTool('select')
}

function ignoring(event: ClipboardEvent): boolean {
  return isEditableTarget(event.target) || usePresentationStore.getState().active
}

/** Native copy/cut/paste events: objects first (our JSON), then pasted images. */
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
      const payload = payloadFromClipboardText(text)
      if (payload) {
        event.preventDefault()
        pasteObjects(payload)
        return
      }
      const file = findImageFile(event.clipboardData)
      if (file) {
        event.preventDefault()
        try {
          await pasteImage(file)
        } catch (error) {
          await showErrorMessage(error instanceof Error ? error.message : String(error))
        }
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
