import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'

/** Cancel and confirm, identical for every export format so the dialog's footer never drifts. */
export function ExportActions({
  disabled,
  onCancel,
  onExport
}: {
  disabled: boolean
  onCancel: () => void
  onExport: () => void
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <TextButton variant="ghost" onClick={onCancel}>
        {t('export.cancel')}
      </TextButton>
      <TextButton variant="primary" disabled={disabled} onClick={onExport}>
        {t('export.confirm')}
      </TextButton>
    </div>
  )
}
