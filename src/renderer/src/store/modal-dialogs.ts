import { useExportDialogStore } from './export-dialog-store'
import { useSettingsDialogStore } from './settings-dialog-store'
import { useShortcutHelpStore } from './shortcut-help-store'

/** Every modal that should block canvas shortcuts while open. */
export function isModalDialogOpen(): boolean {
  return (
    useSettingsDialogStore.getState().open ||
    useExportDialogStore.getState().open ||
    useShortcutHelpStore.getState().open
  )
}

export function closeModalDialogs(): void {
  useSettingsDialogStore.getState().hide()
  useExportDialogStore.getState().hide()
  useShortcutHelpStore.getState().hide()
}
