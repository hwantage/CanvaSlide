import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setTextLink } from '@shared/canvas/document-mutations'
import { normalizeWebLink } from '@shared/canvas/text-links'
import { FieldRow, inputBaseClass } from '@/components/ui/field-row'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'

type Draft = { text: string; over: string | undefined; invalid: boolean }

const draftOf = (link: string | undefined): Draft => ({
  text: link ?? '',
  over: link,
  invalid: false
})

/** What committing `text` typed over `link` stores; an untouched field keeps a link as written. */
function committedLink(
  text: string,
  link: string | undefined
): { link: string | undefined } | 'unchanged' | 'invalid' {
  if (text === (link ?? '')) {
    return 'unchanged'
  }
  if (text.trim() === '') {
    return { link: undefined }
  }
  const next = normalizeWebLink(text)
  return next === null ? 'invalid' : { link: next }
}

function store(id: string, link: string | undefined, session: number) {
  const current = useDocumentStore.getState()
  // Why: a replacement can reuse element ids, but must never inherit the old document's draft.
  if (current.session !== session) {
    return
  }
  current.applyEdit((document) => setTextLink(document, id, link))
}

/** A text element's own link: typed and checked when committed; clearing the field removes it. */
export function TextLinkField({ id, link }: { id: string; link: string | undefined }) {
  const startedSession = useRef(useDocumentStore.getState().session)
  // Why: a draft belongs to the link it was typed over; once undo or redo changes that link, the
  // draft is dropped rather than kept for when the same link comes back.
  const [state, setDraft] = useState(() => draftOf(link))
  if (state.over !== link) {
    setDraft(draftOf(link))
  }
  const draft = state.over === link ? state : draftOf(link)
  const apply = (next: string | undefined) => {
    store(id, next, startedSession.current)
    setDraft(draftOf(next))
  }
  const commit = () => {
    const result = committedLink(draft.text, link)
    if (result === 'invalid') {
      setDraft({ ...draft, invalid: true })
    } else if (result !== 'unchanged') {
      apply(result.link)
    }
  }
  // Why: selecting another element unmounts the field before its blur, which must not lose a link.
  const latest = useRef({ text: draft.text, link })
  useLayoutEffect(() => {
    latest.current = { text: draft.text, link }
  })
  useEffect(
    () => () => {
      const result = committedLink(latest.current.text, latest.current.link)
      if (typeof result === 'object') {
        store(id, result.link, startedSession.current)
      }
    },
    [id]
  )
  return (
    <>
      <FieldRow label={t('props.link')}>
        <input
          type="text"
          inputMode="url"
          aria-label={t('props.link')}
          aria-invalid={draft.invalid}
          placeholder="https://…"
          className={`${inputBaseClass} w-36 ${draft.invalid ? 'border-destructive' : 'border-input'}`}
          value={draft.text}
          onChange={(event) => setDraft({ ...draft, text: event.target.value, invalid: false })}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              setDraft(draftOf(link))
            }
          }}
        />
      </FieldRow>
      {draft.invalid && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {t('props.link.invalid')}
        </p>
      )}
    </>
  )
}
