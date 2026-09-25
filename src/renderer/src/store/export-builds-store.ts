import { create } from 'zustand'
import type { CanvasDocument } from '@shared/canvas/element-types'
import type { PdfResolution } from '@shared/pdf/pdf-export-pages'
import type { ExportQuality } from '@/lib/raster/export-image-recompress'
import { useDocumentStore } from './document-store'

/**
 * What the export dialog has already produced for the document on screen.
 *
 * Why this outlives the dialog: building an export is the expensive part — seconds of rasterising
 * for a PDF — and reopening the dialog on a document nobody has touched should not pay it twice.
 * Why it does not outlive an edit: every build is of a particular document, so the first change
 * makes all of them wrong, and holding tens of megabytes of stale output helps no one.
 */

/** An HTML build is decided by the image quality and whether fonts go in, so both key it. */
export type HtmlBuildKey = `${ExportQuality}:${boolean}`

export function htmlBuildKey(quality: ExportQuality, embedFonts: boolean): HtmlBuildKey {
  return `${quality}:${embedFonts}`
}

export type HtmlBuild = { html: string; bytes: number; fontBytes: number; fontCount: number }

export type ExportBuildsStore = {
  /** The document every held build belongs to; null when nothing is held. */
  source: CanvasDocument | null
  html: Partial<Record<HtmlBuildKey, HtmlBuild>>
  pdf: Partial<Record<PdfResolution, Uint8Array<ArrayBuffer>>>
  rememberHtml: (source: CanvasDocument, key: HtmlBuildKey, build: HtmlBuild) => void
  rememberPdf: (
    source: CanvasDocument,
    resolution: PdfResolution,
    pdf: Uint8Array<ArrayBuffer>
  ) => void
  clear: () => void
}

const empty = { source: null, html: {}, pdf: {} } as const

export const useExportBuildsStore = create<ExportBuildsStore>()((set) => ({
  ...empty,
  rememberHtml: (source, key, build) =>
    set((state) =>
      state.source === source
        ? { html: { ...state.html, [key]: build } }
        : { source, html: { [key]: build }, pdf: {} }
    ),
  rememberPdf: (source, resolution, pdf) =>
    set((state) =>
      state.source === source
        ? { pdf: { ...state.pdf, [resolution]: pdf } }
        : { source, html: {}, pdf: { [resolution]: pdf } }
    ),
  clear: () => set({ ...empty })
}))

// Why here rather than in the dialog: an edit invalidates these whether or not anything is showing
// them, and the bytes should go back as soon as that happens, not the next time someone exports.
useDocumentStore.subscribe((state, previous) => {
  if (state.document !== previous.document && useExportBuildsStore.getState().source !== null) {
    useExportBuildsStore.getState().clear()
  }
})
