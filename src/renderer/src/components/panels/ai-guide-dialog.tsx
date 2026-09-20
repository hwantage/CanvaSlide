import { useRef, useState } from 'react'
import { Copy, Sparkles, X } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { aiPromptStyles, buildAiPrompt, type AiPromptStyle } from '@/lib/ai-prompt'
import { cn } from '@/lib/cn'
import { copyText } from '@/platform/text-clipboard'
import { useAiGuideStore } from '@/store/modal-dialogs'

export function AiGuideDialog() {
  const open = useAiGuideStore((s) => s.open)
  return open ? <AiGuideContent /> : null
}

function AiGuideContent() {
  const hide = useAiGuideStore((s) => s.hide)
  const [style, setStyle] = useState<AiPromptStyle>('general')
  const [includeHtml, setIncludeHtml] = useState(false)
  const [pending, setPending] = useState(false)
  const [copyResult, setCopyResult] = useState<{
    prompt: string
    state: 'copied' | 'failed'
  } | null>(null)
  const copying = useRef(false)
  const prompt = buildAiPrompt(style, includeHtml)
  const copyState = pending ? 'copying' : copyResult?.prompt === prompt ? copyResult.state : 'idle'
  const title = t('aiGuide.title', { app: 'CanvaSlide' })

  const copy = async () => {
    if (copying.current) {
      return
    }
    copying.current = true
    setPending(true)
    try {
      await copyText(prompt)
      setCopyResult({ prompt, state: 'copied' })
    } catch {
      setCopyResult({ prompt, state: 'failed' })
    } finally {
      copying.current = false
      setPending(false)
    }
  }

  return (
    <ModalDialog
      label={title}
      onClose={hide}
      className="flex max-h-[85vh] w-[42rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto"
    >
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="shrink-0 text-selection" aria-hidden />
        <h2 className="flex-1 text-base font-semibold">{title}</h2>
        <IconButton label={t('aiGuide.close')} onClick={hide}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('aiGuide.description')}</p>
      <div role="radiogroup" aria-label={t('aiGuide.style')} className="flex gap-1">
        {aiPromptStyles.map((value) => (
          <label key={value} className="relative cursor-default">
            <input
              type="radio"
              name="ai-guide-style"
              value={value}
              checked={style === value}
              onChange={() => {
                setStyle(value)
                setCopyResult(null)
              }}
              className="peer absolute inset-0 h-full w-full cursor-default opacity-0"
            />
            <span
              className={cn(
                'pointer-events-none flex h-7 items-center rounded-md border px-2.5 text-xs transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                style === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background peer-hover:bg-accent'
              )}
            >
              {t(`aiGuide.style.${value}`)}
            </span>
          </label>
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <label htmlFor="ai-guide-prompt" className="text-xs font-medium">
          {t('aiGuide.example', { app: 'CanvaSlide' })}
        </label>
        <textarea
          id="ai-guide-prompt"
          readOnly
          value={prompt}
          spellCheck={false}
          className="h-64 min-h-24 w-full resize-none select-text rounded-md border border-input bg-background p-3 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeHtml}
          onChange={(event) => {
            setIncludeHtml(event.target.checked)
            setCopyResult(null)
          }}
        />
        {t('aiGuide.includeHtml', { format: 'HTML' })}
      </label>
      <TextButton
        variant="primary"
        className="h-10 shrink-0 justify-center text-sm"
        disabled={copyState === 'copying'}
        onClick={() => void copy()}
      >
        <Copy size={16} aria-hidden />
        {t(copyState === 'copying' ? 'aiGuide.copying' : 'aiGuide.copy')}
      </TextButton>
      <p
        role="status"
        className={
          copyState === 'idle' ? 'sr-only' : 'text-xs leading-relaxed text-muted-foreground'
        }
      >
        {copyState === 'idle' ? '' : t(`aiGuide.${copyState}`)}
      </p>
    </ModalDialog>
  )
}
