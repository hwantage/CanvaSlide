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
import { currentLocale, t, tn, type UiStringKey } from '@/i18n/ui-strings'
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
  isRecoveryFailure,
  selectRecoveryEnabled,
  selectRecoveryOffers,
  selectRecoveryStatus,
  useRecoveryStore,
  type RecoveryStatus
} from '@/store/recovery-store'
import {
  selectThemePreference,
  themePreferences,
  useThemeStore,
  type ThemePreference
} from '@/store/theme-store'

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
    <Tag className="flex flex-wrap items-center gap-3 text-xs">
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
/** What each recovery state says for itself; the three failures read as warnings. */
const recoveryStatusLabels: Record<RecoveryStatus, UiStringKey> = {
  off: 'settings.recoveryOffHint',
  unsupported: 'recovery.unsupportedError',
  idle: 'settings.recoveryIdle',
  saved: 'settings.recoverySaved',
  quota: 'recovery.quotaError',
  unavailable: 'recovery.unavailableError',
  failed: 'recovery.failedError'
}
const recoveryChoices = [
  { value: 'on', label: 'settings.recoveryOn' },
  { value: 'off', label: 'settings.recoveryOff' }
] as const

/** Where unsaved work is copied to, whether that is happening, and the switch that stops it. */
function RecoverySettings() {
  const enabled = useRecoveryStore(selectRecoveryEnabled)
  const setEnabled = useRecoveryStore((s) => s.setEnabled)
  const status = useRecoveryStore(selectRecoveryStatus)
  const savedAt = useRecoveryStore((s) => s.savedAt)
  const error = useRecoveryStore((s) => s.error)
  const location = useRecoveryStore((s) => s.location)
  const waiting = useRecoveryStore(selectRecoveryOffers)
  const review = useRecoveryStore((s) => s.reviewOffers)
  const hide = useSettingsDialogStore((s) => s.hide)
  const scanError = useRecoveryStore((s) => s.scanError)
  // Why busy too: a scan cannot start while an offer is being restored or discarded.
  const scanning = useRecoveryStore((s) => s.scanning || s.busy)
  const retry = useRecoveryStore((s) => s.initialize)
  const failed = isRecoveryFailure(status)

  return (
    <>
      <Row label={t('settings.recoveryAutosave')}>
        <SegmentedControl
          label={t('settings.recoveryPreference')}
          value={enabled ? 'on' : 'off'}
          options={recoveryChoices.map((choice) => ({
            value: choice.value,
            label: t(choice.label)
          }))}
          onChange={(choice) => setEnabled(choice === 'on')}
        />
      </Row>
      <Row label={t('settings.recoveryLocation')}>
        <span className="min-w-0 flex-1 break-all text-[11px] text-muted-foreground">
          {location === null
            ? t('settings.recoveryLocationUnknown')
            : location.kind === 'directory'
              ? location.path
              : t('settings.recoveryBrowser')}
        </span>
      </Row>
      <p
        data-testid="recovery-status"
        className={`text-[11px] ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {t(recoveryStatusLabels[status], {
          time: savedAt === null ? '' : new Date(savedAt).toLocaleTimeString(currentLocale()),
          message: error ?? ''
        })}
      </p>
      {scanError && (
        <p role="alert" className="text-xs text-destructive">
          {t('recovery.scanError')}
        </p>
      )}
      <TextButton disabled={scanning} onClick={() => void retry()}>
        {t('recovery.retryScan')}
      </TextButton>
      {waiting.length > 0 && (
        // Restoring can only hand back one document, so the rest are picked up from here.
        <Row label={t('settings.recoveryWaitingLabel')}>
          <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {tn('settings.recoveryWaiting', waiting.length)}
          </span>
          <TextButton
            onClick={() => {
              hide()
              review()
            }}
          >
            {t('settings.recoveryReview')}
          </TextButton>
        </Row>
      )}
      <p className="text-[11px] text-muted-foreground">{t('settings.recoveryHint')}</p>
    </>
  )
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
      </Section>
      <Section title={t('settings.recovery')}>
        <RecoverySettings />
      </Section>
      <div className="flex justify-end">
        <TextButton variant="primary" onClick={hide}>
          {t('settings.done')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}
