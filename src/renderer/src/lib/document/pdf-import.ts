import { visibleWorldRect } from '@shared/canvas/camera-transform'
import { createImageAsset } from '@shared/canvas/document-assets'
import { createImageElement } from '@shared/canvas/element-factory'
import type {
  CanvasElement,
  FrameElement,
  ImageAsset,
  Point,
  Size
} from '@shared/canvas/element-types'
import { PDF_PAGE_GAP, PDF_PAGE_WIDTH, layoutPdfPages } from '@shared/pdf/pdf-page-layout'
import { nextFrameOrder } from '@shared/canvas/presentation-sequence'
import { t } from '@/i18n/ui-strings'
import { MAX_PASTED_IMAGE_EDGE } from '@/lib/raster/clipboard-image'
import { newElementId, useDocumentStore } from '@/store/document-store'
import { useCameraStore } from '@/store/camera-store'
import { useToolStore } from '@/store/tool-store'

/** Pages are rasterised at this width (CSS px) so slide text stays crisp when zoomed in. */
const RENDER_WIDTH_PX = 1600
const JPEG_QUALITY = 0.9

/** Runtime files copied next to the app by `pnpm build:pdfjs` (see copy-pdfjs-assets.mjs). */
function runtimeUrl(path: string): string {
  return new URL(`pdfjs/${path}`, document.baseURI).href
}

type RenderedPage = { src: string; width: number; height: number; points: Size }

async function renderPages(file: File): Promise<RenderedPage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = runtimeUrl('pdf.worker.min.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    standardFontDataUrl: runtimeUrl('standard_fonts/'),
    wasmUrl: runtimeUrl('wasm/')
  })
  task.onPassword = () => {
    throw new Error(t('error.pdfPassword'))
  }
  const pdf = await task.promise.catch((error: unknown) => {
    throw new Error(
      error instanceof Error && error.name === 'PasswordException'
        ? t('error.pdfPassword')
        : t('error.decodePdf')
    )
  })
  const pages: RenderedPage[] = []
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const longest = Math.max(base.width, base.height)
      const scale = Math.min(RENDER_WIDTH_PX / base.width, MAX_PASTED_IMAGE_EDGE / longest)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error(t('error.canvasContext'))
      }
      await page.render({ canvasContext: context, canvas, viewport }).promise
      pages.push({
        src: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
        width: canvas.width,
        height: canvas.height,
        points: { width: base.width, height: base.height }
      })
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return pages
}

function gridOrigin(at?: Point): Point {
  if (at) {
    return at
  }
  const { camera, viewport } = useCameraStore.getState()
  const visible = visibleWorldRect(camera, viewport)
  return { x: visible.x + visible.width * 0.1, y: visible.y + visible.height * 0.1 }
}

/**
 * Renders every page to an image element and wraps each in a presentation frame, laid out as a
 * grid whose top-left is the drop point. One undo step; the new frames end up selected.
 */
export async function importPdfFile(file: File, at?: Point): Promise<void> {
  const pages = await renderPages(file)
  const placements = layoutPdfPages(
    pages.map((page) => page.points),
    { origin: gridOrigin(at), pageWidth: PDF_PAGE_WIDTH, gap: PDF_PAGE_GAP }
  )
  const baseName = file.name.replace(/\.pdf$/i, '') || 'PDF'
  const store = useDocumentStore.getState()
  let order = nextFrameOrder(store.document)
  const assets: ImageAsset[] = []
  const elements: CanvasElement[] = []
  const frameIds: string[] = []
  pages.forEach((page, index) => {
    const placement = placements[index]
    if (!placement) {
      return
    }
    const asset = createImageAsset(page.src, page.width, page.height)
    assets.push(asset)
    const frame: FrameElement = {
      id: newElementId(),
      type: 'frame',
      name: `${baseName} ${index + 1}`,
      order: order++,
      ...placement.frame
    }
    // Why: frames go in first so they never cover a page in z-order even though the world layer
    // already paints frames beneath content.
    elements.push(frame, createImageElement(asset.id, page, placement.page, newElementId()))
    frameIds.push(frame.id)
  })
  store.insertImported(assets, elements, frameIds)
  useToolStore.getState().setTool('select')
}
