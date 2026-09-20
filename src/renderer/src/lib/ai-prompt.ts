import { t } from '@/i18n/ui-strings'
import { REPOSITORY_URL } from '@/platform/external-links'

export const aiPromptStyles = ['general', 'dynamic'] as const
export type AiPromptStyle = (typeof aiPromptStyles)[number]

export function buildAiPrompt(style: AiPromptStyle, includeHtml = false): string {
  const prompt = t(`aiGuide.prompt.${style}`, {
    website: 'https://hwantage.github.io/CanvaSlide/',
    app: 'CanvaSlide',
    file: 'canvaslide-introduction.canvaslide',
    skill: `${REPOSITORY_URL}/blob/main/skills/canvaslide/SKILL.md`
  })
  return includeHtml ? `${prompt}\n\n${t('aiGuide.prompt.html', { format: 'HTML' })}` : prompt
}
