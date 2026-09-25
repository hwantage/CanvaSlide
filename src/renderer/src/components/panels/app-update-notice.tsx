import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { useUpdateStore } from '@/store/update-store'

export function AppUpdateNotice() {
  const status = useUpdateStore((s) => s.status)
  const update = useUpdateStore((s) => s.update)
  const progress = useUpdateStore((s) => s.progress)
  const error = useUpdateStore((s) => s.error)
  const install = useUpdateStore((s) => s.install)
  const openReleases = useUpdateStore((s) => s.openReleases)
  if (status === 'idle') {
    return null
  }
  const message =
    status === 'checking'
      ? t('update.checking')
      : status === 'upToDate'
        ? t('update.upToDate')
        : status === 'error'
          ? t('update.error', { message: error ?? '' })
          : status === 'downloading'
            ? t('update.downloading', { p: Math.round(progress * 100) })
            : t('update.available', { v: update?.version ?? '' })
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs">
      <p
        role="status"
        className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'}
      >
        {message}
      </p>
      {update && (
        <>
          {update.notes && (
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
              {update.notes}
            </p>
          )}
          <TextButton
            className="self-start"
            disabled={status === 'checking' || status === 'downloading'}
            onClick={() => void (update.installable ? install() : openReleases())}
          >
            {t(update.installable ? 'update.install' : 'update.openReleases')}
          </TextButton>
        </>
      )}
    </div>
  )
}
