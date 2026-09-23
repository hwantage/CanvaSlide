import { useCallback, useEffect, useRef } from 'react'
import type { TextElement as TextElementModel } from '@shared/canvas/element-types'
import { removeElements } from '@shared/canvas/document-mutations'
import { rotationTransform } from '@shared/canvas/element-rotation'
import { textClipPath } from '@shared/canvas/text-clip'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'
import { EditableText } from './editable-text'

export function TextElement({ element, editing }: { element: TextElementModel; editing: boolean }) {
  const onHeightChange = useCallback(
    (height: number) => {
      if (height !== element.height) {
        useDocumentStore.getState().syncTextHeight(element.id, height)
      }
    },
    [element.id, element.height]
  )
  // Why: track the true→false transition explicitly; effect cleanups also fire on StrictMode
  // double-mount, which would wrongly delete a freshly created text element.
  const wasEditing = useRef(editing)
  useEffect(() => {
    if (wasEditing.current && !editing) {
      const latest = useDocumentStore.getState().document.elements[element.id]
      if (latest?.type === 'text' && latest.text.trim() === '') {
        useDocumentStore.getState().applyEdit((d) => removeElements(d, [element.id]))
      }
    }
    wasEditing.current = editing
  }, [editing, element.id])
  return (
    <div
      className="absolute"
      data-element-id={element.id}
      data-element-type="text"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        minHeight: element.height,
        transform: rotationTransform(element.rotation),
        // Why: while typing, text outgrows its stored height; keep the pivot geometry uses.
        transformOrigin: element.rotation
          ? `${element.width / 2}px ${element.height / 2}px`
          : undefined,
        clipPath: editing ? undefined : textClipPath(element.clip)
      }}
    >
      <EditableText
        elementId={element.id}
        text={element.text}
        style={element.textStyle}
        editing={editing}
        placeholder={t('text.placeholder')}
        onHeightChange={onHeightChange}
      />
    </div>
  )
}
