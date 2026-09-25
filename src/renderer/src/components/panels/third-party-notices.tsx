import { useState } from 'react'
import { THIRD_PARTY_NOTICES_FILE } from '@shared/third-party-notices'
import { t } from '@/i18n/ui-strings'

type Notices = { status: 'idle' | 'loading' | 'failed' } | { status: 'loaded'; text: string }

/** The build's third-party notices, fetched when first expanded; the file runs to hundreds of KB. */
export function ThirdPartyNotices() {
  const [notices, setNotices] = useState<Notices>({ status: 'idle' })
  async function load() {
    setNotices({ status: 'loading' })
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${THIRD_PARTY_NOTICES_FILE}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setNotices({ status: 'loaded', text: await response.text() })
    } catch {
      setNotices({ status: 'failed' })
    }
  }
  return (
    <details
      className="text-xs"
      onToggle={(event) => {
        if (
          event.currentTarget.open &&
          (notices.status === 'idle' || notices.status === 'failed')
        ) {
          void load()
        }
      }}
    >
      <summary className="w-fit cursor-pointer rounded-sm underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('about.thirdPartyNotices')}
      </summary>
      {notices.status === 'loaded' ? (
        <pre
          role="region"
          tabIndex={0}
          aria-label={t('about.thirdPartyNotices')}
          className="mt-2 max-h-64 select-text overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-2 font-mono text-[10px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {notices.text}
        </pre>
      ) : (
        <p role="status" className="mt-2 text-muted-foreground">
          {notices.status === 'failed'
            ? t('about.thirdPartyNoticesError')
            : t('about.thirdPartyNoticesLoading')}
        </p>
      )}
    </details>
  )
}
