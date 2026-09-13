import { BringToFront, ChevronDown, ChevronUp, Copy, Frame, SendToBack, Trash2 } from 'lucide-react'
import type { CanvasElement } from '@shared/canvas/element-types'
import { MIN_ELEMENT_SIZE } from '@shared/canvas/resize-handles'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { TextButton } from '@/components/ui/text-button'
import { t, tn } from '@/i18n/ui-strings'
import { shortcutLabel } from '@/lib/platform-keys'
import { frameSelection } from '@/lib/selection-commands'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { AlignmentToolbar } from './alignment-toolbar'
import { ConnectorFields } from './connector-fields'
import { NumberInput, ShapeStyleFields, TextStyleFields } from './style-fields'

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
            aria-label={t('props.name')}
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
        <TextButton
          title={`${t('order.front')} (${shortcutLabel(']', { shift: true })})`}
          onClick={() => store.reorderSelected('front')}
        >
          <BringToFront size={12} /> {t('props.front')}
        </TextButton>
        <TextButton
          title={`${t('order.forward')} (${shortcutLabel(']')})`}
          onClick={() => store.reorderSelected('forward')}
        >
          <ChevronUp size={12} /> {t('props.forward')}
        </TextButton>
        <TextButton
          title={`${t('order.backward')} (${shortcutLabel('[')})`}
          onClick={() => store.reorderSelected('backward')}
        >
          <ChevronDown size={12} /> {t('props.backward')}
        </TextButton>
        <TextButton
          title={`${t('order.back')} (${shortcutLabel('[', { shift: true })})`}
          onClick={() => store.reorderSelected('back')}
        >
          <SendToBack size={12} /> {t('props.back')}
        </TextButton>
      </div>
      <div className="flex flex-wrap gap-1">
        <TextButton
          title={`${t('selection.frame')} (${shortcutLabel('F', { shift: true })})`}
          onClick={frameSelection}
        >
          <Frame size={12} /> {t('selection.frame')}
        </TextButton>
        <TextButton
          title={`${t('props.duplicate')} (${shortcutLabel('D')})`}
          onClick={store.duplicateSelected}
        >
          <Copy size={12} /> {t('props.duplicate')}
        </TextButton>
        <TextButton variant="destructive" onClick={store.deleteSelected}>
          <Trash2 size={12} /> {t('props.delete')}
        </TextButton>
      </div>
    </section>
  )
}
