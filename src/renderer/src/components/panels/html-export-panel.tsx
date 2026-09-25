import { useEffect, useState } from 'react'
import { assetsByteLength } from '@shared/canvas/document-assets'
import { fileNameStem } from '@shared/canvas/document-file'
import { collectFontUsage, embeddedFontBytes, fontFaceCss } from '@shared/canvas/font-embedding'
import { buildStandaloneHtml, estimateHtmlBytes, formatBytes } from '@shared/canvas/html-export'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { parseVideoSource } from '@shared/canvas/video-source'
import playerScript from '@/generated/player.iife.js?raw'
import { t, tn, type UiStringKey } from '@/i18n/ui-strings'
import {
  exportQualities,
  recompressDocumentAssets,
  type ExportQuality
} from '@/lib/raster/export-image-recompress'
import { canEmbedFonts, subsetFonts } from '@/platform/font-embedding'
import { saveHtmlExport } from '@/platform/html-export-file'
import { reportError } from '@/platform/document-file-access'
import { htmlBuildKey, useExportBuildsStore, type HtmlBuild } from '@/store/export-builds-store'
import { ExportActions } from './export-actions'

const qualityLabels: Record<ExportQuality, { label: UiStringKey; hint: UiStringKey }> = {
  original: { label: 'export.html.quality.original', hint: 'export.html.quality.originalHint' },
  balanced: { label: 'export.html.quality.balanced', hint: 'export.html.quality.balancedHint' },
  small: { label: 'export.html.quality.small', hint: 'export.html.quality.smallHint' }
}

/** Pick image quality, see the resulting size, save one self-contained HTML. */
export function HtmlExportPanel({
  document,
  onClose
}: {
  document: CanvasDocument
  onClose: () => void
}) {
  const [quality, setQuality] = useState<ExportQuality>('balanced')
  const [embedFonts, setEmbedFonts] = useState(true)
  const [busy, setBusy] = useState(false)
  const fontUsage = collectFontUsage(document)
  const embedding = embedFonts && canEmbedFonts() && fontUsage.length > 0
  const key = htmlBuildKey(quality, embedding)
  // Why held outside this component: a combination already assembled is one the panel should not
  // build again, whether the user is stepping between qualities or reopening the dialog.
  const preview = useExportBuildsStore((s) => (s.source === document ? s.html[key] : undefined))
  const remember = useExportBuildsStore((s) => s.rememberHtml)

  useEffect(() => {
    if (preview) {
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
        const entry: HtmlBuild = {
          html,
          bytes: estimateHtmlBytes(html),
          fontBytes: embeddedFontBytes(fonts),
          fontCount: fonts.length
        }
        remember(document, key, entry)
      })
      .catch(reportError)
    return () => {
      cancelled = true
    }
  }, [preview, key, quality, document, embedding, remember])

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
        {t('export.html.summary', {
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
        <legend className="mb-1 text-xs font-medium">{t('export.html.imageQuality')}</legend>
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
              {t('export.html.embedFonts', { fonts: tn('export.html.fonts', fontUsage.length) })}
            </span>
          </label>
          <p className="pl-5 text-muted-foreground">
            {canEmbedFonts()
              ? t('export.html.embedFontsHint')
              : t('export.html.embedFontsUnavailable')}
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
            {t('export.html.fontsIncluded', {
              fonts: tn('export.html.fonts', preview.fontCount),
              bytes: formatBytes(preview.fontBytes)
            })}
          </span>
        )}
      </div>
      <ExportActions disabled={!preview || busy} onCancel={onClose} onExport={() => void save()} />
    </>
  )
}
