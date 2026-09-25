import type { CanvasDocument } from '@shared/canvas/element-types'
import {
  pdfExportPages,
  type PdfExportPage,
  type PdfResolution
} from '@shared/canvas/pdf-export-pages'
import { buildPdf, type PdfPage } from '@shared/canvas/pdf-file'
import { t } from '@/i18n/ui-strings'
import { rasterizeFramePage } from './pdf-frame-raster'

/**
 * Turns a deck into a PDF, one page per frame in presentation order. Everything here runs on the
 * main thread: rasterising a page needs `Image`, `document` and a 2D canvas, none of which a worker
 * can give an SVG that carries a `foreignObject`.
 */

/**
 * JPEG quality per resolution. Higher resolutions are also encoded harder: the artefacts that show
 * around slide text are what the setting is really about, and they shrink with both.
 */
const pdfJpegQuality: Record<PdfResolution, number> = {
  high: 0.96,
  medium: 0.92,
  low: 0.85
}

export type PdfExportInput = {
  document: CanvasDocument
  resolution: PdfResolution
  signal?: AbortSignal
}

async function renderPage(page: PdfExportPage, input: PdfExportInput) {
  try {
    return await rasterizeFramePage({
      document: input.document,
      frame: page.frame,
      raster: page.raster,
      quality: pdfJpegQuality[input.resolution],
      ...(input.signal ? { signal: input.signal } : {})
    })
  } catch (error) {
    if (input.signal?.aborted) {
      throw error
    }
    // Why wrap: a failed raster throws the renderer's own untranslated wording, and the error
    // dialog shows a message verbatim. The original stays attached for a bug report.
    throw new Error(t('error.renderPdfPage'), { cause: error })
  }
}

/**
 * The finished file. `onPage` fires after each page so a long export can show its progress.
 *
 * Why the dialog builds the whole thing up front rather than estimating from a sample: page cost
 * swings several-fold across one deck — a title card against a full-bleed photograph — and the
 * first page, being the one a sample would naturally take, is reliably the lightest of the lot.
 * Building it outright is also the cheaper path overall, because saving then costs nothing.
 */
export async function buildPdfExport(
  input: PdfExportInput & { createdAt?: Date; onPage?: (done: number, total: number) => void }
): Promise<Uint8Array<ArrayBuffer>> {
  const pages = pdfExportPages(input.document, input.resolution)
  const rendered: PdfPage[] = []
  for (const page of pages) {
    rendered.push({ size: page.page, image: await renderPage(page, input) })
    input.onPage?.(rendered.length, pages.length)
  }
  // An abort landing after the last page still means no file: without this the caller would go on
  // to open a save dialog for an export the user had already walked away from.
  input.signal?.throwIfAborted()
  const title = input.document.name.trim()
  return buildPdf(rendered, {
    ...(title === '' ? {} : { title }),
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  })
}
