import { hideShareDialog as hide } from '@/lib/document/launch-link-session'
import { openSharedLink as openLink, publishShare as publish } from '@/lib/document/launch-links'
import { useState } from 'react'
import { Copy, ExternalLink, FileDown } from 'lucide-react'
import { MAX_SHARE_BYTES } from '@shared/cloud-share/share-protocol'
import { DOCUMENT_FILE_EXTENSION } from '@shared/canvas/document-file'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { inputClass } from '@/components/ui/field-row'
import type { DocumentCommands } from '@/hooks/use-document-commands'
import { t } from '@/i18n/ui-strings'
import { cn } from '@/lib/cn'
import { exportFormatNames } from '@/lib/export-format'
import { copyShareLink, usesHostedShareService } from '@/platform/cloud-share'
import { HOSTED_SHARE_SERVICE_URL, openHostedShareServicePage } from '@/platform/external-links'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore } from '@/store/document-store'
import { useExportDialogStore } from '@/store/modal-dialogs'

export function CloudShareDialog({ commands }: { commands: DocumentCommands }) {
  const open = useCloudShareStore((s) => s.open)
  return open ? <ShareDialogContent commands={commands} /> : null
}

function ShareDialogContent({ commands }: { commands: DocumentCommands }) {
  const mode = useCloudShareStore((s) => s.mode)
  const busy = useCloudShareStore((s) => s.busy)
  const url = useCloudShareStore((s) => s.url)
  const error = useCloudShareStore((s) => s.error)
  const access = useCloudShareStore((s) => s.access)
  const setAccess = useCloudShareStore((s) => s.setAccess)
  const showExport = useExportDialogStore((s) => s.show)
  const hasFrames = useDocumentStore((s) => orderedFrames(s.document).length > 0)
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copying = copyState === 'copying'
  const title = t(mode === 'load' ? 'share.openTitle' : 'share.title')

  /** What the reader ends up holding: the editable original first, then the two read-only formats. */
  const saveTargets = [
    { name: `.${DOCUMENT_FILE_EXTENSION}`, run: () => void commands.saveDocumentAs() },
    { name: exportFormatNames.html, run: () => showExport('html') },
    { name: exportFormatNames.pdf, run: () => showExport('pdf') }
  ]

  const copy = async () => {
    if (copying || useCloudShareStore.getState().busy) {
      return
    }
    setCopyState('copying')
    const link = url ?? publish()
    try {
      await copyShareLink(link)
      setCopyState('copied')
    } catch {
      // Keep a successfully published URL available even if clipboard permission was denied first.
      const created = await link
      setCopyState(created ? 'failed' : 'idle')
    }
  }

  return (
    <ModalDialog
      label={title}
      onClose={hide}
      className="max-h-[85vh] w-[480px] max-w-[calc(100vw-2rem)] overflow-y-auto"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t('share.experimental')}
        </span>
      </div>
      {mode === 'publish' && (
        <>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            {t('share.description', { limit: `${MAX_SHARE_BYTES / 1024 / 1024} MiB` })}
          </p>
          {usesHostedShareService() && (
            <a
              href={HOSTED_SHARE_SERVICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="-mt-2 mb-4 flex w-fit items-center gap-1.5 rounded-sm text-xs underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.preventDefault()
                void openHostedShareServicePage()
              }}
            >
              {t('share.service')} <ExternalLink size={13} aria-hidden />
            </a>
          )}
          <fieldset disabled={busy || copying} className="mb-4 text-xs">
            <legend className="sr-only">{t('share.access.label')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['present', 'edit'] as const).map((option) => (
                <label key={option} className="relative cursor-default">
                  <input
                    type="radio"
                    name="cloud-share-access"
                    value={option}
                    checked={access === option}
                    onChange={() => {
                      setAccess(option)
                      setCopyState('idle')
                    }}
                    className="peer absolute inset-0 h-full w-full cursor-default opacity-0"
                  />
                  <span
                    className={cn(
                      'pointer-events-none flex min-h-10 items-center justify-center rounded-md border px-2 py-2 text-center font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50',
                      access === option
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input peer-hover:bg-accent peer-hover:text-accent-foreground'
                    )}
                  >
                    {t(`share.access.${option}`)}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-muted-foreground">{t(`share.access.${access}Description`)}</p>
          </fieldset>
          {access === 'present' && !hasFrames && (
            <p className="mb-3 text-xs text-muted-foreground">{t('share.error.noFrames')}</p>
          )}
          <TextButton
            variant="primary"
            className="h-11 w-full cursor-pointer justify-center text-sm disabled:cursor-default"
            disabled={busy || copying || (access === 'present' && !hasFrames)}
            onClick={() => void copy()}
          >
            <Copy size={16} aria-hidden />
            {t(copying ? 'share.copying' : 'share.copy')}
          </TextButton>
        </>
      )}
      {mode === 'load' && busy && (
        <p role="status" className="mb-3 text-xs">
          {t('share.loading')}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-3 space-y-2 text-xs">
          <p className="text-destructive">{t(`share.error.${error}`)}</p>
          {mode === 'publish' && (
            <p className="text-muted-foreground">
              {t('share.fallback', { format: `.${DOCUMENT_FILE_EXTENSION}` })}
            </p>
          )}
        </div>
      )}
      {url && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs" htmlFor="cloud-share-url">
            {t('share.link')}
          </label>
          <input
            id="cloud-share-url"
            className={`${inputClass} w-full`}
            value={url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
      {mode === 'publish' && (
        // Keep the live region mounted before its text changes so copying is announced.
        <p
          role="status"
          className={
            copyState === 'idle' || copying ? 'sr-only' : 'mt-2 text-xs text-muted-foreground'
          }
        >
          {copyState === 'idle'
            ? ''
            : t(
                copying
                  ? 'share.copying'
                  : copyState === 'copied'
                    ? 'share.copied'
                    : 'share.copyFailed'
              )}
        </p>
      )}
      {mode === 'publish' && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
          {saveTargets.map((target) => (
            <TextButton
              key={target.name}
              className="h-9 cursor-pointer justify-center px-1 disabled:cursor-default"
              disabled={busy || copying}
              // Why the button says only the format: the three sit together under one heading, and
              // the accessible name still carries the verb for anyone who cannot see that.
              aria-label={t('share.exportFile', { format: target.name })}
              onClick={target.run}
            >
              <FileDown size={14} aria-hidden />
              {target.name}
            </TextButton>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <TextButton variant="ghost" onClick={hide}>
          {t('share.close')}
        </TextButton>
        {mode === 'load' && (
          <TextButton
            variant="primary"
            disabled={busy}
            onClick={() => void openLink(window.location.search)}
          >
            {t('share.retry')}
          </TextButton>
        )}
      </div>
    </ModalDialog>
  )
}
