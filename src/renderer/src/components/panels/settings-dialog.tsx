import type { ReactNode } from 'react'
import {
  canvasBackgrounds,
  frameBorderStyles,
  type CanvasBackground,
  type DocumentSettings,
  type FrameBorderStyle
} from '@shared/canvas/element-types'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TextButton } from '@/components/ui/text-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { useSliderEditSession } from '@/hooks/use-slider-edit-session'
import {
  languagePreferences,
  selectLanguagePreference,
  useLanguageStore,
  type LanguagePreference
} from '@/store/language-store'
import { useSettingsDialogStore } from '@/store/modal-dialogs'
import {
  selectThemePreference,
  themePreferences,
  useThemeStore,
  type ThemePreference
} from '@/store/theme-store'
import { UpdateSection } from './update-section'

/** Document and app settings; add a <Section> per concern so the dialog grows without restructuring. */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** One labelled row; a `label` element when the control is a single input the label may own. */
function Row({
  label,
  children,
  as: Tag = 'div'
}: {
  label: string
  children: ReactNode
  as?: 'div' | 'label'
}) {
  return (
    <Tag className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
      {children}
    </Tag>
  )
}

const backgroundLabels: Record<CanvasBackground, UiStringKey> = {
  dots: 'settings.background.dots',
  grid: 'settings.background.grid',
  plain: 'settings.background.plain'
}
const themeLabels: Record<ThemePreference, UiStringKey> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark'
}
const languageLabels: Record<LanguagePreference, UiStringKey> = {
  system: 'settings.language.system',
  en: 'settings.language.en',
  ko: 'settings.language.ko'
}
const frameBorderLabels: Record<FrameBorderStyle, UiStringKey> = {
  solid: 'settings.frameBorder.solid',
  dashed: 'settings.frameBorder.dashed',
  none: 'settings.frameBorder.none'
}

export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.open)
  const hide = useSettingsDialogStore((s) => s.hide)
  const settings = useDocumentStore(selectDocument).settings
  const updateSettings = useDocumentStore((s) => s.updateSettings)
  const themePreference = useThemeStore(selectThemePreference)
  const setThemePreference = useThemeStore((s) => s.setPreference)
  const languagePreference = useLanguageStore(selectLanguagePreference)
  const setLanguagePreference = useLanguageStore((s) => s.setPreference)
  const transitionSession = useSliderEditSession()
  if (!open) {
    return null
  }
  const set = (patch: Partial<DocumentSettings>, record = true) => updateSettings(patch, record)

  return (
    <ModalDialog
      label={t('settings.title')}
      onClose={hide}
      className="flex w-[26rem] flex-col gap-4"
    >
      <h2 className="text-sm font-semibold">{t('settings.title')}</h2>
      <Section title={t('settings.appearance')}>
        <Row label={t('settings.theme')}>
          <SegmentedControl
            label={t('settings.themePreference')}
            value={themePreference}
            options={themePreferences.map((value) => ({
              value,
              label: t(themeLabels[value])
            }))}
            onChange={setThemePreference}
          />
        </Row>
        <Row label={t('settings.language')}>
          <SegmentedControl
            label={t('settings.languagePreference')}
            value={languagePreference}
            options={languagePreferences.map((value) => ({
              value,
              label: t(languageLabels[value])
            }))}
            onChange={setLanguagePreference}
          />
        </Row>
      </Section>
      <Section title={t('settings.canvas')}>
        <Row label={t('settings.background')}>
          <SegmentedControl
            label={t('settings.canvasBackground')}
            value={settings.background}
            options={canvasBackgrounds.map((value) => ({
              value,
              label: t(backgroundLabels[value])
            }))}
            onChange={(background) => set({ background })}
          />
        </Row>
      </Section>
      <Section title={t('settings.frames')}>
        <Row label={t('settings.transition')} as="label">
          <input
            type="range"
            aria-label={t('settings.transitionDuration')}
            min={0}
            max={3000}
            step={100}
            value={settings.transitionMs}
            onChange={(event) => {
              transitionSession.begin()
              set({ transitionMs: Number(event.target.value) }, false)
            }}
            onBlur={transitionSession.end}
            className="flex-1 accent-primary"
          />
          <span className="w-10 text-right tabular-nums" data-testid="transition-value">
            {t('settings.seconds', { n: (settings.transitionMs / 1000).toFixed(1) })}
          </span>
        </Row>
        <p className="text-[11px] text-muted-foreground">{t('settings.transitionHint')}</p>
        <Row label={t('settings.border')}>
          <SegmentedControl
            label={t('settings.frameBorder')}
            value={settings.frameBorder}
            options={frameBorderStyles.map((value) => ({
              value,
              label: t(frameBorderLabels[value])
            }))}
            onChange={(frameBorder) => set({ frameBorder })}
          />
        </Row>
      </Section>
      <Section title={t('update.title')}>
        <UpdateSection />
      </Section>
      <div className="flex justify-end">
        <TextButton variant="primary" onClick={hide}>
          {t('settings.done')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}
