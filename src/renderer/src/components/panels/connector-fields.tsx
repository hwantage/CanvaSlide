import {
  ArrowRight,
  ArrowRightLeft,
  CornerDownRight,
  Minus,
  Spline,
  TrendingUp
} from 'lucide-react'
import type {
  ArrowHead,
  ConnectorElement,
  ConnectorRoute,
  ConnectorStyle
} from '@shared/canvas/element-types'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'

const routes: { value: ConnectorRoute; label: UiStringKey; icon: typeof TrendingUp }[] = [
  { value: 'straight', label: 'connector.route.straight', icon: TrendingUp },
  { value: 'orthogonal', label: 'connector.route.orthogonal', icon: CornerDownRight },
  { value: 'curved', label: 'connector.route.curved', icon: Spline }
]
const heads: { value: [ArrowHead, ArrowHead]; label: UiStringKey; icon: typeof Minus }[] = [
  { value: ['none', 'none'], label: 'connector.ends.line', icon: Minus },
  { value: ['none', 'arrow'], label: 'connector.ends.arrow', icon: ArrowRight },
  { value: ['arrow', 'arrow'], label: 'connector.ends.doubleArrow', icon: ArrowRightLeft }
]

export function ConnectorFields({ ids, sample }: { ids: string[]; sample: ConnectorElement }) {
  const patch = (partial: Partial<ConnectorElement>) =>
    useDocumentStore
      .getState()
      .patchElements(ids, (element) => (element.type === 'connector' ? partial : {}))
  const patchStyle = (partial: Partial<ConnectorStyle>) =>
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'connector' ? { style: { ...element.style, ...partial } } : {}
      )
  return (
    <>
      <FieldRow label={t('connector.route')}>
        {routes.map(({ value, label, icon: Icon }) => (
          <IconButton
            key={value}
            label={t(label)}
            className="h-7 w-7"
            active={sample.route === value}
            onClick={() => patch({ route: value })}
          >
            <Icon size={14} />
          </IconButton>
        ))}
      </FieldRow>
      <FieldRow label={t('connector.ends')}>
        {heads.map(({ value, label, icon: Icon }) => (
          <IconButton
            key={label}
            label={t(label)}
            className="h-7 w-7"
            active={sample.startHead === value[0] && sample.endHead === value[1]}
            onClick={() => patch({ startHead: value[0], endHead: value[1] })}
          >
            <Icon size={14} />
          </IconButton>
        ))}
      </FieldRow>
      <FieldRow label={t('connector.line')}>
        <input
          type="color"
          value={sample.style.stroke}
          onChange={(event) => patchStyle({ stroke: event.target.value })}
          className="h-7 w-9 cursor-pointer rounded border border-input bg-background p-0.5"
        />
        <input
          type="number"
          className={`${inputClass} w-14`}
          value={sample.style.strokeWidth}
          min={1}
          max={32}
          onChange={(event) => patchStyle({ strokeWidth: Number(event.target.value) })}
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={sample.style.dashed}
            onChange={(event) => patchStyle({ dashed: event.target.checked })}
          />
          {t('connector.dashed')}
        </label>
      </FieldRow>
    </>
  )
}
