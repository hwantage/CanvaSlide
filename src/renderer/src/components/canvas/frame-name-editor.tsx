import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { FrameElement as FrameElementModel } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { FRAME_TITLE_FONT_PX } from '@/lib/frame-chrome'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'

/** Inline rename in the title strip: Enter/blur commit, Escape cancels, empty names are ignored. */
export function FrameNameEditor({ frame }: { frame: FrameElementModel }) {
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
