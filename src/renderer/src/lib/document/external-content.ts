import { visibleWorldRect } from '@shared/canvas/camera-transform'
import { parseClipboardPayload } from '@shared/canvas/clipboard-payload'
import { createImageAsset } from '@shared/canvas/document-assets'
import type { Point, Rect } from '@shared/canvas/element-types'
import { cascadeRect } from '@shared/canvas/paste-placement'
import { normalizePastedText, pastedTextWidth } from '@shared/canvas/pasted-text'
import { parseVideoSource } from '@shared/canvas/video-source'
import { initialVideoAspectRatio, videoInsertionRect } from '@shared/canvas/video-placement'
import { readVideoAspectRatio } from '@/lib/video-metadata'
import { decodeImageFile } from '@/lib/raster/clipboard-image'
import { pickFiles } from '@/lib/file-picker'
import { createImageElement, createTextElement, placeImageRect } from '@/lib/element-factory'
import { memoryPayload, objectPasteTarget, pasteObjects } from '@/lib/document/object-clipboard'
import { reportError } from '@/platform/document-file-access'
import { readNativeClipboardImage, readNativeClipboardText } from '@/platform/native-clipboard'
import { useCameraStore } from '@/store/camera-store'
import { newElementId, useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'
import { importFigFile } from '@/store/fig-import-store'

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

export async function insertImageFile(
  file: File,
  at?: Point,
  valid: () => boolean = () => true
): Promise<void> {
  const decoded = await decodeImageFile(file)
  if (!valid()) {
    return
  }
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
export function insertClipboardText(
  text: string,
  at?: Point,
  objectTarget = at === undefined ? objectPasteTarget() : null
): boolean {
  const payload = parseClipboardPayload(text)
  if (payload) {
    pasteObjects(payload, objectTarget)
    return true
  }
  const video = parseVideoSource(text)
  if (video) {
    return insertVideoUrl(text, at)
  }
  return insertPlainText(text, at)
}

export function insertVideoUrl(raw: string, at?: Point): boolean {
  const source = parseVideoSource(raw, true)
  if (!source) {
    return false
  }
  const document = useDocumentStore.getState().document
  const box = landingBox(at)
  const initialRatio = initialVideoAspectRatio(raw)
  const rect = cascadeRect(videoInsertionRect(initialRatio, box), document)
  const id = newElementId()
  useDocumentStore
    .getState()
    .insertElement({ id, type: 'video', url: source.url, autoplay: true, ...rect })
  useToolStore.getState().setTool('select')
  const inserted = useDocumentStore.getState().document
  const session = useDocumentStore.getState().session
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  const unsubscribe = useDocumentStore.subscribe((state) => {
    if (state.document !== inserted || state.session !== session || state.editBaseline) {
      controller.abort()
    }
  })
  void readVideoAspectRatio(source, controller.signal)
    .then((ratio) => {
      const state = useDocumentStore.getState()
      if (
        !ratio ||
        controller.signal.aborted ||
        state.document !== inserted ||
        state.session !== session
      ) {
        return
      }
      // Some YouTube responses describe a landscape embed even for a Shorts URL.
      const aspect =
        initialRatio < 1 && source.provider === 'youtube' && ratio > 1 ? initialRatio : ratio
      const fitted = videoInsertionRect(aspect, box)
      unsubscribe()
      state.patchElements(
        [id],
        {
          width: fitted.width,
          height: fitted.height,
          x: rect.x + (rect.width - fitted.width) / 2,
          y: rect.y + (rect.height - fitted.height) / 2
        },
        false
      )
    })
    .finally(() => {
      clearTimeout(timeout)
      unsubscribe()
    })
  return true
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isFigFile(file: File): boolean {
  return /\.fig$/i.test(file.name)
}

/** Dropped files we can turn into elements, in the order they were dropped. */
export function importableFilesFrom(data: DataTransfer | null): File[] {
  if (!data) {
    return []
  }
  return [...data.files].filter(
    (file) => file.type.startsWith('image/') || isPdfFile(file) || isFigFile(file)
  )
}

/** Routes one dropped/pasted file to the right importer. */
export async function insertFile(file: File, at?: Point): Promise<void> {
  if (isFigFile(file)) {
    await importFigFile(file, at)
    return
  }
  if (isPdfFile(file)) {
    const { importPdfFile } = await import('./pdf-import')
    await importPdfFile(file, at)
    return
  }
  await insertImageFile(file, at)
}

/**
 * Menu-driven paste: no native `paste` event exists, so read the clipboard directly. Engines that
 * refuse the read (or hold nothing we understand) fall back to the last in-app copy.
 */
export async function pasteFromSystemClipboard(
  at?: Point,
  objectTarget = at === undefined ? objectPasteTarget() : null,
  valid: () => boolean = () => true
): Promise<void> {
  const session = useDocumentStore.getState().session
  const current = () => valid() && session === useDocumentStore.getState().session
  const image = await readNativeClipboardImage()
  if (!current()) {
    return
  }
  if (image) {
    await insertImageFile(image, at, current)
    return
  }
  let text = await readNativeClipboardText()
  if (text === '') {
    try {
      text = (await navigator.clipboard?.readText()) ?? ''
    } catch {
      text = ''
    }
  }
  if (!current()) {
    return
  }
  if (text !== '' && insertClipboardText(text, at, objectTarget)) {
    return
  }
  const remembered = memoryPayload()
  if (remembered) {
    pasteObjects(remembered, objectTarget)
  }
}

export const IMPORT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,.pdf,.fig'

/** Toolbar / menu / ⌘I: choose files and insert them around the visible centre. */
export async function importPickedFiles(at?: Point): Promise<void> {
  const files = await pickFiles(IMPORT_ACCEPT)
  for (const file of files) {
    try {
      await insertFile(file, at)
    } catch (error) {
      await reportError(error)
    }
  }
}
