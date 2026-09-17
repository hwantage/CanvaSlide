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
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <div
        data-canvas-ui
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover/90 px-2 py-1 text-popover-foreground shadow-lg backdrop-blur"
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
        <span
          data-testid="presentation-counter"
          className="min-w-24 px-2 text-center text-xs tabular-nums"
        >
          {index + 1} / {frames.length}
          <span className="ml-2 text-muted-foreground">{current?.name}</span>
        </span>
        <IconButton
          label={`${t('present.next')} (→)`}
          onClick={next}
          disabled={index >= frames.length - 1}
        >
          <ChevronRight size={16} />
        </IconButton>
        <IconButton label={`${t('present.exit')} (Esc)`} onClick={exit}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  )
}
