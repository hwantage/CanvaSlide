import { t } from '@/i18n/ui-strings'
import { useExampleStore } from '@/store/example-store'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'

export function ExampleDialog() {
  const open = useExampleStore((s) => s.open)
  const busy = useExampleStore((s) => s.busy)
  const error = useExampleStore((s) => s.error)
  const hide = useExampleStore((s) => s.hide)
  const openLink = useExampleStore((s) => s.openLink)
  if (!open) {
    return null
  }
  return (
    <ModalDialog label={t('example.title')} onClose={hide} className="w-[420px]">
      <h2 className="mb-3 text-base font-semibold">{t('example.title')}</h2>
      <p role={error ? 'alert' : 'status'} className="mb-4 text-sm text-muted-foreground">
        {error ? t(`example.${error}`) : t('example.loading')}
      </p>
      <div className="flex justify-end gap-2">
        <TextButton onClick={hide}>{t(busy ? 'example.cancel' : 'example.dismiss')}</TextButton>
        {(error === 'network' || error === 'missing') && (
          <TextButton onClick={() => void openLink(window.location.search)}>
            {t('example.retry')}
          </TextButton>
        )}
      </div>
    </ModalDialog>
  )
}
