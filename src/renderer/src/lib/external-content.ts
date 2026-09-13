import { visibleWorldRect } from '@shared/canvas/camera-transform'
import { createImageAsset } from '@shared/canvas/document-assets'
import type { Point, Rect } from '@shared/canvas/element-types'
import { cascadeRect } from '@shared/canvas/paste-placement'
import { normalizePastedText, pastedTextWidth } from '@shared/canvas/pasted-text'
import { decodeImageFile } from '@/lib/clipboard-image'
import { createImageElement, createTextElement, placeImageRect } from '@/lib/element-factory'
import { memoryPayload, pasteObjects, payloadFromClipboardText } from '@/lib/object-clipboard'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'

/** Content arriving from outside the app (clipboard text, dropped files) becomes elements here. */

/** The visible canvas shrunk to 60% around its centre (or around `at`): where new content lands. */
function landingBox(at?: Point): Rect {
  const { camera, viewport } = useCameraStore.getState()
  const visible = visibleWorldRect(camera, viewport)
  const width = visible.width * 0.6
  const height = visible.height * 0.6
  const center = at ?? { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 }
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

export async function insertImageFile(file: File, at?: Point): Promise<void> {
  const decoded = await decodeImageFile(file)
  const asset = createImageAsset(decoded.src, decoded.width, decoded.height)
  const document = useDocumentStore.getState().document
  const rect = cascadeRect(placeImageRect(decoded, landingBox(at)), document)
  useDocumentStore.getState().insertImage(asset, createImageElement(asset.id, decoded, rect))
  useToolStore.getState().setTool('select')
}

/** Plain text from another app becomes one text element; line breaks are kept. */
export function insertPlainText(raw: string, at?: Point): boolean {
  const text = normalizePastedText(raw)
  if (text.trim() === '') {
    return false
  }
  const box = landingBox(at)
  const element = createTextElement({ x: 0, y: 0 })
  const width = pastedTextWidth(text, element.textStyle.fontSize, box.width)
  const lines = text.split('\n').length
  const height = element.height * lines
  const origin = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2 }
  const rect = cascadeRect({ ...origin, width, height }, useDocumentStore.getState().document)
  useDocumentStore.getState().insertElement({ ...element, ...rect, text })
  useToolStore.getState().setTool('select')
  return true
}

/** Clipboard text: our own object payload first, otherwise plain text. */
export function insertClipboardText(text: string, at?: Point): boolean {
  const payload = payloadFromClipboardText(text)
  if (payload) {
    pasteObjects(payload)
    return true
  }
  return insertPlainText(text, at)
}

export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) {
    return []
  }
  return [...data.files].filter((file) => file.type.startsWith('image/'))
}

/**
 * Menu-driven paste: no native `paste` event exists, so read the clipboard directly. Engines that
 * refuse the read (or hold nothing we understand) fall back to the last in-app copy.
 */
export async function pasteFromSystemClipboard(at?: Point): Promise<void> {
  let text = ''
  try {
    text = (await navigator.clipboard?.readText()) ?? ''
  } catch {
    text = ''
  }
  if (text !== '' && insertClipboardText(text, at)) {
    return
  }
  const remembered = memoryPayload()
  if (remembered) {
    pasteObjects(remembered)
  }
}
