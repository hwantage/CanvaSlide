import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { t } from '@/i18n/ui-strings'
import { altLabel, primaryModifierLabel, shiftLabel, shortcutLabel } from '@/lib/platform-keys'
import { useShortcutHelpStore } from '@/store/modal-dialogs'

type Row = [label: string, keys: string]
type Section = { title: string; rows: Row[] }

function sections(): Section[] {
  const mod = primaryModifierLabel()
  const shift = shiftLabel()
  const alt = altLabel()
  const drag = t('help.drag')
  return [
    {
      title: t('help.tools'),
      rows: [
        [t('tool.select'), 'V'],
        [t('tool.hand'), 'H'],
        [t('help.pan'), 'Space'],
        [t('tool.text'), 'T'],
        [t('tool.rectangle'), 'R'],
        [t('tool.ellipse'), 'O'],
        [t('tool.diamond'), 'D'],
        [t('tool.frame'), 'F'],
        [t('tool.connector'), 'L'],
        [t('help.constrainShape'), `${shift}${drag}`]
      ]
    },
    {
      title: t('help.edit'),
      rows: [
        [t('edit.undo'), shortcutLabel('Z')],
        [t('edit.redo'), shortcutLabel('Z', { shift: true })],
        [t('edit.cut'), shortcutLabel('X')],
        [t('edit.copy'), shortcutLabel('C')],
        [t('edit.paste'), shortcutLabel('V')],
        [t('help.pasteText'), shortcutLabel('V')],
        [t('edit.duplicate'), shortcutLabel('D')],
        [t('edit.delete'), 'Del'],
        [t('edit.selectAll'), shortcutLabel('A')],
        [t('help.addToSelection'), `${shift}Click / ${mod}Click`],
        [t('edit.editText'), '⏎'],
        [t('edit.renameFrame'), 'F2'],
        [t('edit.copyStyle'), shortcutLabel('C', { alt: true })],
        [t('edit.pasteStyle'), shortcutLabel('V', { alt: true })],
        [t('help.contextMenu'), t('help.rightClick')]
      ]
    },
    {
      title: t('help.arrange'),
      rows: [
        [t('help.nudge'), '← → ↑ ↓'],
        [t('help.constrainMove'), `${shift}${drag}`],
        [t('help.dragDuplicate'), `${alt}${drag}`],
        [t('help.disableSnap'), `${mod}${drag}`],
        [t('order.front'), shortcutLabel(']', { shift: true })],
        [t('order.forward'), shortcutLabel(']')],
        [t('order.backward'), shortcutLabel('[')],
        [t('order.back'), shortcutLabel('[', { shift: true })],
        [t('selection.frame'), shortcutLabel('F', { shift: true })],
        [t('edit.group'), shortcutLabel('G')],
        [t('edit.ungroup'), shortcutLabel('G', { shift: true })]
      ]
    },
    {
      title: t('help.view'),
      rows: [
        [t('zoom.in'), shortcutLabel('+')],
        [t('zoom.out'), shortcutLabel('-')],
        [t('zoom.reset'), shortcutLabel('0')],
        [t('zoom.fit'), `${shift}1`],
        [t('selection.zoom'), `${shift}2`],
        [t('help.zoomWheel'), `${mod}${t('help.wheel')}`],
        [t('help.dropImage'), t('help.drag')]
      ]
    },
    {
      title: t('help.file'),
      rows: [
        [t('file.new'), shortcutLabel('N')],
        [t('file.open'), shortcutLabel('O')],
        [t('file.save'), shortcutLabel('S')],
        [t('file.saveAs'), shortcutLabel('S', { shift: true })],
        [t('import.files'), shortcutLabel('I')],
        [t('export.title'), shortcutLabel('E')],
        [t('settings.title'), shortcutLabel(',')],
        [t('help.title'), 'K']
      ]
    },
    {
      title: t('help.present'),
      rows: [
        [t('present.start'), `${shortcutLabel('⏎')} / F5`],
        [t('present.fromSelection'), `${shortcutLabel('⏎', { shift: true })} / ${shift}F5`],
        [t('present.next'), '→ / Space'],
        [t('present.previous'), '←'],
        [t('present.overview'), 'O'],
        [t('present.pointer'), 'P'],
        [t('present.clearInk'), 'E'],
        [t('present.exit'), 'Esc']
      ]
    }
  ]
}

export function ShortcutHelpDialog() {
  const open = useShortcutHelpStore((s) => s.open)
  const hide = useShortcutHelpStore((s) => s.hide)
  if (!open) {
    return null
  }
  return (
    <ModalDialog
      label={t('help.title')}
      onClose={hide}
      className="flex max-h-[85vh] w-[44rem] max-w-[95vw] flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-sm font-semibold">{t('help.title')}</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {sections().map((section) => (
          <section key={section.title} className="flex flex-col gap-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <dl className="flex flex-col">
              {section.rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-0.5 text-xs">
                  <dt>{label}</dt>
                  <dd className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {keys}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="flex justify-end">
        <TextButton variant="primary" onClick={hide}>
          {t('settings.done')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}
