import { useState } from 'react'
import { VideoUrlDialog } from './video-url-dialog'
import {
  BringToFront,
  ChevronDown,
  ChevronUp,
  Copy,
  Frame,
  Group,
  SendToBack,
  Trash2,
  Ungroup
} from 'lucide-react'
import { pinEndsOn } from '@shared/canvas/connector-geometry'
import { patchElements } from '@shared/canvas/document-mutations'
import type { CanvasElement } from '@shared/canvas/element-types'
import { canGroup, canUngroup, selectionGroupId } from '@shared/canvas/element-groups'
import {
  canRotateSelection,
  elementRotation,
  isRotatable,
  normalizeRotation,
  resizeKeepingOrigin
} from '@shared/canvas/element-rotation'
import { MIN_ELEMENT_SIZE } from '@shared/canvas/resize-handles'
import { shapeUsesCornerRadius } from '@shared/canvas/shape-svg'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { TextButton } from '@/components/ui/text-button'
import { t, tn } from '@/i18n/ui-strings'
import { shortcutLabel } from '@/lib/platform-keys'
import { selectionIsOnlyFrames } from '@shared/canvas/frame-from-selection'
import { frameSelection } from '@/lib/selection-commands'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { AlignmentToolbar } from './alignment-toolbar'
import { ConnectorFields } from './connector-fields'
import { FrameTransitionFields } from './frame-transition-fields'
import { NumberInput, ShapeStyleFields, TextStyleFields } from './style-fields'

function firstOfType<T extends CanvasElement['type']>(
  elements: CanvasElement[],
  type: T
): Extract<CanvasElement, { type: T }> | undefined {
  return elements.find((e): e is Extract<CanvasElement, { type: T }> => e.type === type)
}

export function PropertiesPanel() {
  const [videoDialog, setVideoDialog] = useState(false)
  const document = useDocumentStore(selectDocument)
  const selectedIds = useDocumentStore(selectSelectedIds)
  const elements = selectedIds.flatMap((id) => document.elements[id] ?? [])
  if (elements.length === 0) {
    return null
  }
  const store = useDocumentStore.getState()
  const shape = firstOfType(elements, 'shape')
  const rounded = elements.find(
    (e): e is Extract<CanvasElement, { type: 'shape' }> =>
      e.type === 'shape' && shapeUsesCornerRadius(e.shape)
  )
  const frame = firstOfType(elements, 'frame')
  const connector = firstOfType(elements, 'connector')
  const textStyle = (firstOfType(elements, 'text') ?? shape ?? connector)?.textStyle ?? null
  const first = elements[0] as CanvasElement
  const turnable = canRotateSelection(document, selectedIds)
    ? elements.find(isRotatable)
    : undefined
  // Why: z-order moves nothing a user can see for frames, and wrapping one adds a duplicate slide.
  const onlyFrames = selectionIsOnlyFrames(document, selectedIds)

  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {elements.length === 1
          ? t(`element.${first.type}`)
          : selectionGroupId(document, selectedIds)
            ? `${t('element.group')} · ${tn('selection.count', elements.length)}`
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
            onChange={(width) =>
              store.patchElements([first.id], resizeKeepingOrigin(first, width, first.height))
            }
          />
          <NumberInput
            value={first.height}
            min={MIN_ELEMENT_SIZE}
            max={100_000}
            onChange={(height) =>
              store.patchElements([first.id], resizeKeepingOrigin(first, first.width, height))
            }
          />
        </FieldRow>
      )}
      {turnable && (
        <FieldRow label={t('props.rotation')}>
          <NumberInput
            value={elementRotation(turnable)}
            min={-360}
            max={360}
            label={t('props.rotation')}
            onChange={(degrees) =>
              // Each element turns about its own centre, as a typed angle does in Figma.
              store.applyEdit((d) =>
                patchElements(pinEndsOn(d, selectedIds), selectedIds, (element) =>
                  isRotatable(element) ? { rotation: normalizeRotation(degrees) } : {}
                )
              )
            }
          />
          <span className="text-xs text-muted-foreground">°</span>
        </FieldRow>
      )}
      {first.type === 'video' && elements.length === 1 && (
        <>
          <label className="my-1 flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={first.autoplay !== false}
              onChange={(event) =>
                store.patchElements([first.id], { autoplay: event.target.checked })
              }
            />
            {t('video.autoplay')}
          </label>
          <TextButton onClick={() => setVideoDialog(true)}>{t('video.edit')}</TextButton>
          <p className="break-all px-1 text-xs text-muted-foreground">{first.url}</p>
          {videoDialog && (
            <VideoUrlDialog
              key={first.id}
              elementId={first.id}
              initialUrl={first.url}
              onClose={() => setVideoDialog(false)}
            />
          )}
        </>
      )}
      {onlyFrames && <FrameTransitionFields frameIds={selectedIds} />}
      {!onlyFrames && <AlignmentToolbar count={elements.length} />}
      {connector && <ConnectorFields ids={selectedIds} sample={connector} />}
      {shape && (
        <ShapeStyleFields
          ids={selectedIds}
          style={shape.style}
          cornerRadius={rounded?.style.cornerRadius ?? null}
        />
      )}
      {textStyle && <TextStyleFields ids={selectedIds} style={textStyle} />}
      {!onlyFrames && (
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
      )}
      <div className="flex flex-wrap gap-1">
        {canGroup(document, selectedIds) && (
          <TextButton
            title={`${t('edit.group')} (${shortcutLabel('G')})`}
            onClick={store.groupSelected}
          >
            <Group size={12} /> {t('edit.group')}
          </TextButton>
        )}
        {canUngroup(document, selectedIds) && (
          <TextButton
            title={`${t('edit.ungroup')} (${shortcutLabel('G', { shift: true })})`}
            onClick={store.ungroupSelected}
          >
            <Ungroup size={12} /> {t('edit.ungroup')}
          </TextButton>
        )}
        {!onlyFrames && (
          <TextButton
            title={`${t('selection.frame')} (${shortcutLabel('F', { shift: true })})`}
            onClick={frameSelection}
          >
            <Frame size={12} /> {t('selection.frame')}
          </TextButton>
        )}
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
