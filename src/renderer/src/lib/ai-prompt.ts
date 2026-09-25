import { t as appT, type UiStringKey } from '../i18n/ui-strings'
import type { Translator } from '../i18n/translator'

export const aiAuthoringSkillUrl =
  'https://github.com/hwantage/CanvaSlide/blob/main/skills/canvaslide/SKILL.md'

export const aiPromptStyles = ['general', 'dynamic'] as const
export type AiPromptStyle = (typeof aiPromptStyles)[number]

/** `t` defaults to the app's language; the website passes its own. */
export function buildAiPrompt(
  style: AiPromptStyle,
  includeHtml = false,
  t: Translator<UiStringKey>['t'] = appT
): string {
  const prompt = t(`aiGuide.prompt.${style}`, {
    website: 'https://hwantage.github.io/CanvaSlide/',
    app: 'CanvaSlide',
    file: 'canvaslide-introduction.canvaslide',
    skill: aiAuthoringSkillUrl
  })
  return includeHtml ? `${prompt}\n\n${t('aiGuide.prompt.html', { format: 'HTML' })}` : prompt
}
