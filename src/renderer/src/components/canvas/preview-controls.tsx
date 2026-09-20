import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'
import { selectedFrameIds, stepSelectedFrame } from '@shared/canvas/frame-selection'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { selectPreviewFrameId, usePresentationStore } from '@/store/presentation-store'

/**
 * The preview's own controls. It stops on the frame it flew into instead of snapping back, so the
 * author can change a value in the panel behind and play the same flight again.
 */
export function PreviewControls() {
  const previewFrameId = usePresentationStore(selectPreviewFrameId)
  const previewTransition = usePresentationStore((s) => s.previewTransition)
  const previewFrameIds = usePresentationStore((s) => s.previewFrameIds)
  const next = usePresentationStore((s) => s.next)
  const previous = usePresentationStore((s) => s.previous)
  const exit = usePresentationStore((s) => s.exit)
  const document = useDocumentStore(selectDocument)
  if (previewFrameId === null) {
    return null
  }
  // Why: the deck can be reordered or the frame deleted while the preview is parked.
  const element = document.elements[previewFrameId]
  const frame = element?.type === 'frame' ? element : undefined
  const ids = selectedFrameIds(document, previewFrameIds)
  return (
    <div
      data-canvas-ui
      data-testid="preview-controls"
      className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-border bg-popover/90 py-1 pl-3 pr-1 text-xs text-popover-foreground shadow-lg backdrop-blur"
    >
      <span className="max-w-40 truncate text-muted-foreground">
        {t('preview.title')}
        {frame ? ` · ${frame.name}` : ''}
      </span>
      {ids.length > 1 && (
        <>
          <span className="px-1 text-muted-foreground tabular-nums">
            {Math.max(0, ids.indexOf(previewFrameId) + 1)} / {ids.length}
          </span>
          <IconButton
            label={t('preview.previous')}
            className="h-7 w-7 rounded-full"
            disabled={!stepSelectedFrame(ids, previewFrameId, -1)}
            onClick={previous}
          >
            <ChevronLeft size={14} />
          </IconButton>
          <IconButton
            label={t('preview.next')}
            className="h-7 w-7 rounded-full"
            disabled={!stepSelectedFrame(ids, previewFrameId, 1)}
            onClick={next}
          >
            <ChevronRight size={14} />
          </IconButton>
        </>
      )}
      <IconButton
        label={t('preview.replay')}
        className="h-7 w-7 rounded-full"
        disabled={!frame}
        onClick={() => previewTransition(previewFrameId, previewFrameIds)}
      >
        <RotateCcw size={14} />
      </IconButton>
      <IconButton label={t('preview.close')} className="h-7 w-7 rounded-full" onClick={exit}>
        <X size={14} />
      </IconButton>
    </div>
  )
}
