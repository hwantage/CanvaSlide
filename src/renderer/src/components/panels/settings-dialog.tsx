import type { ReactNode } from 'react'
import { focusOnMount } from '@/lib/focus-on-mount'
import {
  canvasBackgrounds,
  frameBorderStyles,
  type CanvasBackground,
  type DocumentSettings,
  type FrameBorderStyle
} from '@shared/canvas/element-types'
import { TextButton } from '@/components/ui/text-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { useSettingsDialogStore } from '@/store/settings-dialog-store'
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

function Choice<T extends string>({
  name,
  value,
  options,
  onChange
}: {
  name: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`h-7 rounded-md border px-2.5 text-xs transition-colors ${
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background hover:bg-accent'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
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
  if (!open) {
    return null
  }
  const set = (patch: Partial<DocumentSettings>) => updateSettings(patch)
  const seconds = (settings.transitionMs / 1000).toFixed(1)

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t('settings.title')}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={hide}
    >
      <div
        className="flex w-[26rem] flex-col gap-4 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        ref={focusOnMount}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">{t('settings.title')}</h2>
        <Section title={t('settings.appearance')}>
          <div className="flex items-center gap-3 text-xs">
            <span className="w-24 text-muted-foreground">{t('settings.theme')}</span>
            <Choice
              name={t('settings.themePreference')}
              value={themePreference}
              options={themePreferences.map((value) => ({
                value,
                label: t(themeLabels[value])
              }))}
              onChange={setThemePreference}
            />
          </div>
        </Section>
        <Section title={t('settings.slideShow')}>
          <label className="flex items-center gap-3 text-xs">
            <span className="w-24 text-muted-foreground">{t('settings.transition')}</span>
            <input
              type="range"
              aria-label={t('settings.transitionDuration')}
              min={0}
              max={3000}
              step={100}
              value={settings.transitionMs}
              onChange={(event) => set({ transitionMs: Number(event.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="w-10 text-right tabular-nums" data-testid="transition-value">
              {t('settings.seconds', { n: seconds })}
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground">{t('settings.transitionHint')}</p>
        </Section>
        <Section title={t('settings.canvas')}>
          <div className="flex items-center gap-3 text-xs">
            <span className="w-24 text-muted-foreground">{t('settings.background')}</span>
            <Choice
              name={t('settings.canvasBackground')}
              value={settings.background}
              options={canvasBackgrounds.map((value) => ({
                value,
                label: t(backgroundLabels[value])
              }))}
              onChange={(background) => set({ background })}
            />
          </div>
        </Section>
        <Section title={t('settings.frames')}>
          <div className="flex items-center gap-3 text-xs">
            <span className="w-24 text-muted-foreground">{t('settings.border')}</span>
            <Choice
              name={t('settings.frameBorder')}
              value={settings.frameBorder}
              options={frameBorderStyles.map((value) => ({
                value,
                label: t(frameBorderLabels[value])
              }))}
              onChange={(frameBorder) => set({ frameBorder })}
            />
          </div>
        </Section>
        <Section title={t('update.title')}>
          <UpdateSection />
        </Section>
        <div className="flex justify-end">
          <TextButton variant="primary" onClick={hide}>
            {t('settings.done')}
          </TextButton>
        </div>
      </div>
    </div>
  )
}
