import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { FrameElement as FrameElementModel } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { FRAME_TITLE_FONT_PX, FRAME_TITLE_HEIGHT_PX } from '@/lib/frame-chrome'
import { selectZoom, useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'
import { useToolStore } from '@/store/tool-store'

/** Inline rename in the title strip: Enter/blur commit, Escape cancels, empty names are ignored. */
function FrameNameEditor({ frame }: { frame: FrameElementModel }) {
  const [draft, setDraft] = useState(frame.name)
  const draftRef = useRef(frame.name)
  const commit = useCallback(() => {
    const current = useDocumentStore.getState().document.elements[frame.id]
    const next = draftRef.current.trim()
    if (current?.type === 'frame' && next !== '' && next !== current.name) {
      useDocumentStore.getState().patchElements([frame.id], { name: next })
    }
  }, [frame.id])
  const finish = () => {
    if (useToolStore.getState().editingTextId === frame.id) {
      useToolStore.getState().setEditingTextId(null)
    }
  }
  // Why: clicking elsewhere unmounts the editor before blur fires; commit on the way out too.
  useEffect(() => commit, [commit])
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      commit()
      finish()
    } else if (event.key === 'Escape') {
      draftRef.current = frame.name
      finish()
    }
  }
  return (
    <input
      autoFocus
      aria-label={t('frames.name')}
      data-testid="frame-name-editor"
      className="h-5 min-w-24 rounded border border-input bg-background px-1 text-foreground outline-none ring-2 ring-ring"
      style={{ fontSize: FRAME_TITLE_FONT_PX, pointerEvents: 'auto' }}
      value={draft}
      onChange={(event) => {
        draftRef.current = event.target.value
        setDraft(event.target.value)
      }}
      onFocus={(event) => event.target.select()}
      onBlur={() => {
        commit()
        finish()
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}

export function FrameElement({
  element,
  index,
  selected,
  editing
}: {
  element: FrameElementModel
  index: number
  selected: boolean
  editing: boolean
}) {
  const zoom = useCameraStore(selectZoom)
  const presenting = usePresentationStore(selectPresentationActive)
  const borderStyle = useDocumentStore((s) => s.document.settings.frameBorder)
  // Why: frame chrome is scaled inversely so labels stay readable at any zoom.
  const inverse = 1 / zoom
  return (
    <div
      className="absolute"
      data-element-id={element.id}
      data-element-type="frame"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    >
      {!presenting && (
        <div
          className="absolute left-0 flex items-center gap-1.5 whitespace-nowrap text-frame-label"
          style={{
            bottom: '100%',
            height: FRAME_TITLE_HEIGHT_PX,
            fontSize: FRAME_TITLE_FONT_PX,
            zoom: inverse,
            // Why: frames paint beneath content, but a frame smaller than the object it sits
            // under must still show its number and name, so the strip rises above the content.
            zIndex: 2
          }}
        >
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-frame-label px-1 font-semibold text-white">
            {index + 1}
          </span>
          {editing ? (
            <FrameNameEditor key={element.id} frame={element} />
          ) : (
            <span className="font-medium">{element.name}</span>
          )}
        </div>
      )}
      <div className="absolute inset-0 rounded-sm bg-white/60" />
      <div
        data-testid="frame-outline"
        className="absolute inset-0 rounded-sm"
        style={{
          // Why: a border (not box-shadow) so the dashed style is possible; width is 1 screen px.
          // The outline sits above content (the fill stays beneath) so a frame hidden under a
          // larger object still shows where it is.
          zIndex: 1,
          borderWidth:
            presenting || (borderStyle === 'none' && !selected) ? 0 : (selected ? 2 : 1) * inverse,
          borderStyle: selected ? 'solid' : borderStyle,
          borderColor: selected ? 'var(--frame-selected)' : 'var(--frame-stroke)'
        }}
      />
    </div>
  )
}
