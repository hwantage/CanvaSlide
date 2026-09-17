import { ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { selectPreviewing, usePresentationStore } from '@/store/presentation-store'

export function PresentationOverlay() {
  const active = usePresentationStore((s) => s.active)
  // Why: a preview is one flight long; nav controls would outlive it and invite a stray click.
  const previewing = usePresentationStore(selectPreviewing)
  const index = usePresentationStore((s) => s.index)
  const next = usePresentationStore((s) => s.next)
  const previous = usePresentationStore((s) => s.previous)
  const exit = usePresentationStore((s) => s.exit)
  const overview = usePresentationStore((s) => s.overview)
  const toggleOverview = usePresentationStore((s) => s.toggleOverview)
  const document = useDocumentStore(selectDocument)
  if (!active || previewing) {
    return null
  }
  const frames = orderedFrames(document)
  const current = frames[index]
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4">
      {/* Why: anchors the arrow pair at the viewport centre; 19.5 spacing = px-2 + overview + gap + half the arrow pair, plus the 1px border. */}
      <div
        data-canvas-ui
        data-testid="presentation-controls"
        className="pointer-events-auto absolute bottom-0 left-1/2 flex -translate-x-[calc(var(--spacing)*19.5+1px)] items-center gap-1 rounded-full border border-border bg-popover/90 px-2 py-1 text-popover-foreground shadow-lg backdrop-blur"
      >
        <IconButton
          label={`${t('present.overview')} (O)`}
          active={overview}
          onClick={toggleOverview}
        >
          <LayoutGrid size={16} />
        </IconButton>
        <IconButton
          label={`${t('present.previous')} (←)`}
          onClick={previous}
          disabled={index === 0}
        >
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton
          label={`${t('present.next')} (→)`}
          onClick={next}
          disabled={index >= frames.length - 1}
        >
          <ChevronRight size={16} />
        </IconButton>
        <span
          data-testid="presentation-counter"
          className="flex min-w-0 items-center px-2 text-xs tabular-nums"
        >
          {index + 1} / {frames.length}
          <span className="ml-2 max-w-48 truncate text-muted-foreground" title={current?.name}>
            {current?.name}
          </span>
        </span>
        <IconButton label={`${t('present.exit')} (Esc)`} onClick={exit}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  )
}
