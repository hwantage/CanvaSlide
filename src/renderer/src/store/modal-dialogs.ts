import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { useFigImportStore } from './fig-import-store'
import { useCloudShareStore } from './cloud-share-store'

export type DialogStore = {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
}

function createDialogStore(): UseBoundStore<StoreApi<DialogStore>> {
  return create<DialogStore>()((set) => ({
    open: false,
    show: () => set({ open: true }),
    hide: () => set({ open: false }),
    toggle: () => set((s) => ({ open: !s.open }))
  }))
}

export const useExportDialogStore = createDialogStore()
export const useSettingsDialogStore = createDialogStore()
export const useShortcutHelpStore = createDialogStore()
export const useAboutDialogStore = createDialogStore()
export const useAiGuideStore = createDialogStore()

/** Every modal that blocks canvas shortcuts while open, and that Escape closes. */
const modalDialogs = [
  useExportDialogStore,
  useSettingsDialogStore,
  useShortcutHelpStore,
  useAboutDialogStore,
  useAiGuideStore,
  useCloudShareStore,
  useFigImportStore
]

export function isModalDialogOpen(): boolean {
  return modalDialogs.some((dialog) => dialog.getState().open)
}

export function closeModalDialogs(): void {
  for (const dialog of modalDialogs) {
    dialog.getState().hide()
  }
}
