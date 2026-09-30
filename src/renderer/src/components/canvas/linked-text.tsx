import { useMemo } from 'react'
import { textLinkCss } from '@shared/canvas/element-style'
import { TEXT_LINK_CLASS, textElementSegments } from '@shared/canvas/text-links'
import { reportError } from '@/platform/document-file-access'
import { openExternalUrl } from '@/platform/external-links'

/**
 * A text element's runs with its links, drawn as the static renderer draws them. Links open only
 * while presenting; in the editor a click keeps selecting the element. They never take focus: a
 * focused link would own the slide keys, and focusing one in another frame scrolls the viewport.
 */
export function LinkedText({
  text,
  link,
  active
}: {
  text: string
  link: string | undefined
  active: boolean
}) {
  const whole = link !== undefined
  const segments = useMemo(() => textElementSegments(text, link), [text, link])
  const open = (url: string) => {
    if (active) {
      // Why: the desktop opener only allows URLs spelled `https://…`, so pass the canonical form.
      void openExternalUrl(new URL(url).href).catch(reportError)
    }
  }
  return (
    <>
      {segments.map((segment, index) => {
        const url = segment.url
        if (url === undefined) {
          return segment.text
        }
        return (
          <a
            key={index}
            className={TEXT_LINK_CLASS}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            title={whole ? url : undefined}
            tabIndex={-1}
            style={{
              ...textLinkCss(whole),
              ...(active ? { pointerEvents: 'auto', cursor: 'pointer' } : {})
            }}
            onMouseDown={(event) => event.preventDefault()}
            // Why: the desktop webview opens no browser tab itself, so every host opens it here.
            onClick={(event) => {
              event.preventDefault()
              open(url)
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault()
                open(url)
              }
            }}
          >
            {segment.text}
          </a>
        )
      })}
    </>
  )
}
