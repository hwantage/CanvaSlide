import { useRef, useState } from 'react'
import { ArrowUpRight, Copy } from 'lucide-react'
import { t } from '@app/i18n/ui-strings'
import {
  aiAuthoringSkillUrl,
  aiPromptStyles,
  buildAiPrompt,
  type AiPromptStyle
} from '@app/lib/ai-prompt'

export function DocsAiPrompt() {
  const [style, setStyle] = useState<AiPromptStyle>('general')
  const [includeHtml, setIncludeHtml] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ prompt: string; state: 'copied' | 'failed' } | null>(null)
  const copying = useRef(false)
  const prompt = buildAiPrompt(style, includeHtml)
  const status = pending ? 'copying' : result?.prompt === prompt ? result.state : 'idle'

  async function copy() {
    if (copying.current) {
      return
    }
    copying.current = true
    setPending(true)
    try {
      await navigator.clipboard.writeText(prompt)
      setResult({ prompt, state: 'copied' })
    } catch {
      setResult({ prompt, state: 'failed' })
    } finally {
      copying.current = false
      setPending(false)
    }
  }

  return (
    <div className="docs-ai-prompt">
      <p>{t('aiGuide.description')}</p>
      <div className="prompt-styles" role="radiogroup" aria-label={t('aiGuide.style')}>
        {aiPromptStyles.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="docs-ai-style"
              value={value}
              checked={style === value}
              onChange={() => {
                setStyle(value)
                setResult(null)
              }}
            />
            <span>{t(`aiGuide.style.${value}`)}</span>
          </label>
        ))}
      </div>
      <label htmlFor="docs-ai-prompt">{t('aiGuide.example', { app: 'CanvaSlide' })}</label>
      <textarea id="docs-ai-prompt" readOnly value={prompt} spellCheck={false} />
      <label className="prompt-html-option">
        <input
          type="checkbox"
          checked={includeHtml}
          onChange={(event) => {
            setIncludeHtml(event.target.checked)
            setResult(null)
          }}
        />
        {t('aiGuide.includeHtml', { format: 'HTML' })}
      </label>
      <div className="prompt-actions">
        <button type="button" className="button" disabled={pending} onClick={() => void copy()}>
          <Copy size={16} aria-hidden />
          {t(pending ? 'aiGuide.copying' : 'aiGuide.copy')}
        </button>
        <a className="doc-text-link" href={aiAuthoringSkillUrl} target="_blank" rel="noreferrer">
          {t('site.docs.ai.skill')}
          <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
      <p role="status" className="copy-status">
        {status === 'idle' ? '' : t(`aiGuide.${status}`)}
      </p>
    </div>
  )
}
