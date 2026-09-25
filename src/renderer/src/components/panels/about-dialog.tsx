import { AppUpdateNotice } from './app-update-notice'
import { ExternalLink } from 'lucide-react'
import logo from '@/assets/canvaslide-light.png'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { currentAppVersion, RELEASES_URL } from '@/platform/app-update'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useAboutDialogStore } from '@/store/modal-dialogs'
import { useUpdateStore } from '@/store/update-store'

export function AboutDialog() {
  const open = useAboutDialogStore((s) => s.open)
  const hide = useAboutDialogStore((s) => s.hide)
  const openReleases = useUpdateStore((s) => s.openReleases)
  if (!open) {
    return null
  }
  const title = t('about.title', { app: 'CanvaSlide' })
  return (
    <ModalDialog
      label={title}
      onClose={hide}
      className="flex max-h-[85vh] w-[28rem] max-w-[95vw] flex-col gap-4 overflow-y-auto"
    >
      <img
        src={logo}
        alt="CanvaSlide"
        width={2172}
        height={724}
        className="h-auto w-full rounded-md border border-border bg-[var(--brand-white)]"
      />
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="flex items-center justify-between text-xs">
        <dt className="text-muted-foreground">{t('update.current')}</dt>
        <dd className="select-text tabular-nums">{currentAppVersion()}</dd>
      </dl>
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 self-start rounded-sm text-xs underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.preventDefault()
          void openReleases()
        }}
      >
        {t('about.releaseNotes')} <ExternalLink size={13} aria-hidden />
      </a>
      {isTauriRuntime() && <UpdateControls />}
      <AppUpdateNotice />
      <div className="flex justify-end">
        <TextButton variant="primary" onClick={hide}>
          {t('settings.done')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}

/** Desktop only: the browser editor is served at its current version and never checks. */
function UpdateControls() {
  const checkOnLaunch = useUpdateStore((s) => s.checkOnLaunch)
  const setCheckOnLaunch = useUpdateStore((s) => s.setCheckOnLaunch)
  const check = useUpdateStore((s) => s.check)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={checkOnLaunch}
          onChange={(event) => setCheckOnLaunch(event.target.checked)}
        />
        {t('update.checkOnLaunch')}
      </label>
      <TextButton onClick={() => void check()}>{t('update.check')}</TextButton>
    </div>
  )
}
