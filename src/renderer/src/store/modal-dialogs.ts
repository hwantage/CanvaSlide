import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { defaultExportFormat, type ExportFormat } from '@/lib/export-format'

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

/** The export dialog also carries the format it is showing, so a caller can open it on one. */
export type ExportDialogStore = Omit<DialogStore, 'show'> & {
  format: ExportFormat
  /** Opens the dialog; without a format it reopens on whichever one was last used. */
  show: (format?: ExportFormat) => void
}

export const useExportDialogStore = create<ExportDialogStore>()((set) => ({
  open: false,
  format: defaultExportFormat,
  show: (format) => set(format ? { open: true, format } : { open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open }))
}))

export const useSettingsDialogStore = createDialogStore()
export const useShortcutHelpStore = createDialogStore()
export const useAboutDialogStore = createDialogStore()
export const useAiGuideStore = createDialogStore()
