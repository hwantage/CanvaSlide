import { useEffect, useState } from 'react'
import { focusOnMount } from '@/lib/focus-on-mount'
import { assetsByteLength } from '@shared/canvas/document-assets'
import { buildStandaloneHtml, estimateHtmlBytes, formatBytes } from '@shared/canvas/html-export'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { TextButton } from '@/components/ui/text-button'
import playerScript from '@/generated/player.iife.js?raw'
import { t, tn, type UiStringKey } from '@/i18n/ui-strings'
import {
  exportQualities,
  recompressDocumentAssets,
  type ExportQuality
} from '@/lib/export-image-recompress'
import { saveHtmlExport } from '@/platform/html-export-file'
import { showErrorMessage } from '@/platform/document-file-access'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { useExportDialogStore } from '@/store/export-dialog-store'

type Preview = { html: string; bytes: number; quality: ExportQuality; source: CanvasDocument }

const qualityLabels: Record<ExportQuality, { label: UiStringKey; hint: UiStringKey }> = {
  original: { label: 'export.quality.original', hint: 'export.quality.originalHint' },
  balanced: { label: 'export.quality.balanced', hint: 'export.quality.balancedHint' },
  small: { label: 'export.quality.small', hint: 'export.quality.smallHint' }
}

/** Modal: pick image quality, see the resulting size, save one self-contained HTML. */
export function ExportDialog() {
  const open = useExportDialogStore((s) => s.open)
  const hide = useExportDialogStore((s) => s.hide)
  const document = useDocumentStore(selectDocument)
  const [quality, setQuality] = useState<ExportQuality>('balanced')
  const [built, setBuilt] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    void recompressDocumentAssets(document, quality)
      .then((prepared) => {
        if (cancelled) {
          return
        }
        const html = buildStandaloneHtml({ document: prepared, playerScript })
        setBuilt({ html, bytes: estimateHtmlBytes(html), quality, source: document })
      })
      .catch((error: unknown) =>
        showErrorMessage(error instanceof Error ? error.message : String(error))
      )
    return () => {
      cancelled = true
    }
  }, [open, quality, document])

  if (!open) {
    return null
  }
  // Why: derived, not reset in the effect — a stale build for another quality/document is "calculating".
  const preview = built && built.quality === quality && built.source === document ? built : null
  const frameCount = orderedFrames(document).length
  const assetCount = Object.keys(document.assets).length

  const save = async () => {
    if (!preview) {
      return
    }
    setBusy(true)
    try {
      await saveHtmlExport(preview.html, `${document.name.trim() || 'Untitled'}.html`)
      hide()
    } catch (error) {
      await showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t('export.dialog')}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={hide}
    >
      <div
        className="w-96 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        ref={focusOnMount}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">{t('export.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('export.summary', {
            frames: tn('export.frames', frameCount),
            images: tn('export.images', assetCount),
            bytes: formatBytes(assetsByteLength(document))
          })}
        </p>
        <fieldset className="mt-3 flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium">{t('export.imageQuality')}</legend>
          {exportQualities.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="export-quality"
                value={value}
                checked={quality === value}
                onChange={() => setQuality(value)}
              />
              <span className="font-medium">{t(qualityLabels[value].label)}</span>
              <span className="text-muted-foreground">{t(qualityLabels[value].hint)}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3 text-xs" data-testid="export-size">
          {t('export.estimatedSize')}{' '}
          <span className="font-medium tabular-nums">
            {preview ? formatBytes(preview.bytes) : t('export.calculating')}
          </span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <TextButton variant="ghost" onClick={hide}>
            {t('export.cancel')}
          </TextButton>
          <TextButton variant="primary" disabled={!preview || busy} onClick={() => void save()}>
            {t('export.confirm')}
          </TextButton>
        </div>
      </div>
    </div>
  )
}
