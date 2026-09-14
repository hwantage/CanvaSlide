import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { canInstallInApp, currentAppVersion } from '@/platform/app-update'
import { useUpdateStore } from '@/store/update-store'

/** Settings → Updates: version, manual check, install (Windows) or download page (elsewhere). */
export function UpdateSection() {
  const status = useUpdateStore((s) => s.status)
  const update = useUpdateStore((s) => s.update)
  const progress = useUpdateStore((s) => s.progress)
  const error = useUpdateStore((s) => s.error)
  const checkOnLaunch = useUpdateStore((s) => s.checkOnLaunch)
  const check = useUpdateStore((s) => s.check)
  const install = useUpdateStore((s) => s.install)
  const openReleases = useUpdateStore((s) => s.openReleases)
  const setCheckOnLaunch = useUpdateStore((s) => s.setCheckOnLaunch)
  const busy = status === 'checking' || status === 'downloading'

  const message = (() => {
    switch (status) {
      case 'checking':
        return t('update.checking')
      case 'upToDate':
        return t('update.upToDate')
      case 'available':
        return t('update.available', { v: update?.version ?? '' })
      case 'downloading':
        return t('update.downloading', { p: Math.round(progress * 100) })
      case 'error':
        return t('update.error', { message: error ?? '' })
      default:
        return ''
    }
  })()

  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="update-section">
      <div className="flex items-center gap-3">
        <span className="w-24 text-muted-foreground">{t('update.current')}</span>
        <span className="tabular-nums" data-testid="current-version">
          {currentAppVersion()}
        </span>
        <span className="flex-1" />
        <TextButton onClick={() => void check()} disabled={busy}>
          {t('update.check')}
        </TextButton>
      </div>
      {message && (
        <p
          data-testid="update-status"
          className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'}
        >
          {message}
        </p>
      )}
      {update && (status === 'available' || status === 'downloading') && (
        <div className="flex flex-col gap-2">
          {update.notes && (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-sans text-[11px]">
              {update.notes}
            </pre>
          )}
          <div className="flex items-center gap-3">
            {update.installable ? (
              <TextButton
                variant="primary"
                className="shrink-0 whitespace-nowrap"
                onClick={() => void install()}
                disabled={busy}
              >
                {t('update.install')}
              </TextButton>
            ) : (
              <TextButton
                variant="primary"
                className="shrink-0 whitespace-nowrap"
                onClick={() => void openReleases()}
              >
                {t('update.openReleases')}
              </TextButton>
            )}
            {!update.installable && !canInstallInApp() && (
              <span className="text-[11px] text-muted-foreground">{t('update.macHint')}</span>
            )}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checkOnLaunch}
          onChange={(event) => setCheckOnLaunch(event.target.checked)}
        />
        {t('update.checkOnLaunch')}
      </label>
    </div>
  )
}
