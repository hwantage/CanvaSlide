import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { t, type UiStringKey } from '@/i18n/ui-strings'
import { useFigImportStore } from '@/store/fig-import-store'
import type { FigWarning } from '@shared/fig/fig-types'

const warningLabels: Record<FigWarning, UiStringKey> = {
  unsupported: 'fig.warning.unsupported',
  effects: 'fig.warning.effects',
  paint: 'fig.warning.paint',
  missingImage: 'fig.warning.missingImage',
  text: 'fig.warning.text',
  mask: 'fig.warning.mask'
}

export function FigImportDialog() {
  const open = useFigImportStore((s) => s.open)
  const phase = useFigImportStore((s) => s.phase)
  const name = useFigImportStore((s) => s.name)
  const pages = useFigImportStore((s) => s.pages)
  const selected = useFigImportStore((s) => s.selected)
  const mode = useFigImportStore((s) => s.mode)
  const summary = useFigImportStore((s) => s.summary)
  const error = useFigImportStore((s) => s.error)
  const hide = useFigImportStore((s) => s.hide)
  const select = useFigImportStore((s) => s.select)
  const setMode = useFigImportStore((s) => s.setMode)
  const convert = useFigImportStore((s) => s.convert)
  if (!open) {
    return null
  }
  const importablePages = pages.filter((page) => page.count > 0).map((page) => page.id)
  const errorKey: UiStringKey =
    error === 'FIG_LIMIT'
      ? 'fig.error.limit'
      : error === 'FIG_EMPTY'
        ? 'fig.error.empty'
        : error === 'FIG_DOCUMENT_CHANGED'
          ? 'fig.error.changed'
          : 'fig.error.invalid'
  const formatHint = t('fig.formatHint', { product: 'Figma' })
  return (
    <ModalDialog
      label={t('fig.title', { product: 'Figma' })}
      onClose={hide}
      className="w-[28rem] max-w-[calc(100vw-2rem)]"
    >
      <h2 className="text-sm font-semibold">{t('fig.title', { product: 'Figma' })}</h2>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={name}>
        {name}
      </p>
      {(phase === 'reading' || phase === 'converting') && (
        <p className="mt-4 text-sm" role="status">
          {t(phase === 'reading' ? 'fig.reading' : 'fig.converting')}
        </p>
      )}
      {phase === 'ready' && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium">{t('fig.pages')}</span>
            <TextButton
              variant="ghost"
              onClick={() =>
                select(selected.length === importablePages.length ? [] : importablePages)
              }
            >
              {t('fig.selectAll')}
            </TextButton>
          </div>
          <fieldset
            aria-label={t('fig.pages')}
            className="mt-1 max-h-56 overflow-y-auto rounded border border-border p-2"
          >
            {pages.map((page) => (
              <label key={page.id} className="flex cursor-pointer items-start gap-2 py-1 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={page.count === 0}
                  checked={selected.includes(page.id)}
                  onChange={(event) =>
                    select(
                      event.target.checked
                        ? [...selected, page.id]
                        : selected.filter((id) => id !== page.id)
                    )
                  }
                />
                <span>
                  {page.name}
                  <span className="ml-2 text-muted-foreground">
                    {t('fig.layers', { n: page.count })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="mt-3 space-y-2 text-xs">
            <legend className="mb-2 font-medium">{t('fig.mode')}</legend>
            {(['editable', 'appearance'] as const).map((value) => (
              <label key={value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="fig-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span>
                  <span className="font-medium">
                    {t(value === 'editable' ? 'fig.editable' : 'fig.appearance')}
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {t(value === 'editable' ? 'fig.editableHint' : 'fig.appearanceHint')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-xs text-muted-foreground">{t('fig.limitations')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatHint}</p>
        </>
      )}
      {phase === 'error' && (
        <>
          <p className="mt-4 text-sm text-destructive" role="alert">
            {t(errorKey)}
          </p>
          {errorKey === 'fig.error.invalid' && (
            <p className="mt-1 text-xs text-muted-foreground">{formatHint}</p>
          )}
        </>
      )}
      {phase === 'done' && summary && (
        <div className="mt-4 text-xs" role="status">
          <p className="font-medium">
            {t('fig.done', { pages: summary.pages, elements: summary.elements })}
          </p>
          <p className="mt-1 text-muted-foreground">{t('fig.doneHint')}</p>
          {mode === 'editable' && (
            <p className="mt-1 text-muted-foreground">{t('fig.doneText', { n: summary.texts })}</p>
          )}
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {(Object.entries(summary.warnings) as [FigWarning, number][])
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <li key={key}>{t(warningLabels[key], { n: count })}</li>
              ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <TextButton variant="ghost" onClick={hide}>
          {t(phase === 'done' || phase === 'error' ? 'fig.close' : 'export.cancel')}
        </TextButton>
        {phase === 'ready' && (
          <TextButton variant="primary" disabled={selected.length === 0} onClick={convert}>
            {t('fig.confirm')}
          </TextButton>
        )}
      </div>
    </ModalDialog>
  )
}
