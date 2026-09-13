import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  SendToBack,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import type { CanvasElement, ShapeStyle, TextAlign, TextStyle } from '@shared/canvas/element-types'
import { parseBoundedNumber } from '@shared/canvas/numeric-input'
import { MIN_ELEMENT_SIZE } from '@shared/canvas/resize-handles'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { TextButton } from '@/components/ui/text-button'
import { t, tn, type UiStringKey } from '@/i18n/ui-strings'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { AlignmentToolbar } from './alignment-toolbar'
import { ConnectorFields } from './connector-fields'

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-9 cursor-pointer rounded border border-input bg-background p-0.5"
    />
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  // Why: a controlled number field can't be cleared while typing unless the draft lives locally.
  // The draft is shown only while it belongs to the current value (typing may clamp, so the
  // committed number can differ from the text); undo or another selection shows the real value.
  const [draft, setDraft] = useState({ text: String(Math.round(value)), committed: value })
  const shown = draft.committed === value ? draft.text : String(Math.round(value))
  return (
    <input
      type="number"
      className={`${inputClass} w-16`}
      value={shown}
      min={min}
      max={max}
      onChange={(event) => {
        const parsed = parseBoundedNumber(event.target.value, min, max)
        setDraft({ text: event.target.value, committed: parsed ?? value })
        if (parsed !== null && parsed !== value) {
          onChange(parsed)
        }
      }}
      onBlur={() => setDraft({ text: String(Math.round(value)), committed: value })}
    />
  )
}

function ShapeStyleFields({ ids, style }: { ids: string[]; style: ShapeStyle }) {
  const patch = (partial: Partial<ShapeStyle>) =>
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'shape' ? { style: { ...element.style, ...partial } } : {}
      )
  return (
    <>
      <FieldRow label={t('props.fill')}>
        <ColorInput value={style.fill} onChange={(fill) => patch({ fill })} />
      </FieldRow>
      <FieldRow label={t('props.stroke')}>
        <ColorInput value={style.stroke} onChange={(stroke) => patch({ stroke })} />
        <NumberInput
          value={style.strokeWidth}
          min={0}
          max={64}
          onChange={(strokeWidth) => patch({ strokeWidth })}
        />
      </FieldRow>
      <FieldRow label={t('props.radius')}>
        <NumberInput
          value={style.cornerRadius}
          min={0}
          max={512}
          onChange={(cornerRadius) => patch({ cornerRadius })}
        />
      </FieldRow>
    </>
  )
}

const textAligns: { value: TextAlign; label: UiStringKey; icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'props.textAlign.left', icon: AlignLeft },
  { value: 'center', label: 'props.textAlign.center', icon: AlignCenter },
  { value: 'right', label: 'props.textAlign.right', icon: AlignRight }
]

function TextStyleFields({ ids, style }: { ids: string[]; style: TextStyle }) {
  const patch = (partial: Partial<TextStyle>) =>
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'text' || element.type === 'shape' || element.type === 'connector'
          ? { textStyle: { ...element.textStyle, ...partial } }
          : {}
      )
  return (
    <>
      <FieldRow label={t('props.text')}>
        <ColorInput value={style.color} onChange={(color) => patch({ color })} />
        <NumberInput
          value={style.fontSize}
          min={4}
          max={1024}
          onChange={(fontSize) => patch({ fontSize })}
        />
      </FieldRow>
      <FieldRow label={t('props.align')}>
        {textAligns.map(({ value, label, icon: Icon }) => (
          <IconButton
            key={value}
            label={t(label)}
            className="h-7 w-7"
            active={style.align === value}
            onClick={() => patch({ align: value })}
          >
            <Icon size={14} />
          </IconButton>
        ))}
        <IconButton
          label={t('props.bold')}
          className="h-7 w-7"
          active={style.bold}
          onClick={() => patch({ bold: !style.bold })}
        >
          <Bold size={14} />
        </IconButton>
      </FieldRow>
    </>
  )
}

function firstOfType<T extends CanvasElement['type']>(
  elements: CanvasElement[],
  type: T
): Extract<CanvasElement, { type: T }> | undefined {
  return elements.find((e): e is Extract<CanvasElement, { type: T }> => e.type === type)
}

export function PropertiesPanel() {
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const elements = selectedIds.flatMap((id) => document.elements[id] ?? [])
  if (elements.length === 0) {
    return null
  }
  const store = useDocumentStore.getState()
  const shape = firstOfType(elements, 'shape')
  const frame = firstOfType(elements, 'frame')
  const connector = firstOfType(elements, 'connector')
  const textStyle = (firstOfType(elements, 'text') ?? shape ?? connector)?.textStyle ?? null
  const first = elements[0] as CanvasElement

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-3">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {elements.length === 1
          ? t(`element.${first.type}`)
          : tn('selection.count', elements.length)}
      </h2>
      {frame && elements.length === 1 && (
        <FieldRow label={t('props.name')}>
          <input
            className={`${inputClass} w-36`}
            value={frame.name}
            onChange={(event) => store.patchElements([frame.id], { name: event.target.value })}
          />
        </FieldRow>
      )}
      {elements.length === 1 && first.type !== 'connector' && (
        <FieldRow label={t('props.size')}>
          <NumberInput
            value={first.width}
            min={MIN_ELEMENT_SIZE}
            max={100_000}
            onChange={(width) => store.patchElements([first.id], { width })}
          />
          <NumberInput
            value={first.height}
            min={MIN_ELEMENT_SIZE}
            max={100_000}
            onChange={(height) => store.patchElements([first.id], { height })}
          />
        </FieldRow>
      )}
      <AlignmentToolbar count={elements.length} />
      {connector && <ConnectorFields ids={selectedIds} sample={connector} />}
      {shape && <ShapeStyleFields ids={selectedIds} style={shape.style} />}
      {textStyle && <TextStyleFields ids={selectedIds} style={textStyle} />}
      <div className="mt-2 flex flex-wrap gap-1">
        <TextButton onClick={() => store.reorderSelected('front')}>
          <BringToFront size={12} /> {t('props.front')}
        </TextButton>
        <TextButton onClick={() => store.reorderSelected('back')}>
          <SendToBack size={12} /> {t('props.back')}
        </TextButton>
        <TextButton onClick={store.duplicateSelected}>
          <Copy size={12} /> {t('props.duplicate')}
        </TextButton>
        <TextButton variant="destructive" onClick={store.deleteSelected}>
          <Trash2 size={12} /> {t('props.delete')}
        </TextButton>
      </div>
    </section>
  )
}
