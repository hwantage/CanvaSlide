import { Gauge, Lightbulb, Play, Spline, Square, Timer } from 'lucide-react'
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { elementRect } from '@shared/canvas/element-bounds'
import type { DocumentSettings, FrameElement } from '@shared/canvas/element-types'
import { gapAtPointer } from '@shared/canvas/list-drop-gap'
import { frameIndexById, gapToIndex, orderedFrames } from '@shared/canvas/presentation-sequence'
import {
  frameMotionDiff,
  resolveFrameTransition,
  type MotionField
} from '@shared/canvas/frame-transition'
import { useDragAutoScroll } from '@/hooks/use-drag-auto-scroll'
import { inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { motionSummary } from '@/lib/motion-presets'
import { useCameraStore } from '@/store/camera-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

const DRAG_TYPE = 'application/x-canvaslide-frame'

const motionIcons: Record<MotionField, ReactNode> = {
  ms: <Timer size={11} />,
  easing: <Gauge size={11} />,
  arc: <Spline size={11} />,
  // Why: a tilted square says tilt; a circular arrow reads as undo or refresh.
  roll: <Square size={11} className="rotate-[18deg]" />,
  spotlight: <Lightbulb size={11} />
}

/**
 * A mark per part of this frame's flight that will not look like the rest of the deck. Most rows
 * stay empty, which is the point: the contrast is what says "something was directed here", and the
 * icons say what, in a row that has no space for a number.
 */
function MotionMarks({ frame, settings }: { frame: FrameElement; settings: DocumentSettings }) {
  const fields = frameMotionDiff(frame, settings)
  if (fields.length === 0) {
    return null
  }
  const summary = motionSummary(fields, resolveFrameTransition(frame, settings))
  return (
    <span
      role="img"
      data-testid="frame-motion-marks"
      title={`${t('motion.marks')} — ${summary}`}
      aria-label={`${t('motion.marks')} — ${summary}`}
      className="flex shrink-0 items-center gap-0.5 text-muted-foreground"
    >
      {fields.map((field) => (
        <span key={field} aria-hidden className="flex">
          {motionIcons[field]}
        </span>
      ))}
    </span>
  )
}

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
    // Why: the whole gap up to the marks is the rename target, not just the glyphs.
    return (
      <span
        className="min-w-0 flex-1 truncate"
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
      className={`${inputClass} h-6 min-w-0 flex-1`}
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
  /** Gap 0..n between rows where the dragged frame would land; null while not dragging. */
  const [dropGap, setDropGap] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const frames = orderedFrames(document)

  // Why: one click both highlights the frame on the canvas and brings it into view.
  const focusFrame = (frame: FrameElement) => {
    // Why: picking a frame is an editing move, so a parked preview lets go of the camera first
    // instead of holding the roll and dimming over wherever the list sends it.
    usePresentationStore.getState().cancelPreview()
    setSelection([frame.id])
    fitRect(elementRect(frame))
  }

  const listRef = useRef<HTMLOListElement>(null)
  const scrollPane = useCallback(
    () => listRef.current?.closest<HTMLElement>('[data-scroll-pane]') ?? null,
    []
  )
  useDragAutoScroll(dragging !== null, scrollPane)

  const onDragStart = (event: DragEvent, id: string, index: number) => {
    event.dataTransfer.setData(DRAG_TYPE, id)
    event.dataTransfer.effectAllowed = 'move'
    setDragging(index)
  }
  const endDrag = () => {
    setDropGap(null)
    setDragging(null)
  }
  // Why: the drop target is a gap between rows, chosen from the pointer's position against every
  // row's midpoint, so the heading, the padding and the space below the list all work too.
  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rows = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-testid="frame-row"]') ?? [])
    ]
    const midpoints = rows.map((row) => {
      const rect = row.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
    setDropGap(gapAtPointer(midpoints, event.clientY))
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData(DRAG_TYPE)
    const gap = dropGap
    endDrag()
    if (id && gap !== null) {
      const from = frameIndexById(frames, id)
      if (from !== -1) {
        moveFrameTo(id, gapToIndex(from, gap))
      }
    }
  }
  const draggedGapHidden = (gap: number) => {
    // Why: the gaps right around the dragged row are no-ops; showing a line there is misleading.
    if (dragging === null) {
      return false
    }
    return gap === dragging || gap === dragging + 1
  }
  const gapLine = (gap: number, edge: 'top' | 'bottom') =>
    dropGap === gap && !draggedGapHidden(gap) ? (
      <span
        data-testid="frame-drop-indicator"
        className={`pointer-events-none absolute left-1 right-1 h-0.5 rounded-full bg-selection ${
          edge === 'top' ? '-top-[3px]' : '-bottom-[3px]'
        }`}
      />
    ) : null

  return (
    <section
      className="flex min-h-full flex-col gap-1"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(event) => {
        // Why: leaving the whole section (not a child) hides the line; dragend also clears it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropGap(null)
        }
      }}
    >
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('frames.title')}
      </h2>
      {frames.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">{t('frames.empty')}</p>
      )}
      <ol ref={listRef} className="flex flex-col gap-1 pb-2">
        {frames.map((frame, index) => {
          const selected = selectedIds.includes(frame.id)
          return (
            <li
              key={frame.id}
              draggable
              data-current={selected}
              data-testid="frame-row"
              onDragStart={(event) => onDragStart(event, frame.id, index)}
              onDragEnd={endDrag}
              className={`group relative flex h-8 items-center gap-1 rounded-md px-2 text-xs ${
                selected ? 'bg-accent' : 'hover:bg-accent/60'
              } ${dragging === index ? 'opacity-50' : ''}`}
            >
              {gapLine(index, 'top')}
              {index === frames.length - 1 && gapLine(frames.length, 'bottom')}
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => focusFrame(frame)}
              >
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <FrameName frame={frame} />
                <MotionMarks frame={frame} settings={document.settings} />
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
