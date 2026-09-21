import { t } from '../i18n/ui-strings'

export const aiAuthoringSkillUrl =
  'https://github.com/hwantage/CanvaSlide/blob/main/skills/canvaslide/SKILL.md'

export const aiPromptStyles = ['general', 'dynamic'] as const
export type AiPromptStyle = (typeof aiPromptStyles)[number]

export function buildAiPrompt(style: AiPromptStyle, includeHtml = false): string {
  const prompt = t(`aiGuide.prompt.${style}`, {
    website: 'https://hwantage.github.io/CanvaSlide/',
    app: 'CanvaSlide',
    file: 'canvaslide-introduction.canvaslide',
    skill: aiAuthoringSkillUrl
  })
  return includeHtml ? `${prompt}\n\n${t('aiGuide.prompt.html', { format: 'HTML' })}` : prompt
}
