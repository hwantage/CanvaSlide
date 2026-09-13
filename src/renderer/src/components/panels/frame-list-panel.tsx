import { Play } from 'lucide-react'
import { useState, type DragEvent, type KeyboardEvent } from 'react'
import { elementRect } from '@shared/canvas/element-bounds'
import type { FrameElement } from '@shared/canvas/element-types'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

const DRAG_TYPE = 'application/x-canvaslide-frame'

function FrameName({ frame }: { frame: FrameElement }) {
  const [draft, setDraft] = useState<string | null>(null)
  const patchElements = useDocumentStore((s) => s.patchElements)
  const commit = () => {
    if (draft !== null && draft.trim() !== '' && draft !== frame.name) {
      patchElements([frame.id], { name: draft.trim() })
    }
    setDraft(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
    } else if (event.key === 'Escape') {
      setDraft(null)
    }
    event.stopPropagation()
  }
  if (draft === null) {
    return (
      <span
        className="truncate"
        title={t('frames.renameHint')}
        onDoubleClick={() => setDraft(frame.name)}
      >
        {frame.name}
      </span>
    )
  }
  return (
    <input
      autoFocus
      aria-label={t('frames.name')}
      className={`${inputClass} h-7 w-full`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onFocus={(event) => event.target.select()}
    />
  )
}

export function FrameListPanel() {
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const setSelection = useDocumentStore((s) => s.setSelection)
  const moveFrameTo = useDocumentStore((s) => s.moveFrameTo)
  const fitRect = useCameraStore((s) => s.fitRect)
  const startPresentation = usePresentationStore((s) => s.start)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const frames = orderedFrames(document)

  // Why: one click both highlights the frame on the canvas and brings it into view.
  const focusFrame = (frame: FrameElement) => {
    setSelection([frame.id])
    fitRect(elementRect(frame))
  }

  const onDragStart = (event: DragEvent, id: string) => {
    event.dataTransfer.setData(DRAG_TYPE, id)
    event.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (event: DragEvent, index: number) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }
  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault()
    const id = event.dataTransfer.getData(DRAG_TYPE)
    setDropIndex(null)
    if (id) {
      moveFrameTo(id, index)
    }
  }

  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('frames.title')}
      </h2>
      {frames.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">{t('frames.empty')}</p>
      )}
      <ol className="flex flex-col gap-1" onDragLeave={() => setDropIndex(null)}>
        {frames.map((frame, index) => {
          const selected = selectedIds.includes(frame.id)
          return (
            <li
              key={frame.id}
              draggable
              data-current={selected}
              data-testid="frame-row"
              onDragStart={(event) => onDragStart(event, frame.id)}
              onDragOver={(event) => onDragOver(event, index)}
              onDrop={(event) => onDrop(event, index)}
              onDragEnd={() => setDropIndex(null)}
              className={`group flex h-8 items-center gap-1 rounded-md px-2 text-xs ${
                selected ? 'bg-accent' : 'hover:bg-accent/60'
              } ${dropIndex === index ? 'ring-1 ring-selection' : ''}`}
            >
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => focusFrame(frame)}
              >
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <FrameName frame={frame} />
              </button>
              <IconButton
                label={t('present.fromFrame')}
                className="h-6 w-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => startPresentation(index)}
              >
                <Play size={12} />
              </IconButton>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
