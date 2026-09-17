import { RotateCcw, X } from 'lucide-react'
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
  const exit = usePresentationStore((s) => s.exit)
  const document = useDocumentStore(selectDocument)
  if (previewFrameId === null) {
    return null
  }
  // Why: the deck can be reordered or the frame deleted while the preview is parked.
  const element = document.elements[previewFrameId]
  const frame = element?.type === 'frame' ? element : undefined
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
      <IconButton
        label={t('preview.replay')}
        className="h-7 w-7"
        disabled={!frame}
        onClick={() => previewTransition(previewFrameId)}
      >
        <RotateCcw size={14} />
      </IconButton>
      <IconButton label={t('preview.close')} className="h-7 w-7" onClick={exit}>
        <X size={14} />
      </IconButton>
    </div>
  )
}
