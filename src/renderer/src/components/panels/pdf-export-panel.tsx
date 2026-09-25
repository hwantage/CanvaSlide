import { useEffect, useState } from 'react'
import { fileNameStem } from '@shared/canvas/document-file'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { formatBytes } from '@shared/canvas/html-export'
import { pdfResolutions, type PdfResolution } from '@shared/pdf/pdf-export-pages'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { t, tn, type UiStringKey } from '@/i18n/ui-strings'
import { savePdfExport } from '@/platform/pdf-export-file'
import { reportError } from '@/platform/document-file-access'
import { useExportBuildsStore } from '@/store/export-builds-store'
import { ExportActions } from './export-actions'

const resolutionLabels: Record<PdfResolution, { label: UiStringKey; hint: UiStringKey }> = {
  high: { label: 'export.pdf.resolution.high', hint: 'export.pdf.resolution.highHint' },
  medium: { label: 'export.pdf.resolution.medium', hint: 'export.pdf.resolution.mediumHint' },
  low: { label: 'export.pdf.resolution.low', hint: 'export.pdf.resolution.lowHint' }
}

/**
 * Pick a page resolution, see what the file comes to, save one PDF.
 *
 * Like the HTML panel, this builds the file to show its size and then saves the bytes it already
 * holds, so the size is measured rather than guessed and pressing Export costs nothing. Why the
 * whole PDF path sits behind `import()`: rasterising pages pulls in the export player's DOM
 * renderer, which no one editing a canvas needs loaded.
 */
export function PdfExportPanel({
  document,
  onClose
}: {
  document: CanvasDocument
  onClose: () => void
}) {
  const [resolution, setResolution] = useState<PdfResolution>('medium')
  // Why keyed by resolution, and why outside this component: comparing the three is the whole point
  // of the control, each costs a full render of the deck, and closing the dialog should not waste them.
  const preview = useExportBuildsStore((s) =>
    s.source === document ? s.pdf[resolution] : undefined
  )
  const remember = useExportBuildsStore((s) => s.rememberPdf)
  // Why the resolution rides along: a render that is still reporting pages for the setting the
  // user just moved off would otherwise show its count under the new one.
  const [progress, setProgress] = useState<{
    done: number
    total: number
    resolution: PdfResolution
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const pageCount = orderedFrames(document).length

  useEffect(() => {
    if (pageCount === 0 || preview) {
      return
    }
    const controller = new AbortController()
    void import('@/lib/raster/pdf-export')
      .then(({ buildPdfExport }) =>
        buildPdfExport({
          document,
          resolution,
          createdAt: new Date(),
          signal: controller.signal,
          onPage: (done, total) => {
            if (!controller.signal.aborted) {
              setProgress({ done, total, resolution })
            }
          }
        })
      )
      .then((pdf) => {
        if (!controller.signal.aborted) {
          remember(document, resolution, pdf)
          setProgress(null)
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProgress(null)
          void reportError(error)
        }
      })
    // Leaving the dialog, or changing resolution, drops the pages still being rendered for it.
    return () => controller.abort()
  }, [pageCount, document, resolution, preview, remember])

  const rendering = progress?.resolution === resolution ? progress : null
  const assetCount = Object.keys(document.assets).length
  const hasVideo = Object.values(document.elements).some((element) => element.type === 'video')

  const save = async () => {
    if (!preview) {
      return
    }
    setBusy(true)
    try {
      await savePdfExport(preview, `${fileNameStem(document.name)}.pdf`)
      onClose()
    } catch (error) {
      await reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('export.pdf.summary', {
          pages: tn('export.pdf.pages', pageCount),
          images: tn('export.images', assetCount)
        })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t('export.pdf.pageText')}</p>
      {hasVideo && <p className="mt-2 text-xs text-muted-foreground">{t('export.pdf.videos')}</p>}
      <fieldset className="mt-3 flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-medium">{t('export.pdf.resolution')}</legend>
        {pdfResolutions.map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              name="export-pdf-resolution"
              value={value}
              checked={resolution === value}
              onChange={() => setResolution(value)}
            />
            <span className="font-medium">{t(resolutionLabels[value].label)}</span>
            <span className="text-muted-foreground">{t(resolutionLabels[value].hint)}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 text-xs" data-testid="export-size">
        {t('export.estimatedSize')}{' '}
        <span className="font-medium tabular-nums">
          {preview
            ? formatBytes(preview.length)
            : rendering
              ? t('export.pdf.rendering', { done: rendering.done, total: rendering.total })
              : t('export.calculating')}
        </span>
      </div>
      {pageCount === 0 && <p className="mt-2 text-xs text-destructive">{t('export.pdf.empty')}</p>}
      <ExportActions disabled={!preview || busy} onCancel={onClose} onExport={() => void save()} />
    </>
  )
}
