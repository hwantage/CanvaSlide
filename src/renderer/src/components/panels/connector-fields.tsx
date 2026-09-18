import type { ConnectorElement, ConnectorStyle } from '@shared/canvas/element-types'
import { ColorField } from '@/components/ui/color-field'
import { connectorHeadOptions, connectorRouteOptions } from '@/components/ui/connector-options'
import { FieldRow, inputClass } from '@/components/ui/field-row'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { useDocumentStore } from '@/store/document-store'
import { rememberSelectionStyle } from '@/store/style-memory-store'

export function ConnectorFields({ ids, sample }: { ids: string[]; sample: ConnectorElement }) {
  const patch = (partial: Partial<ConnectorElement>) =>
    useDocumentStore
      .getState()
      .patchElements(ids, (element) => (element.type === 'connector' ? partial : {}))
  const patchStyle = (partial: Partial<ConnectorStyle>) => {
    useDocumentStore
      .getState()
      .patchElements(ids, (element) =>
        element.type === 'connector' ? { style: { ...element.style, ...partial } } : {}
      )
    rememberSelectionStyle(ids)
  }
  return (
    <>
      <FieldRow label={t('connector.route')}>
        {connectorRouteOptions.map(({ value, label, icon: Icon }) => (
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
        {connectorHeadOptions.map(({ value, label, icon: Icon }) => (
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
        <ColorField
          label={t('connector.color')}
          value={sample.style.stroke}
          onChange={(stroke) => patchStyle({ stroke })}
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
