import { useState } from 'react'
import { parseVideoSource } from '@shared/canvas/video-source'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { insertVideoUrl } from '@/lib/external-content'
import { useDocumentStore } from '@/store/document-store'

export function VideoUrlDialog({
  onClose,
  elementId,
  initialUrl = ''
}: {
  onClose: () => void
  elementId?: string
  initialUrl?: string
}) {
  const [url, setUrl] = useState(initialUrl)
  const [invalid, setInvalid] = useState(false)
  return (
    <ModalDialog
      label={t(elementId ? 'video.edit' : 'video.insert')}
      onClose={onClose}
      className="w-[440px] max-w-[90vw]"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const source = parseVideoSource(url, true)
          if (!source) {
            setInvalid(true)
            return
          }
          if (elementId) {
            useDocumentStore.getState().patchElements([elementId], { url: source.url })
          } else {
            insertVideoUrl(url)
          }
          onClose()
        }}
      >
        <h2 className="text-sm font-semibold">{t(elementId ? 'video.edit' : 'video.insert')}</h2>
        <label className="flex flex-col gap-1 text-xs">
          {t('video.url')}
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setInvalid(false)
            }}
            aria-invalid={invalid}
            className="rounded border border-input bg-background px-2 py-1.5 text-foreground outline-none focus:border-ring"
            placeholder="https://…"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {t('video.support', { providers: 'YouTube, Vimeo', formats: 'MP4, WebM' })}
        </p>
        <p className="text-xs text-muted-foreground">{t('video.policy')}</p>
        {invalid && (
          <p role="alert" className="text-xs text-destructive">
            {t('video.invalid')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <TextButton onClick={onClose}>{t('video.cancel')}</TextButton>
          <button
            type="submit"
            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
          >
            {t(elementId ? 'video.save' : 'video.insert')}
          </button>
        </div>
      </form>
    </ModalDialog>
  )
}
