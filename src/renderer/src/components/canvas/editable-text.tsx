import { useEffect, useRef } from 'react'
import { insertEditorLineBreak, readEditorText } from '@/lib/editable-text-content'
import type { TextStyle } from '@shared/canvas/element-types'
import { fontStackFor } from '@shared/canvas/font-family'
import { useDocumentStore } from '@/store/document-store'
import { useToolStore } from '@/store/tool-store'

type EditableTextProps = {
  elementId: string
  text: string
  style: TextStyle
  editing: boolean
  placeholder: string
  onHeightChange?: (height: number) => void
  /** Which field receives typed text (connectors keep theirs in `label`). */
  textField?: 'text' | 'label'
  className?: string
}

/** Shared text renderer: static div normally, contentEditable while editing. */
export function EditableText({
  elementId,
  text,
  style,
  editing,
  placeholder,
  onHeightChange,
  textField = 'text',
  className
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !onHeightChange) {
      return
    }
    // Why: under CSS zoom, engines disagree on whether offset* and observer sizes are zoomed, so
    // the box's aspect scales the CSS width; observer sizes also ignore a rotated element's turn.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize[0]
      if (!box) {
        return
      }
      const cssWidth = element.offsetWidth
      onHeightChange(
        cssWidth > 0 && box.inlineSize > 0
          ? (box.blockSize / box.inlineSize) * cssWidth
          : box.blockSize
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeightChange])

  useEffect(() => {
    const element = ref.current
    if (!editing || !element) {
      return
    }
    element.textContent = text
    useDocumentStore.getState().beginEdit()
    element.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    return () => useDocumentStore.getState().endEdit()
    // Why: seed the editor once per editing session; live text flows through onInput.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const cssStyle = {
    color: style.color,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight ?? 1.4,
    textAlign: style.align,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : undefined,
    fontFamily: fontStackFor(style.fontFamily)
  } as const

  if (!editing) {
    return (
      <div
        ref={ref}
        className={`whitespace-pre-wrap break-words ${className ?? ''}`}
        style={cssStyle}
      >
        {text === '' ? <span className="text-zinc-400">{placeholder}</span> : text}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`canvas-text-editor cursor-text ${className ?? ''}`}
      style={{ ...cssStyle, pointerEvents: 'auto' }}
      onInput={(event) =>
        useDocumentStore
          .getState()
          .patchElements([elementId], { [textField]: readEditorText(event.currentTarget) }, false)
      }
      onBlur={() => useToolStore.getState().setEditingTextId(null)}
      // Why: rich clipboard content (HTML from a browser) must arrive as plain text with its
      // line breaks; the default paste would inject markup the document cannot hold.
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
        document.execCommand('insertText', false, text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.blur()
        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          insertEditorLineBreak()
        }
      }}
    />
  )
}
