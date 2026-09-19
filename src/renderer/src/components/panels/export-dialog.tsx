import { useEffect, useState } from 'react'
import { assetsByteLength } from '@shared/canvas/document-assets'
import { fileNameStem } from '@shared/canvas/document-file'
import { collectFontUsage, embeddedFontBytes, fontFaceCss } from '@shared/canvas/font-embedding'
import { buildStandaloneHtml, estimateHtmlBytes, formatBytes } from '@shared/canvas/html-export'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { parseVideoSource } from '@shared/canvas/video-source'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import playerScript from '@/generated/player.iife.js?raw'
import { t, tn, type UiStringKey } from '@/i18n/ui-strings'
import {
  exportQualities,
  recompressDocumentAssets,
  type ExportQuality
} from '@/lib/export-image-recompress'
import { canEmbedFonts, subsetFonts } from '@/platform/font-embedding'
import { saveHtmlExport } from '@/platform/html-export-file'
import { reportError } from '@/platform/document-file-access'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { useExportDialogStore } from '@/store/modal-dialogs'

type Preview = {
  html: string
  bytes: number
  fontBytes: number
  fontCount: number
  quality: ExportQuality
  embedFonts: boolean
  source: CanvasDocument
}

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
  const [embedFonts, setEmbedFonts] = useState(true)
  const [built, setBuilt] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const fontUsage = collectFontUsage(document)
  const embedding = embedFonts && canEmbedFonts() && fontUsage.length > 0

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    void Promise.all([
      recompressDocumentAssets(document, quality),
      embedding ? subsetFonts(collectFontUsage(document)) : Promise.resolve([])
    ])
      .then(([prepared, fonts]) => {
        if (cancelled) {
          return
        }
        const html = buildStandaloneHtml({
          document: prepared,
          playerScript,
          ...(fonts.length > 0 ? { fontFaceCss: fontFaceCss(fonts) } : {})
        })
        setBuilt({
          html,
          bytes: estimateHtmlBytes(html),
          fontBytes: embeddedFontBytes(fonts),
          fontCount: fonts.length,
          quality,
          embedFonts: embedding,
          source: document
        })
      })
      .catch(reportError)
    return () => {
      cancelled = true
    }
  }, [open, quality, document, embedding])

  if (!open) {
    return null
  }
  // Why: derived, not reset in the effect — a stale build for another quality/document is "calculating".
  const preview =
    built &&
    built.quality === quality &&
    built.source === document &&
    built.embedFonts === embedding
      ? built
      : null
  const frameCount = orderedFrames(document).length
  const assetCount = Object.keys(document.assets).length
  const videos = Object.values(document.elements).filter((element) => element.type === 'video')
  const hasYouTube = videos.some(
    (video) => parseVideoSource(video.url, true)?.provider === 'youtube'
  )

  const save = async () => {
    if (!preview) {
      return
    }
    setBusy(true)
    try {
      await saveHtmlExport(preview.html, `${fileNameStem(document.name)}.html`)
      hide()
    } catch (error) {
      await reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalDialog label={t('export.dialog')} onClose={hide} className="w-96">
      <h2 className="text-sm font-semibold">{t('export.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('export.summary', {
          frames: tn('export.frames', frameCount),
          images: tn('export.images', assetCount),
          bytes: formatBytes(assetsByteLength(document))
        })}
      </p>
      {videos.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{t('video.exportLinked')}</p>
      )}
      {hasYouTube && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('video.exportYouTube', { provider: 'YouTube', format: 'HTML', protocol: 'HTTP(S)' })}
        </p>
      )}
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
      {fontUsage.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 text-xs" data-testid="export-fonts">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={embedFonts && canEmbedFonts()}
              disabled={!canEmbedFonts()}
              onChange={(event) => setEmbedFonts(event.target.checked)}
            />
            <span className="font-medium">
              {t('export.embedFonts', { fonts: tn('export.fonts', fontUsage.length) })}
            </span>
          </label>
          <p className="pl-5 text-muted-foreground">
            {canEmbedFonts() ? t('export.embedFontsHint') : t('export.embedFontsUnavailable')}
          </p>
        </div>
      )}
      <div className="mt-3 text-xs" data-testid="export-size">
        {t('export.estimatedSize')}{' '}
        <span className="font-medium tabular-nums">
          {preview ? formatBytes(preview.bytes) : t('export.calculating')}
        </span>
        {preview && preview.fontCount > 0 && (
          <span className="ml-1 text-muted-foreground">
            {t('export.fontsIncluded', {
              fonts: tn('export.fonts', preview.fontCount),
              bytes: formatBytes(preview.fontBytes)
            })}
          </span>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <TextButton variant="ghost" onClick={hide}>
          {t('export.cancel')}
        </TextButton>
        <TextButton variant="primary" disabled={!preview || busy} onClick={() => void save()}>
          {t('export.confirm')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}
