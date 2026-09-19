import { useState } from 'react'
import { MAX_SHARE_BYTES } from '@shared/cloud-share'
import { DOCUMENT_FILE_EXTENSION } from '@shared/canvas/document-file'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { inputClass } from '@/components/ui/field-row'
import type { DocumentCommands } from '@/hooks/use-document-commands'
import { t } from '@/i18n/ui-strings'
import { copyShareLink } from '@/platform/cloud-share'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore } from '@/store/document-store'

export function CloudShareDialog({ commands }: { commands: DocumentCommands }) {
  const open = useCloudShareStore((s) => s.open)
  return open ? <ShareDialogContent commands={commands} /> : null
}

function ShareDialogContent({ commands }: { commands: DocumentCommands }) {
  const mode = useCloudShareStore((s) => s.mode)
  const busy = useCloudShareStore((s) => s.busy)
  const url = useCloudShareStore((s) => s.url)
  const error = useCloudShareStore((s) => s.error)
  const hide = useCloudShareStore((s) => s.hide)
  const publish = useCloudShareStore((s) => s.publish)
  const openLink = useCloudShareStore((s) => s.openLink)
  const access = useCloudShareStore((s) => s.access)
  const setAccess = useCloudShareStore((s) => s.setAccess)
  const hasFrames = useDocumentStore((s) => orderedFrames(s.document).length > 0)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const title = t(mode === 'load' ? 'share.openTitle' : 'share.title')

  const copy = async () => {
    if (!url) {
      return
    }
    try {
      await copyShareLink(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <ModalDialog label={title} onClose={hide} className="w-[480px] max-w-[calc(100vw-2rem)]">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {mode === 'publish' && (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          {t('share.description', { limit: `${MAX_SHARE_BYTES / 1024 / 1024} MiB` })}
        </p>
      )}
      {mode === 'publish' && (
        <fieldset disabled={busy || Boolean(url)} className="mb-3 space-y-2 text-xs">
          <legend className="mb-2 font-medium">{t('share.access.label')}</legend>
          {(['edit', 'present'] as const).map((option) => (
            <label
              key={option}
              className={`flex items-start gap-2 rounded-md border p-3 ${access === option ? 'border-primary bg-accent' : 'border-border'} ${option === 'present' && !hasFrames ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="cloud-share-access"
                value={option}
                checked={access === option}
                disabled={option === 'present' && !hasFrames}
                onChange={() => setAccess(option)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block font-medium">{t(`share.access.${option}`)}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t(`share.access.${option}Description`)}
                </span>
              </span>
            </label>
          ))}
          {!hasFrames && <p className="text-muted-foreground">{t('share.error.noFrames')}</p>}
        </fieldset>
      )}
      {busy && (
        <p role="status" className="mb-3 text-xs">
          {t(mode === 'load' ? 'share.loading' : 'share.uploading')}
        </p>
      )}
      {error && (
        <div role="alert" className="mb-3 space-y-2 text-xs">
          <p className="text-destructive">{t(`share.error.${error}`)}</p>
          {mode === 'publish' && (
            <p className="text-muted-foreground">
              {t('share.fallback', { format: `.${DOCUMENT_FILE_EXTENSION}` })}
            </p>
          )}
        </div>
      )}
      {url && (
        <div className="mb-3 space-y-2">
          <label className="block text-xs" htmlFor="cloud-share-url">
            {t('share.link')}
          </label>
          <div className="flex gap-2">
            <input
              id="cloud-share-url"
              className={`${inputClass} min-w-0 flex-1`}
              value={url}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <TextButton onClick={() => void copy()}>{t('share.copy')}</TextButton>
          </div>
          {copyState !== 'idle' && (
            <p role="status" className="text-xs text-muted-foreground">
              {t(copyState === 'copied' ? 'share.copied' : 'share.copyFailed')}
            </p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <TextButton variant="ghost" onClick={hide}>
          {t('share.close')}
        </TextButton>
        {mode === 'publish' && (
          <TextButton disabled={busy} onClick={() => void commands.saveDocumentAs()}>
            {t('share.saveLocal', { format: `.${DOCUMENT_FILE_EXTENSION}` })}
          </TextButton>
        )}
        {!url && (
          <TextButton
            variant="primary"
            disabled={busy}
            onClick={() => void (mode === 'load' ? openLink(window.location.search) : publish())}
          >
            {t(mode === 'load' ? 'share.retry' : 'share.create')}
          </TextButton>
        )}
      </div>
    </ModalDialog>
  )
}
