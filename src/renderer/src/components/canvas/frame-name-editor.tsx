import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from 'react'
import type { FrameElement as FrameElementModel } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'

type FrameNameEditorProps = {
  frame: FrameElementModel
  /** The editor is done, committed or cancelled; the owner takes it down. */
  onFinish: () => void
  className: string
  style?: CSSProperties
}

export function FrameNameEditor({ frame, onFinish, className, style }: FrameNameEditorProps) {
  const session = useDocumentStore((s) => s.session)
  const startedSession = useRef(session)
  const [draft, setDraft] = useState(frame.name)
  const draftRef = useRef(frame.name)
  const commit = useCallback(() => {
    const store = useDocumentStore.getState()
    // Why: reopening a document may reuse frame ids, but must never inherit an old draft.
    if (store.session !== startedSession.current) {
      return
    }
    const current = store.document.elements[frame.id]
    const next = draftRef.current.trim()
    if (current?.type === 'frame' && next !== '' && next !== current.name) {
      useDocumentStore.getState().patchElements([frame.id], { name: next })
    }
  }, [frame.id])
  // Why: clicking elsewhere can unmount the editor before blur fires.
  useEffect(() => commit, [commit])
  useEffect(() => {
    if (session !== startedSession.current) {
      onFinish()
    }
  }, [session, onFinish])
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      commit()
      onFinish()
    } else if (event.key === 'Escape') {
      draftRef.current = frame.name
      onFinish()
    }
  }
  return (
    <input
      autoFocus
      aria-label={t('frames.name')}
      data-testid="frame-name-editor"
      className={className}
      style={style}
      value={draft}
      onChange={(event) => {
        draftRef.current = event.target.value
        setDraft(event.target.value)
      }}
      onFocus={(event) => event.target.select()}
      onBlur={() => {
        commit()
        onFinish()
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
