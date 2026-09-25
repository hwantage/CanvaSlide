import { AlignCenter, AlignLeft, AlignRight, Bold } from 'lucide-react'
import { useState } from 'react'
import type { ShapeKind, ShapeStyle, TextAlign, TextStyle } from '@shared/canvas/element-types'
import { parseBoundedNumber } from '@shared/ui/numeric-input'
import { shapeUsesCornerRadius } from '@shared/canvas/shape-svg'
import { ColorField } from '@/components/ui/color-field'
import { FontPicker } from '@/components/ui/font-picker'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'
import { rememberSelectionStyle } from '@/store/style-memory-store'

export function NumberInput({
  value,
  min,
  max,
  label,
  onChange
}: {
  value: number
  min: number
  max: number
  label?: string
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
      aria-label={label}
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

export function ShapeStyleFields({
  ids,
  style,
  cornerRadius
}: {
  ids: string[]
  style: ShapeStyle
  /** A selected rectangle's radius; null hides the field when nothing selected draws one. */
  cornerRadius: number | null
}) {
  const patch = (
    partial: Partial<ShapeStyle>,
    applies: (kind: ShapeKind) => boolean = () => true
  ) => {
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'shape' && applies(element.shape)
          ? { style: { ...element.style, ...partial } }
          : {}
      )
    rememberSelectionStyle(ids)
  }
  return (
    <>
      <FieldRow label={t('props.fill')}>
        <ColorField
          label={t('props.fill')}
          value={style.fill}
          allowNone
          onChange={(fill) => patch({ fill })}
        />
      </FieldRow>
      <FieldRow label={t('props.stroke')}>
        <ColorField
          label={t('props.stroke')}
          value={style.stroke}
          allowNone
          onChange={(stroke) => patch({ stroke })}
        />
        <NumberInput
          value={style.strokeWidth}
          min={0}
          max={64}
          onChange={(strokeWidth) => patch({ strokeWidth })}
        />
      </FieldRow>
      {cornerRadius !== null && (
        <FieldRow label={t('props.radius')}>
          <NumberInput
            value={cornerRadius}
            min={0}
            max={512}
            onChange={(radius) => patch({ cornerRadius: radius }, shapeUsesCornerRadius)}
          />
        </FieldRow>
      )}
    </>
  )
}

const textAligns: { value: TextAlign; label: UiStringKey; icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'props.textAlign.left', icon: AlignLeft },
  { value: 'center', label: 'props.textAlign.center', icon: AlignCenter },
  { value: 'right', label: 'props.textAlign.right', icon: AlignRight }
]

export function TextStyleFields({ ids, style }: { ids: string[]; style: TextStyle }) {
  const patch = (partial: Partial<TextStyle>) => {
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'text' || element.type === 'shape' || element.type === 'connector'
          ? { textStyle: { ...element.textStyle, ...partial } }
          : {}
      )
    rememberSelectionStyle(ids)
  }
  return (
    <>
      <FieldRow label={t('props.text')}>
        <ColorField
          label={t('props.text')}
          value={style.color}
          onChange={(color) => patch({ color })}
        />
        <NumberInput
          value={style.fontSize}
          min={4}
          max={1024}
          onChange={(fontSize) => patch({ fontSize })}
        />
      </FieldRow>
      <FieldRow label={t('props.font')}>
        <FontPicker
          label={t('props.font')}
          value={style.fontFamily}
          onChange={(fontFamily) => patch({ fontFamily })}
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
